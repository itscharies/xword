// Monochrome line icons (inherit currentColor). Shown on mobile in place of
// the Check / Reveal / Reset text labels.

const base = {
  viewBox: "0 0 24 24",
  width: 20,
  height: 20,
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2.4,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export const CheckIcon = () => (
  <svg {...base}>
    <path d="M4 12.5l5 5L20 6.5" />
  </svg>
);

export const EyeIcon = () => (
  <svg {...base} strokeWidth={2}>
    <path d="M1.5 12S5.5 5 12 5s10.5 7 10.5 7-4 7-10.5 7S1.5 12 1.5 12z" />
    <circle cx="12" cy="12" r="3.1" fill="currentColor" stroke="none" />
  </svg>
);

export const ResetIcon = () => (
  <svg {...base}>
    <path d="M3.5 12a8.5 8.5 0 1 0 2.4-5.9" />
    <path d="M3 4v4h4" />
  </svg>
);

// Shuffle / anagram: two crossing arrows (Feather "shuffle").
export const AnagramIcon = () => (
  <svg {...base} strokeWidth={2}>
    <path d="M16 3h5v5" />
    <path d="M4 4l5 5" />
    <path d="M15 15l6 6" />
    <path d="M21 16v5h-5" />
    <path d="M4 20L21 3" />
  </svg>
);

// Anagram (mobile key): letters arranged in a circle, echoing the helper's
// circle view of the scrambled tiles.
export const AnagramCircleIcon = () => {
  const letters = ["A", "B", "C", "D", "E", "F"];
  const r = 7.2;
  return (
    <svg {...base} fill="currentColor" stroke="none">
      {letters.map((ch, i) => {
        const a = (i / letters.length) * 2 * Math.PI - Math.PI / 2;
        return (
          <text
            key={ch}
            x={12 + Math.cos(a) * r}
            y={12 + Math.sin(a) * r}
            fontSize="6.6"
            fontWeight="800"
            textAnchor="middle"
            dominantBaseline="central"
          >
            {ch}
          </text>
        );
      })}
    </svg>
  );
};
