import { useEffect, useRef } from "react";
import type { Story, StoryDefault } from "@ladle/react";
import { AnagramOverlay } from "./AnagramOverlay.tsx";
import { useAnagramPool } from "../hooks/useAnagramPool.ts";

export default {
  title: "Anagram / Overlay",
} satisfies StoryDefault;

export const Default: Story = () => {
  const pool = useAnagramPool(true);
  const seeded = useRef(false);
  const { add } = pool;
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    for (const ch of "SILENT") add(ch);
  }, [add]);
  return (
    <>
      <p style={{ maxWidth: 560, color: "var(--muted)", fontSize: 14 }}>
        The mobile stand-in for the anagram helper — it covers the grid area
        (a positioned parent here). While it's open, typing on a physical
        keyboard feeds the letter pool.
      </p>
      <div style={{ position: "relative", height: 420, maxWidth: 560 }}>
        <AnagramOverlay pool={pool} />
      </div>
    </>
  );
};
