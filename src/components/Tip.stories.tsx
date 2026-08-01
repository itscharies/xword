import type { Story, StoryDefault } from "@ladle/react";
import { Tip } from "./Tip.tsx";
import { InfoIcon } from "./icons.tsx";

export default {
  title: "Primitives / Tip",
} satisfies StoryDefault;

export const Default: Story = () => (
  <div style={{ padding: "96px 24px", display: "flex", gap: 48 }}>
    <Tip
      tip="Opens below the trigger. Hover on mouse, tap on touch."
      label="About text triggers"
      className="tip-text"
    >
      dotted-underline text
    </Tip>
    <Tip tip="Icon triggers work the same way." label="About icon triggers">
      <InfoIcon />
    </Tip>
    <Tip
      tip="tip-up flips the panel above the trigger."
      label="About flipped tips"
      className="tip-up"
    >
      <InfoIcon />
    </Tip>
  </div>
);
