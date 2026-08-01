import type { ComponentType } from "react";
import type { Story, StoryDefault } from "@ladle/react";
import * as Icons from "./icons.tsx";
import { RebusIcon } from "./RebusIcon.tsx";

export default {
  title: "Primitives / Icons",
} satisfies StoryDefault;

export const All: Story = () => (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))",
      gap: 8,
      maxWidth: 720,
    }}
  >
    {(
      [...Object.entries(Icons), ["RebusIcon", RebusIcon]] as Array<
        [string, ComponentType]
      >
    ).map(
      ([name, Icon]) => (
        <div
          key={name}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 6,
            padding: "12px 4px",
            border: "1px solid var(--line)",
          }}
        >
          <Icon />
          <code style={{ fontSize: 10, color: "var(--muted)" }}>{name}</code>
        </div>
      ),
    )}
  </div>
);
