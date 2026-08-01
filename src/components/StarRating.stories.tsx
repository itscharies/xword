import { useState } from "react";
import type { Story, StoryDefault } from "@ladle/react";
import { StarRating } from "./StarRating.tsx";

export default {
  title: "Primitives / Star rating",
} satisfies StoryDefault;

export const ReadOnly: Story = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
    {[0, 1, 2, 3, 4, 5].map((n) => (
      <StarRating key={n} value={n} />
    ))}
  </div>
);

export const Interactive: Story = () => {
  const [value, setValue] = useState(3);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <StarRating value={value} onChange={setValue} size="lg" />
      <span style={{ color: "var(--muted)", fontSize: 13 }}>
        Click the current value to clear it.
      </span>
    </div>
  );
};
