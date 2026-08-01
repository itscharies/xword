import type { Story, StoryDefault } from "@ladle/react";
import { ClueList } from "./ClueList.tsx";
import { Grid } from "./Grid.tsx";
import { useCrossword } from "../hooks/useCrossword.ts";
import { MINI, PEERS } from "../stories/fixtures.ts";

export default {
  title: "Solver / Clue list",
} satisfies StoryDefault;

export const Default: Story = () => {
  const xw = useCrossword(MINI, null);
  return <ClueList puzzle={MINI} xw={xw} />;
};

export const WithPeers: Story = () => {
  const xw = useCrossword(MINI, null);
  return (
    <>
      <p style={{ maxWidth: 560, color: "var(--muted)", fontSize: 14 }}>
        Peers' selected clues get a row tint in their accent plus their
        initial badge — Grace and Alan share a clue, so both badges stack on
        one row.
      </p>
      <ClueList
        puzzle={MINI}
        xw={xw}
        remoteCursors={[PEERS.ada, PEERS.grace, PEERS.alan]}
      />
    </>
  );
};

export const WithGrid: Story = () => {
  const xw = useCrossword(MINI, null);
  return (
    <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
      <Grid puzzle={MINI} xw={xw} />
      <div style={{ flex: 1, minWidth: 280 }}>
        <ClueList puzzle={MINI} xw={xw} remoteCursors={[PEERS.grace]} />
      </div>
    </div>
  );
};
