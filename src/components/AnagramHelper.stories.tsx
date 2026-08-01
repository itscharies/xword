import { useState } from "react";
import type { Story, StoryDefault } from "@ladle/react";
import { AnagramHelper } from "./AnagramHelper.tsx";
import { useCrossword } from "../hooks/useCrossword.ts";
import { useAnagramHelperStore } from "../hooks/useAnagramPool.ts";
import { CRYPTIC_MINI } from "../stories/fixtures.ts";

export default {
  title: "Anagram / Helper",
} satisfies StoryDefault;

export const Default: Story = () => {
  const xw = useCrossword(CRYPTIC_MINI, null);
  const store = useAnagramHelperStore();
  const [open, setOpen] = useState(true);
  return (
    <>
      <p style={{ maxWidth: 560, color: "var(--muted)", fontSize: 14 }}>
        The cryptic solver's full anagram dialog for the selected clue: type
        fodder letters, arrange the tiles, and write the answer into the grid.
        Closing keeps the working state per clue.
      </p>
      <button className="btn" onClick={() => setOpen(true)}>
        Open anagram helper
      </button>
      {open && <AnagramHelper xw={xw} store={store} onClose={() => setOpen(false)} />}
    </>
  );
};
