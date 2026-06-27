import { formatTime } from "../hooks/useTimer.ts";
import { Modal } from "./Modal.tsx";

export function CompletionModal({
  elapsed,
  usedReveal,
  onClose,
}: {
  elapsed: number;
  usedReveal: boolean;
  onClose: () => void;
}) {
  return (
    <Modal title="🎉 Solved!" onClose={onClose}>
      <p>You completed the puzzle in</p>
      <div className="big-time">{formatTime(elapsed)}</div>
      {usedReveal && <p>(with some revealed help)</p>}
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>
          Nice
        </button>
      </div>
    </Modal>
  );
}
