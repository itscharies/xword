import type { Story, StoryDefault } from "@ladle/react";
import { Toolbar } from "./Toolbar.tsx";
import { Grid } from "./Grid.tsx";
import { useCrossword } from "../hooks/useCrossword.ts";
import { CRYPTIC_MINI, MINI } from "../stories/fixtures.ts";

export default {
  title: "Solver / Toolbar",
} satisfies StoryDefault;

export const Default: Story = () => {
  const xw = useCrossword(MINI, null);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Toolbar xw={xw} onRequestReset={() => xw.reset()} onAnagram={() => {}} />
      <Grid puzzle={MINI} xw={xw} />
    </div>
  );
};

export const Cryptic: Story = () => {
  const xw = useCrossword(CRYPTIC_MINI, null);
  return (
    <>
      <p style={{ maxWidth: 560, color: "var(--muted)", fontSize: 14 }}>
        Cryptic puzzles add the anagram-helper button and the rebus toggle
        behaves the same — the check/reveal menus drive the real engine.
      </p>
      <Toolbar xw={xw} onRequestReset={() => xw.reset()} onAnagram={() => {}} />
    </>
  );
};
