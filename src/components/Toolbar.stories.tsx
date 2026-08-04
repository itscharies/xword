import type { Story, StoryDefault } from "@ladle/react";
import { Toolbar } from "./Toolbar.tsx";
import { Grid } from "./Grid.tsx";
import { useCrossword } from "../hooks/useCrossword.ts";
import { CRYPTIC_MINI, MINI } from "../stories/fixtures.ts";
import { Note, WithGrid } from "../stories/helpers.tsx";

export default {
  title: "Solver / Toolbar",
} satisfies StoryDefault;

export const Default: Story = () => {
  const xw = useCrossword(MINI, null);
  return (
    <>
      <Note>
        The check/reveal menus and the rebus toggle drive the real engine —
        the grid below shows what they do.
      </Note>
      <WithGrid>
        <Toolbar xw={xw} onRequestReset={() => xw.reset()} onAnagram={() => {}} />
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
        Cryptic puzzles add the anagram-helper button; everything else works
        as in the quick puzzle.
      </Note>
      <WithGrid>
        <Toolbar xw={xw} onRequestReset={() => xw.reset()} onAnagram={() => {}} />
        <Grid puzzle={CRYPTIC_MINI} xw={xw} />
      </WithGrid>
    </>
  );
};
