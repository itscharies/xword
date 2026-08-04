import { useEffect } from "react";
import type { Story, StoryDefault } from "@ladle/react";
import { Grid } from "./Grid.tsx";
import { useCrossword } from "../hooks/useCrossword.ts";
import type { Puzzle } from "../types.ts";
import type { Progress } from "../lib/storage.ts";
import {
  KITCHEN_SINK,
  MINI,
  PEERS,
  PEER_POOL,
  SINK_PROGRESS,
} from "../stories/fixtures.ts";
import { Note } from "../stories/helpers.tsx";

export default {
  title: "Solver / Grid",
} satisfies StoryDefault;

/** The real solve engine with the window keyboard wiring the app does in
 *  Solver — stories are fully playable, not static renders. */
function usePlayable(puzzle: Puzzle, saved: Progress | null = null) {
  const xw = useCrossword(puzzle, saved);
  const { handleKeyDown } = xw;
  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
  return xw;
}

export const Playable: Story = () => {
  const xw = usePlayable(MINI);
  return (
    <>
      <Note>
        Click a cell and type. Arrows move, Space/Enter flips direction, Tab
        jumps clues, Ctrl+X/C/E checks cell/word/grid, Ctrl+B/R/G reveals.
      </Note>
      <Grid puzzle={MINI} xw={xw} />
    </>
  );
};

export const KitchenSink: Story = () => {
  const xw = usePlayable(KITCHEN_SINK, SINK_PROGRESS);
  const { check } = xw;
  useEffect(() => {
    check("puzzle");
  }, [check]);
  return (
    <>
      <Note>
        Every cell decoration at once: circles, shading, word-separator bars,
        a revealed cell, checked-wrong letters, and a multi-letter (rebus)
        entry.
      </Note>
      <Grid puzzle={KITCHEN_SINK} xw={xw} />
    </>
  );
};

export const ChecksAndReveals: Story = () => {
  const xw = usePlayable(MINI, SINK_PROGRESS);
  return (
    <>
      <Note>
        The seeded fill has one wrong letter and one over-long entry — Check
        flags them, Reveal fixes them, Reset clears the slate.
      </Note>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button className="btn" onClick={() => xw.check("puzzle")}>
          Check puzzle
        </button>
        <button className="btn" onClick={() => xw.reveal("word")}>
          Reveal word
        </button>
        <button className="btn" onClick={() => xw.reveal("puzzle")}>
          Reveal puzzle
        </button>
        <button className="btn" onClick={() => xw.reset()}>
          Reset
        </button>
      </div>
      <Grid puzzle={MINI} xw={xw} />
    </>
  );
};

export const CoopCursors: Story = () => {
  const xw = usePlayable(MINI);
  return (
    <>
      <Note>
        Two peers solving elsewhere: each gets an accent ring and initial
        badge on their cell, and a translucent tint across their whole
        selected word.
      </Note>
      <Grid puzzle={MINI} xw={xw} remoteCursors={[PEERS.ada, PEERS.max]} />
    </>
  );
};

export const CoopStackedCursors: Story = () => {
  const xw = usePlayable(MINI);
  return (
    <>
      <Note>
        Grace, Alan, Edie, and Kay all sit on the centre cell — the new max
        of four. Rings nest 3px per peer and each badge is inset to sit flush
        on its owner's ring, one corner each. A fifth peer wouldn't render.
      </Note>
      <Grid
        puzzle={MINI}
        xw={xw}
        remoteCursors={[PEERS.grace, PEERS.alan, PEERS.edie, PEERS.kay]}
      />
    </>
  );
};

export const CoopCrossingWords: Story = () => {
  const xw = usePlayable(MINI);
  return (
    <>
      <Note>
        Ada works an across, Ivy a down. Tints no longer blend — on the
        shared cell the first peer's colour wins outright.
      </Note>
      <Grid puzzle={MINI} xw={xw} remoteCursors={[PEERS.ada, PEERS.ivy]} />
    </>
  );
};

export const CoopLocalUserOnTop: Story = () => {
  const xw = usePlayable(MINI);
  return (
    <>
      <Note>
        Ivy's word runs straight through the local player's selected word —
        the local highlight stays untinted (the user always renders on top),
        while Ivy's ring and badge still mark where she is.
      </Note>
      <Grid puzzle={MINI} xw={xw} remoteCursors={[PEERS.ivy]} />
    </>
  );
};

export const CoopCrowd: Story<{ peers: number }> = ({ peers }) => {
  const xw = usePlayable(MINI);
  return (
    <>
      <Note>
        Dial the peer count up and down with the control — a busy session on
        a tiny grid is the stress test for cursor legibility.
      </Note>
      <Grid puzzle={MINI} xw={xw} remoteCursors={PEER_POOL.slice(0, peers)} />
    </>
  );
};
CoopCrowd.args = { peers: 5 };
CoopCrowd.argTypes = {
  peers: { control: { type: "number", min: 0, max: PEER_POOL.length } },
};
