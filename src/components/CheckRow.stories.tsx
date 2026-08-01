import { useState } from "react";
import type { Story, StoryDefault } from "@ladle/react";
import { CheckRow } from "./CheckRow.tsx";

export default {
  title: "Primitives / Check row",
} satisfies StoryDefault;

export const Default: Story = () => {
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [following, setFollowing] = useState(false);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 320 }}>
      <CheckRow
        checked={autoAdvance}
        onChange={setAutoAdvance}
        label="Jump to the next clue after a word"
      />
      <CheckRow
        checked={following}
        onChange={setFollowing}
        label="Only people you follow"
      />
    </div>
  );
};
