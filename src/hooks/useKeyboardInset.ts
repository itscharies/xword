import { useEffect, useState } from "react";

/**
 * How much of the layout viewport's bottom edge is currently covered by the
 * on-screen keyboard, in pixels (0 when it's closed or unsupported).
 *
 * CSS alone (position: sticky, dvh/svh units, interactive-widget meta)
 * doesn't reliably track this on iOS Safari — the visual viewport shrinks
 * but the layout the rest of our CSS reasons about doesn't always follow,
 * so a sticky/fixed element computed against the wrong one either leaves a
 * gap or ends up hidden behind the keyboard. Measuring window.visualViewport
 * directly against the layout viewport's own height sidesteps needing to
 * know which mode the browser is actually in.
 */
export function useKeyboardInset(enabled: boolean): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      const covered = document.documentElement.clientHeight - vv.height - vv.offsetTop;
      setInset(Math.max(0, Math.round(covered)));
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, [enabled]);

  // Nothing to reset to on disable — the composer that reads this unmounts
  // (or stops being fixed-positioned) along with `enabled` going false.
  return enabled ? inset : 0;
}
