import type { Story, StoryDefault } from "@ladle/react";
import { SolvesFlyout } from "./SolvesFlyout.tsx";
import { MUTUALS } from "../stories/fixtures.ts";
import { Note } from "../stories/helpers.tsx";

export default {
  title: "Session / Solves flyout",
} satisfies StoryDefault;

export const WithMutuals: Story = () => (
  <div style={{ minHeight: 320 }}>
    <Note>
      Followed solvers' progress on this puzzle — hover or tap the avatar
      stack for the detail panel (finished, in progress, percentages).
    </Note>
    <SolvesFlyout mutuals={MUTUALS} completions={128} />
  </div>
);

export const CompletionsOnly: Story = () => (
  <div style={{ minHeight: 120 }}>
    <SolvesFlyout mutuals={[]} completions={42} />
  </div>
);
