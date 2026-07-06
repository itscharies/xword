import { useEffect } from "react";

/** Holds a screen wake lock while the component is mounted, so the device
 *  doesn't dim and sleep mid-solve. The browser silently releases the lock
 *  whenever the tab is hidden (app switch, screen off), so it's re-acquired
 *  when the tab becomes visible again. No-ops where the API is unavailable
 *  (old browsers, insecure contexts) or refused (e.g. low-power mode) —
 *  everything else works the same, the screen just sleeps as usual. */
export function useWakeLock() {
  useEffect(() => {
    if (!("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let disposed = false;

    const acquire = async () => {
      try {
        const l = await navigator.wakeLock.request("screen");
        if (disposed) void l.release();
        else lock = l;
      } catch {
        /* refused — not worth surfacing */
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") void acquire();
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibility);
      lock?.release().catch(() => {});
    };
  }, []);
}
