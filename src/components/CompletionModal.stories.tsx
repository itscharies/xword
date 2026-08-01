import { useState } from "react";
import type { Story, StoryDefault } from "@ladle/react";
import { CompletionModal } from "./CompletionModal.tsx";

export default {
  title: "Modals / Completion",
} satisfies StoryDefault;

const Wrapper = ({ usedReveal }: { usedReveal: boolean }) => {
  const [open, setOpen] = useState(true);
  const [rating, setRating] = useState(0);
  return (
    <>
      <button className="btn" onClick={() => setOpen(true)}>
        Reopen
      </button>
      {open && (
        <CompletionModal
          elapsed={754}
          usedReveal={usedReveal}
          rating={rating}
          onRate={setRating}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
};

export const CleanSolve: Story = () => <Wrapper usedReveal={false} />;

export const WithReveals: Story = () => <Wrapper usedReveal />;
