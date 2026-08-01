import { useState } from "react";
import type { Story, StoryDefault } from "@ladle/react";
import { SessionInviteDialog } from "./SessionInviteDialog.tsx";

export default {
  title: "Session / Invite dialog",
} satisfies StoryDefault;

export const Default: Story = () => {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button className="btn" onClick={() => setOpen(true)}>
        Reopen
      </button>
      {open && (
        <SessionInviteDialog
          url="https://itscharies.github.io/xword/s/fixture123"
          title="Fixture mini"
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
};
