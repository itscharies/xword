import { useEffect, useRef } from "react";

/** Toggles a "stuck" class on the element while its top edge is pinned to
 *  the viewport top (its position: sticky actually engaged, or it's riding
 *  at the top of a pinned container). Lets CSS scope styles to that state —
 *  the mobile action bar uses it to take on the status-bar safe-area inset
 *  only while it really sits under the status bar (installed PWA), instead
 *  of carrying it as a permanent dead gap below the header.
 *
 *  A scroll listener rather than an IntersectionObserver: with a rootMargin
 *  the observed ratio rounds to just under 1, so a threshold-1 crossing
 *  back to "fully visible" never fires and the class would stick on. */
export function useStuck<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () =>
      el.classList.toggle("stuck", el.getBoundingClientRect().top <= 1);
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);
  return ref;
}
