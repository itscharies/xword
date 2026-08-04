import { useState } from "react";
import type { Story, StoryDefault } from "@ladle/react";
import { PublishDialog } from "./PublishDialog.tsx";
import { Modal } from "./Modal.tsx";
import { AuthProvider } from "../hooks/useAuthContext.tsx";
import { MINI } from "../stories/fixtures.ts";
import { Note } from "../stories/helpers.tsx";

export default {
  title: "Modals / Publish dialog",
} satisfies StoryDefault;

export const Default: Story = () => {
  const [open, setOpen] = useState(true);
  return (
    <AuthProvider>
      <Note>
        The Builder's publish form (visibility, then the share-link state
        after publishing). Submitting needs a signed-in backend, so here it
        stays on the form state.
      </Note>
      <button className="btn" onClick={() => setOpen(true)}>
        Reopen
      </button>
      {open && (
        <Modal title="Publish puzzle" onClose={() => setOpen(false)}>
          <PublishDialog puzzle={MINI} onClose={() => setOpen(false)} />
        </Modal>
      )}
    </AuthProvider>
  );
};
