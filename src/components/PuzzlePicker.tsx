import type { PuzzleIndexEntry } from "../types.ts";

export function PuzzlePicker({
  index,
  value,
  onChange,
}: {
  index: PuzzleIndexEntry[];
  value: string;
  onChange: (date: string) => void;
}) {
  return (
    <select
      className="picker"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Choose a puzzle date"
    >
      {index.map((p) => {
        const d = new Date(`${p.isoDate}T00:00:00`);
        const label = d.toLocaleDateString(undefined, {
          weekday: "short",
          month: "short",
          day: "numeric",
          year: "numeric",
        });
        return (
          <option key={p.date} value={p.date}>
            {label}
          </option>
        );
      })}
    </select>
  );
}
