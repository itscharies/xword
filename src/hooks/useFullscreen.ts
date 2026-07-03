import { useCallback, useEffect, useState } from "react";

/** Tracks and toggles the browser's fullscreen state for the whole page.
 *  Listens for `fullscreenchange` so the toggle stays in sync when the user
 *  exits fullscreen with Esc instead of the button. */
export function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(() => !!document.fullscreenElement);

  useEffect(() => {
    // Mirrors the [data-theme]/[data-accent] pattern (see lib/theme.ts) so
    // CSS can grow the layout to fill the extra room fullscreen frees up.
    const onChange = () => {
      const full = !!document.fullscreenElement;
      setIsFullscreen(full);
      if (full) document.documentElement.dataset.fullscreen = "true";
      else delete document.documentElement.dataset.fullscreen;
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggle = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen();
    }
  }, []);

  return { isFullscreen, toggle };
}
