import type { Story, StoryDefault } from "@ladle/react";
import { GridCanvas } from "./GridCanvas.tsx";
import { useCrossword } from "../hooks/useCrossword.ts";
import { GIANT, GIANT_PEERS } from "../stories/fixtures.ts";
import { Note } from "../stories/helpers.tsx";

export default {
  title: "Solver / Grid canvas",
} satisfies StoryDefault;

export const PanAndZoom: Story = () => {
  const xw = useCrossword(GIANT, null);
  return (
    <>
      <Note>
        The pan/zoom viewport around a 40×40 grid — drag to pan, pinch or
        ctrl+scroll to zoom, double-tap to re-fit. Five peers are scattered
        across the grid; pan around and the minimap marks each of them in
        their accent, under your own caret.
      </Note>
      <div style={{ display: "flex", flexDirection: "column", height: "70vh" }}>
        <GridCanvas puzzle={GIANT} xw={xw} remoteCursors={GIANT_PEERS} />
      </div>
    </>
  );
};
