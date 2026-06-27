import { useEffect, useRef, useState } from "react";

/**
 * A second-resolution stopwatch. Ticks while `running` is true and the tab is
 * visible; pauses automatically when the tab is hidden. `initial` seeds the
 * elapsed count (e.g. restored from saved progress).
 */
export function useTimer(running: boolean, initial = 0) {
  const [elapsed, setElapsed] = useState(initial);
  const seededFor = useRef<number | null>(null);

  // Re-seed when a different initial value arrives (switching puzzles).
  if (seededFor.current !== initial) {
    seededFor.current = initial;
  }

  useEffect(() => {
    setElapsed(initial);
  }, [initial]);

  useEffect(() => {
    if (!running) return;
    let id: number | undefined;

    const start = () => {
      if (id === undefined) {
        id = window.setInterval(() => setElapsed((e) => e + 1), 1000);
      }
    };
    const stop = () => {
      if (id !== undefined) {
        window.clearInterval(id);
        id = undefined;
      }
    };

    const onVisibility = () => {
      if (document.hidden) stop();
      else start();
    };

    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [running]);

  return { elapsed, setElapsed };
}

export function formatTime(totalSeconds: number): string {
  const s = Math.floor(totalSeconds % 60);
  const m = Math.floor((totalSeconds / 60) % 60);
  const h = Math.floor(totalSeconds / 3600);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
