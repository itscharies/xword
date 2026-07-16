// Best-effort "unsaved changes" guard for in-app navigation. A view with
// work that would be lost (the builder — nothing there is persisted until
// saved as a draft) registers a guard; App.tsx consults it before acting on
// goTo() links and browser back/forward. The native beforeunload dialog for
// reload/close is the view's own responsibility — this only covers SPA
// navigation, which beforeunload can't see.

let guard: (() => boolean) | null = null;

/** Register (or clear, with null) the active leave guard. The guard returns
 *  true to allow the navigation — typically via window.confirm. */
export function setLeaveGuard(g: (() => boolean) | null): void {
  guard = g;
}

/** True when navigation may proceed (no guard registered, or it consented). */
export function confirmLeave(): boolean {
  return !guard || guard();
}
