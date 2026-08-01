import type { Story, StoryDefault } from "@ladle/react";
import {
  AccountPageSkeleton,
  ArchiveDaySkeleton,
  Sk,
  SolverSkeleton,
  TileListSkeleton,
} from "./Skeleton.tsx";

export default {
  title: "Primitives / Skeletons",
} satisfies StoryDefault;

export const Bars: Story = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 360 }}>
    <Sk w="60%" h={24} />
    <Sk w="100%" />
    <Sk w="80%" />
    <Sk w={120} h={40} />
  </div>
);

export const ArchiveDay: Story = () => <ArchiveDaySkeleton count={3} />;

export const TileList: Story = () => <TileListSkeleton rows={3} avatar />;

export const Solver: Story = () => <SolverSkeleton />;

export const AccountPage: Story = () => <AccountPageSkeleton />;
