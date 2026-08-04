import { useEffect, useRef } from "react";
import type { Story, StoryDefault } from "@ladle/react";
import { AnagramTiles } from "./AnagramTiles.tsx";
import { useAnagramPool, type AnagramPool } from "../hooks/useAnagramPool.ts";
import { Note } from "../stories/helpers.tsx";

export default {
  title: "Anagram / Tiles",
} satisfies StoryDefault;

/** The real pool hook, pre-seeded so the story doesn't open empty. */
function useSeededPool(letters: string): AnagramPool {
  const pool = useAnagramPool(true);
  const seeded = useRef(false);
  const { add } = pool;
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    for (const ch of letters) add(ch);
  }, [letters, add]);
  return pool;
}

const PoolStory = ({ view }: { view: "circle" | "grid" }) => {
  const pool = useSeededPool("LISTEN");
  return (
    <>
      <Note>
        Drag tiles to reorder, double-tap/click one to lock it in place
        (locked tiles survive shuffles).
      </Note>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button className="btn" onClick={pool.shuffle}>
          Shuffle
        </button>
        <button className="btn" onClick={pool.backspace}>
          Remove last
        </button>
      </div>
      <div style={{ maxWidth: 420 }}>
        <AnagramTiles
          tiles={pool.tiles}
          view={view}
          onReorder={pool.reorder}
          onToggleLock={pool.toggleLock}
          emptyText="add letters to anagram"
        />
      </div>
    </>
  );
};

export const Circle: Story = () => <PoolStory view="circle" />;

export const Grid: Story = () => <PoolStory view="grid" />;
