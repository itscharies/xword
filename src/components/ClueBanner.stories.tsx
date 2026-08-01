import type { Story, StoryDefault } from "@ladle/react";
import { ClueBanner } from "./ClueBanner.tsx";
import { Grid } from "./Grid.tsx";
import { useCrossword } from "../hooks/useCrossword.ts";
import { CRYPTIC_MINI, MINI } from "../stories/fixtures.ts";

export default {
  title: "Solver / Clue banner",
} satisfies StoryDefault;

export const Default: Story = () => {
  const xw = useCrossword(MINI, null);
  return (
    <>
      <p style={{ maxWidth: 560, color: "var(--muted)", fontSize: 14 }}>
        Tap to flip direction, drag horizontally to glide the cursor along the
        grid — pair it with the grid below to watch the selection move.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <ClueBanner xw={xw} />
        <Grid puzzle={MINI} xw={xw} />
      </div>
    </>
  );
};

export const Cryptic: Story = () => {
  const xw = useCrossword(CRYPTIC_MINI, null);
  return <ClueBanner xw={xw} />;
};
