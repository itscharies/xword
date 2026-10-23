// Service worker registration and the "a new version is ready" pub-sub
// consumed by components/UpdateToast.tsx. See public/sw.js for the precache
// logic this manages the client side of, and scripts/build-sw.ts for how the
// asset list + version get stamped into the worker at build time.
//
// Every step of the update handshake is also appended to a small persisted
// log (readSwLog, shown under Settings → App version) — the handshake has
// failed silently on iOS before, and without a trace on the device there is
// no way to tell "activation never happened" from "a new build arrived".

import { flushPendingPushes } from "./sync.ts";

const SHELL_PREFIX = "xword-shell-";
const UPDATE_CHECK_THROTTLE_MS = 60_000;
// How long a Reload tap waits for the new worker to take over before giving
// up and reloading anyway. Generous: on iOS the worker process is usually
// suspended and has to be woken before it can even see the message.
const TAP_ACTIVATION_TIMEOUT_MS = 20_000;
// The launch-time silent apply waits less — there's a user staring at a
// freshly opened app — and falls back to the toast rather than a reload.
const LAUNCH_ACTIVATION_TIMEOUT_MS = 8_000;
// Don't retry the silent apply within this window: if it just failed (or a
// reload came back with the worker still waiting) offer the toast instead
// of reloading the app in a loop.
const LAUNCH_RETRY_GUARD_MS = 2 * 60_000;
const LAUNCH_GUARD_KEY = "xword-sw-launch-apply-at";
const LOG_KEY = "xword-sw-log";
const LOG_MAX = 80;

type Listener = () => void;
const listeners = new Set<Listener>();
let available = false;
let registration: ServiceWorkerRegistration | null = null;
let lastUpdateCheck = 0;

export function onUpdateAvailable(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function isUpdateAvailable(): boolean {
  return available;
}

function notify(): void {
  available = true;
  for (const listener of listeners) listener();
}

// ---------------------------------------------------------------------------
// Persisted handshake log

export interface SwLogEntry {
  /** Epoch ms. */
  t: number;
  msg: string;
}

const logListeners = new Set<Listener>();

export function readSwLog(): SwLogEntry[] {
  try {
    const raw = localStorage.getItem(LOG_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as SwLogEntry[]) : [];
  } catch {
    return [];
  }
}

export function clearSwLog(): void {
  try {
    localStorage.removeItem(LOG_KEY);
  } catch {
    /* storage unavailable */
  }
  for (const l of logListeners) l();
}

export function onSwLog(listener: Listener): () => void {
  logListeners.add(listener);
  return () => logListeners.delete(listener);
}

function log(msg: string): void {
  console.info(`[sw] ${msg}`);
  try {
    const entries = readSwLog();
    entries.push({ t: Date.now(), msg });
    localStorage.setItem(LOG_KEY, JSON.stringify(entries.slice(-LOG_MAX)));
  } catch {
    /* storage unavailable — the console line is all we get */
  }
  for (const l of logListeners) l();
}

function workerState(w: ServiceWorker | null): string {
  return w ? w.state : "-";
}

/** "installing/waiting/active" states in one glance, e.g. "-/installed/activated". */
export function describeRegistration(reg: ServiceWorkerRegistration | null = registration): string {
  if (!reg) return "no registration";
  return `${workerState(reg.installing)}/${workerState(reg.waiting)}/${workerState(reg.active)}`;
}

export function hasController(): boolean {
  return typeof navigator !== "undefined" && !!navigator.serviceWorker?.controller;
}

// ---------------------------------------------------------------------------
// Shell version

/** Every xword-shell-* cache version present on this device. One entry in
 *  the steady state; two while an installed-but-waiting update sits beside
 *  the active one. */
export async function getShellVersions(): Promise<string[]> {
  if (typeof caches === "undefined") return [];
  try {
    return (await caches.keys())
      .filter((k) => k.startsWith(SHELL_PREFIX))
      .map((k) => k.slice(SHELL_PREFIX.length))
      .sort();
  } catch {
    return [];
  }
}

/** The version baked into the shell cache this device holds, or null when
 *  there is no shell cache (dev, first visit, unsupported) or when it's
 *  ambiguous — an installed-but-waiting update leaves two xword-shell-*
 *  caches side by side until it activates, and nothing on the page side can
 *  tell which the active worker is serving from. */
export async function getShellVersion(): Promise<string | null> {
  const versions = await getShellVersions();
  return versions.length === 1 ? versions[0] : null;
}

// ---------------------------------------------------------------------------
// Activation handshake

/** Asks the waiting worker to skip waiting and resolves once it has taken
 *  over (controllerchange), or once it reports itself activated — WebKit has
 *  been seen to activate without ever firing controllerchange on the page.
 *  Resolves false if neither happens within `timeoutMs`. Never reloads. */
function activateWaiting(reg: ServiceWorkerRegistration, timeoutMs: number, label: string): Promise<boolean> {
  const waiting = reg.waiting;
  if (!waiting) return Promise.resolve(false);
  return new Promise((resolve) => {
    let done = false;
    let timer = 0;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      navigator.serviceWorker.removeEventListener("controllerchange", onChange);
      resolve(ok);
    };
    const onChange = () => {
      log(`${label}: controllerchange`);
      finish(true);
    };
    const onState = () => {
      log(`${label}: new worker → ${waiting.state}`);
      // Give clients.claim() a tick to fire controllerchange first.
      if (waiting.state === "activated") setTimeout(() => finish(true), 250);
      if (waiting.state === "redundant") finish(false);
    };
    navigator.serviceWorker.addEventListener("controllerchange", onChange);
    waiting.addEventListener("statechange", onState);
    timer = window.setTimeout(() => {
      log(`${label}: timed out after ${timeoutMs}ms (${describeRegistration(reg)})`);
      finish(false);
    }, timeoutMs);
    log(`${label}: posting SKIP_WAITING (${describeRegistration(reg)})`);
    waiting.postMessage({ type: "SKIP_WAITING" });
  });
}

function reloadPage(reason: string): void {
  // Empty the debounced-push queue first: sync.ts's beforeunload handler
  // would otherwise turn this reload into a "leave site?" prompt.
  flushPendingPushes();
  log(`reloading (${reason})`);
  window.location.reload();
}

/** The Reload button. Hands control to the waiting worker and reloads once
 *  it has actually taken over. Only after a long timeout does it reload
 *  regardless — the previous blind 3-second fallback raced iOS's worker
 *  wake-up, reloaded under the OLD worker, and left the update waiting to
 *  prompt again on every launch. */
export async function reloadForUpdate(): Promise<void> {
  log(`reload tapped (${describeRegistration()})`);
  const reg = registration;
  if (!reg?.waiting || !("serviceWorker" in navigator)) {
    reloadPage("nothing waiting");
    return;
  }
  const ok = await activateWaiting(reg, TAP_ACTIVATION_TIMEOUT_MS, "tap");
  reloadPage(ok ? "activated" : "activation timed out");
}

/** Asks the browser to re-fetch sw.js and compare bytes. Throttled: iOS fires
 *  visibilitychange on every app switch, and the browser already rate-limits
 *  update checks itself, so hammering it buys nothing. Rejections (offline,
 *  captive portal) are expected and uninteresting. */
function checkForUpdate(): void {
  if (!registration) return;
  const now = Date.now();
  if (now - lastUpdateCheck < UPDATE_CHECK_THROTTLE_MS) return;
  lastUpdateCheck = now;
  registration.update().catch(() => {});
}

/** Unthrottled check, for the Settings readout. Resolves with the
 *  registration state afterwards. */
export async function checkForUpdateNow(): Promise<string> {
  if (!registration) return "no registration";
  lastUpdateCheck = Date.now();
  log("manual update check");
  try {
    await registration.update();
  } catch (err) {
    log(`manual update check failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  return describeRegistration();
}

function launchApplyGuarded(): boolean {
  try {
    const at = Number(localStorage.getItem(LAUNCH_GUARD_KEY) ?? 0);
    return Date.now() - at < LAUNCH_RETRY_GUARD_MS;
  } catch {
    return false;
  }
}

function markLaunchApply(): void {
  try {
    localStorage.setItem(LAUNCH_GUARD_KEY, String(Date.now()));
  } catch {
    /* storage unavailable */
  }
}

/** An update was already installed and waiting when this page loaded —
 *  installed last session and never applied, or (iOS) never activated when
 *  the app was closed. A fresh launch has no solve in progress to disturb,
 *  so apply it silently and reload, instead of re-showing the toast on
 *  every launch. Falls back to the toast if activation doesn't happen in
 *  time or if this was already tried moments ago. */
async function applyWaitingAtLaunch(reg: ServiceWorkerRegistration): Promise<void> {
  if (launchApplyGuarded()) {
    log("launch: waiting worker, silent apply tried recently → toast");
    notify();
    return;
  }
  markLaunchApply();
  log("launch: waiting worker → silent apply");
  const ok = await activateWaiting(reg, LAUNCH_ACTIVATION_TIMEOUT_MS, "launch");
  if (ok) reloadPage("launch apply");
  else notify();
}

/** Registers public/sw.js and watches for a new version reaching "installed"
 *  while an older one is already active — that's a genuine update (as
 *  opposed to the very first install, which has no existing controller and
 *  nothing to prompt about). Deliberately never calls skipWaiting on a
 *  worker that installs mid-session: swapping cached assets out from under a
 *  live solve could be jarring, so that case waits for the reload the toast
 *  offers. Skipped entirely in dev — a service worker caching Vite's dev
 *  server would fight its own HMR. */
export function registerServiceWorker(): void {
  if (import.meta.env.DEV || typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .then(async (reg) => {
        registration = reg;
        lastUpdateCheck = Date.now();
        reg.addEventListener("updatefound", () => {
          const installing = reg.installing;
          if (!installing) return;
          log(`updatefound (controller=${hasController()})`);
          installing.addEventListener("statechange", () => {
            log(`installing worker → ${installing.state}`);
            if (installing.state === "installed" && navigator.serviceWorker.controller) {
              notify();
            }
          });
        });
        const versions = await getShellVersions();
        log(`load: ${describeRegistration(reg)} controller=${hasController()} shells=[${versions.join(", ")}]`);
        if (reg.waiting && navigator.serviceWorker.controller) await applyWaitingAtLaunch(reg);
      })
      .catch((err) => {
        log(`registration failed: ${err instanceof Error ? err.message : String(err)}`);
        console.error("[sw] registration failed", err);
      });
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") setTimeout(checkForUpdate, 1000);
  });
  window.addEventListener("online", checkForUpdate);
}
