import type { Story, StoryDefault } from "@ladle/react";
import { Logo } from "./Logo.tsx";

export default {
  title: "Primitives / Logo",
} satisfies StoryDefault;

export const Default: Story = () => <Logo onClick={() => {}} />;
