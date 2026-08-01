import { useState } from "react";
import type { Story, StoryDefault } from "@ladle/react";
import { Modal } from "./Modal.tsx";

export default {
  title: "Primitives / Modal",
} satisfies StoryDefault;

export const Default: Story = () => {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button className="btn" onClick={() => setOpen(true)}>
        Open modal
      </button>
      {open && (
        <Modal title="Settings" onClose={() => setOpen(false)}>
          <p>
            Closes on the overlay, the floating ×, or Escape — every dialog in
            the app shares this shell.
          </p>
          <button className="btn" onClick={() => setOpen(false)}>
            Done
          </button>
        </Modal>
      )}
    </>
  );
};
