import type { Story, StoryDefault } from "@ladle/react";
import { ClueList } from "./ClueList.tsx";
import { Grid } from "./Grid.tsx";
import { useCrossword } from "../hooks/useCrossword.ts";
import { MINI, PEERS, mkPeer } from "../stories/fixtures.ts";

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
        A peer's clue renders like the local selection in their accent: the
        skinny side bar plus a light row tint. Grace and Edie share a down
        clue — Grace got there first, so only her colour paints it and Edie
        keeps her chip. Noor sits on the local player's clue and Pia on its
        grey crossing clue: the local styling wins and they show as chips
        only.
      </p>
      <ClueList
        puzzle={MINI}
        xw={xw}
        remoteCursors={[
          PEERS.grace,
          PEERS.edie,
          mkPeer("noor", "Noor", "#3cff52", 0, 3, "across"),
          mkPeer("pia", "Pia", "#00e5ff", 1, 1, "down"),
        ]}
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
