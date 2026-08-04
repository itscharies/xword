import type { Story, StoryDefault } from "@ladle/react";
import { ClueList } from "./ClueList.tsx";
import { Grid } from "./Grid.tsx";
import { useCrossword } from "../hooks/useCrossword.ts";
import type { RemoteCursor } from "../hooks/useSession.ts";
import { MINI, PEERS, mkPeer } from "../stories/fixtures.ts";
import { Note } from "../stories/helpers.tsx";

export default {
  title: "Solver / Clue list",
} satisfies StoryDefault;

/** The list drives the same engine as the grid, so the stories pair them
 *  side by side the way Solver lays them out — clicking a clue moves the
 *  grid selection and vice versa. */
const Pair = ({
  xw,
  remoteCursors,
}: {
  xw: ReturnType<typeof useCrossword>;
  remoteCursors?: RemoteCursor[];
}) => (
  <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
    <Grid puzzle={MINI} xw={xw} remoteCursors={remoteCursors} />
    <div style={{ flex: 1, minWidth: 280 }}>
      <ClueList puzzle={MINI} xw={xw} remoteCursors={remoteCursors} />
    </div>
  </div>
);

export const Default: Story = () => {
  const xw = useCrossword(MINI, null);
  return (
    <>
      <Note>
        Click a clue to select its word in the grid; click around the grid and
        the list highlight follows.
      </Note>
      <Pair xw={xw} />
    </>
  );
};

export const WithPeers: Story = () => {
  const xw = useCrossword(MINI, null);
  return (
    <>
      <Note>
        A peer's clue renders like the local selection in their accent: the
        skinny side bar plus a light row tint. Grace and Edie share a down
        clue — Grace got there first, so only her colour paints it and Edie
        keeps her chip. Noor sits on the local player's clue and Pia on its
        grey crossing clue: the local styling wins and they show as chips
        only. The same cursors mark the grid, so list and grid agree.
      </Note>
      <Pair
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
