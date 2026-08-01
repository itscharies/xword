import { useState } from "react";
import type { Story, StoryDefault } from "@ladle/react";
import { JoinSessionDialog } from "./JoinSessionDialog.tsx";

export default {
  title: "Session / Join dialog",
} satisfies StoryDefault;

export const Default: Story = () => {
  const [open, setOpen] = useState(true);
  const [joined, setJoined] = useState<string | null>(null);
  return (
    <>
      <button className="btn" onClick={() => setOpen(true)}>
        Reopen
      </button>
      {joined && (
        <p style={{ fontSize: 14 }}>
          Would join session <code>{joined}</code>
        </p>
      )}
      {open && (
        <JoinSessionDialog
          onJoin={(id) => {
            setJoined(id);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
};
