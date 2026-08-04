import type { Story, StoryDefault } from "@ladle/react";
import { ClueBanner } from "./ClueBanner.tsx";
import { Grid } from "./Grid.tsx";
import { useCrossword } from "../hooks/useCrossword.ts";
import { CRYPTIC_MINI, MINI } from "../stories/fixtures.ts";
import { Note, WithGrid } from "../stories/helpers.tsx";

export default {
  title: "Solver / Clue banner",
} satisfies StoryDefault;

export const Default: Story = () => {
  const xw = useCrossword(MINI, null);
  return (
    <>
      <Note>
        Tap to flip direction, drag horizontally to glide the cursor along the
        grid — the grid below shows the selection move.
      </Note>
      <WithGrid>
        <ClueBanner xw={xw} />
        <Grid puzzle={MINI} xw={xw} />
      </WithGrid>
    </>
  );
};

export const Cryptic: Story = () => {
  const xw = useCrossword(CRYPTIC_MINI, null);
  return (
    <>
      <Note>
        Cryptic clues carry their enumeration in the banner; flipping and
        gliding work the same as the quick puzzle.
      </Note>
      <WithGrid>
        <ClueBanner xw={xw} />
        <Grid puzzle={CRYPTIC_MINI} xw={xw} />
      </WithGrid>
    </>
  );
};
