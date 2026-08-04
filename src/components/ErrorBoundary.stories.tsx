import type { Story, StoryDefault } from "@ladle/react";
import { ErrorBoundary } from "./ErrorBoundary.tsx";
import { Note } from "../stories/helpers.tsx";

export default {
  title: "Primitives / Error boundary",
} satisfies StoryDefault;

function Bomb(): never {
  throw new Error("Storybook fixture crash");
}

export const Fallback: Story = () => (
  <>
    <Note>
      What users see when a render throws. The buttons navigate the real
      page, so clicking them leaves the gallery.
    </Note>
    <ErrorBoundary>
      <Bomb />
    </ErrorBoundary>
  </>
);
