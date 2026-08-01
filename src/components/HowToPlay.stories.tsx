import { useState } from "react";
import type { Story, StoryDefault } from "@ladle/react";
import { HowToPlay } from "./HowToPlay.tsx";
import { AboutPuzzles } from "./AboutPuzzles.tsx";
import { Modal } from "./Modal.tsx";

export default {
  title: "Modals / Info",
} satisfies StoryDefault;

const InModal = ({ title, children }: { title: string; children: React.ReactNode }) => {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button className="btn" onClick={() => setOpen(true)}>
        Reopen
      </button>
      {open && (
        <Modal title={title} onClose={() => setOpen(false)}>
          {children}
        </Modal>
      )}
    </>
  );
};

export const HowTo: Story = () => (
  <InModal title="How to play">
    <HowToPlay />
  </InModal>
);

export const About: Story = () => (
  <InModal title="About the puzzles">
    <AboutPuzzles />
  </InModal>
);
