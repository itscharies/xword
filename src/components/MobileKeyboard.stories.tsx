import type { Story, StoryDefault } from "@ladle/react";
import { MobileKeyboard } from "./MobileKeyboard.tsx";
import { Grid } from "./Grid.tsx";
import { useCrossword } from "../hooks/useCrossword.ts";
import { CRYPTIC_MINI } from "../stories/fixtures.ts";
import { Note, WithGrid } from "../stories/helpers.tsx";

export default {
  title: "Solver / Mobile keyboard",
} satisfies StoryDefault;

export const Default: Story = () => {
  const xw = useCrossword(CRYPTIC_MINI, null);
  return (
    <>
      {/* The keyboard is display:none outside the mobile media query — force
          it on so the story works at any viewport width. */}
      <style>{`.keyboard { display: flex; }`}</style>
      <Note>
        Tap keys to type into the grid. Normally shown only under 820px wide —
        forced visible here. Cryptic puzzles add the anagram key next to
        the rebus toggle.
      </Note>
      <WithGrid>
        <Grid puzzle={CRYPTIC_MINI} xw={xw} />
        <MobileKeyboard xw={xw} onAnagram={() => {}} />
      </WithGrid>
    </>
  );
};
