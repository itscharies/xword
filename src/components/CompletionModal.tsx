import { formatTime } from "../hooks/useTimer.ts";
import { Modal } from "./Modal.tsx";
import { StarRating } from "./StarRating.tsx";

export function CompletionModal({
  elapsed,
  usedReveal,
  rating,
  onRate,
  onClose,
}: {
  elapsed: number;
  usedReveal: boolean;
  rating: number;
  onRate: (n: number) => void;
  onClose: () => void;
}) {
  return (
    <Modal title="🎉 Solved!" onClose={onClose}>
      <p>You completed the puzzle in</p>
      <div className="big-time">{formatTime(elapsed)}</div>
      {usedReveal && <p>(with some revealed help)</p>}
      <p className="rate-label">Rate it</p>
      <div className="rate-stars">
        <StarRating value={rating} onChange={onRate} size="lg" />
      </div>
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>
          Nice
        </button>
      </div>
    </Modal>
  );
}
