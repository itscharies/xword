/** Star rating. Pass `onChange` for an interactive picker; omit it for a
 * read-only display. */
export function StarRating({
  value,
  onChange,
  size = "sm",
}: {
  value: number;
  onChange?: (n: number) => void;
  size?: "sm" | "lg";
}) {
  const interactive = !!onChange;
  return (
    <div
      className={`stars ${interactive ? "interactive" : ""} ${size === "lg" ? "stars-lg" : ""}`}
      role={interactive ? "radiogroup" : "img"}
      aria-label={`${value} of 5 stars`}
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const cls = `star ${n <= value ? "on" : ""}`;
        return interactive ? (
          <button
            key={n}
            type="button"
            className={cls}
            onClick={() => onChange(n === value ? 0 : n)}
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
            aria-pressed={n <= value}
          >
            ★
          </button>
        ) : (
          <span key={n} className={cls} aria-hidden>
            ★
          </span>
        );
      })}
    </div>
  );
}
