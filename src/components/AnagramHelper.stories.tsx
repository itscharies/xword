import { useState } from "react";
import type { Story, StoryDefault } from "@ladle/react";
import { AnagramHelper } from "./AnagramHelper.tsx";
import { Grid } from "./Grid.tsx";
import { useCrossword } from "../hooks/useCrossword.ts";
import { useAnagramHelperStore } from "../hooks/useAnagramPool.ts";
import { CRYPTIC_MINI } from "../stories/fixtures.ts";
import { Note, WithGrid } from "../stories/helpers.tsx";

export default {
  title: "Anagram / Helper",
} satisfies StoryDefault;

export const Default: Story = () => {
  const xw = useCrossword(CRYPTIC_MINI, null);
  const store = useAnagramHelperStore();
  const [open, setOpen] = useState(true);
  return (
    <>
      <Note>
        The cryptic solver's full anagram dialog for the selected clue: type
        fodder letters, arrange the tiles, and write the answer into the grid
        behind it — close the dialog to see it land. Closing keeps the
        working state per clue.
      </Note>
      <WithGrid>
        <button className="btn" onClick={() => setOpen(true)}>
          Open anagram helper
        </button>
        <Grid puzzle={CRYPTIC_MINI} xw={xw} />
      </WithGrid>
      {open && <AnagramHelper xw={xw} store={store} onClose={() => setOpen(false)} />}
    </>
  );
};
