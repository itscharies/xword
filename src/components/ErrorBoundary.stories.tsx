import type { Story, StoryDefault } from "@ladle/react";
import { ErrorBoundary } from "./ErrorBoundary.tsx";

export default {
  title: "Primitives / Error boundary",
} satisfies StoryDefault;

function Bomb(): never {
  throw new Error("Storybook fixture crash");
}

export const Fallback: Story = () => (
  <>
    <p style={{ maxWidth: 560, color: "var(--muted)", fontSize: 14 }}>
      What users see when a render throws. The buttons navigate the real
      page, so clicking them leaves the gallery.
    </p>
    <ErrorBoundary>
      <Bomb />
    </ErrorBoundary>
  </>
);
