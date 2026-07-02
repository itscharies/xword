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

// Account / sign-in: a simple person silhouette.
export const UserIcon = () => (
  <svg {...base} fill="currentColor" stroke="none">
    <circle cx="12" cy="7.5" r="4" />
    <path d="M5 20a7 7 0 0 1 14 0" />
  </svg>
);

// Edit: a pencil (Feather "edit-2").
export const EditIcon = () => (
  <svg {...base}>
    <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
  </svg>
);

// Delete: a trash can (Feather "trash-2").
export const DeleteIcon = () => (
  <svg {...base}>
    <path d="M3 6h18" />
    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6" />
    <path d="M14 11v6" />
  </svg>
);

// Filter: a funnel (solid, like Font Awesome's "filter").
export const FilterIcon = () => (
  <svg viewBox="0 0 512 512" width={16} height={16} fill="currentColor" stroke="none" aria-hidden>
    <path d="M3.9 54.9C10.5 40.9 24.5 32 40 32H472c15.5 0 29.5 8.9 36.1 22.9s4.6 30.5-5.2 42.5L320 320.9V464c0 8.8-4.5 17-11.9 21.7s-16.7 5.4-24.5 1.7l-64-32c-8.1-4.1-13.6-12.3-13.6-21.6V320.9L9 97.4C-0.7 85.4-2.8 68.8 3.9 54.9z" />
  </svg>
);

// Info: circled "i" (Feather "info").
export const InfoIcon = () => (
  <svg {...base}>
    <circle cx="12" cy="12" r="9.5" />
    <path d="M12 11v6" />
    <circle cx="12" cy="7.4" r="1" fill="currentColor" stroke="none" />
  </svg>
);

// Settings: a gear (Feather "settings").
export const SettingsIcon = () => (
  <svg {...base} strokeWidth={2}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

export const PlayIcon = () => (
  <svg {...base} fill="currentColor" stroke="none">
    <path d="M6.5 4.3a1 1 0 0 1 1.5-.87l12.5 7.7a1 1 0 0 1 0 1.74l-12.5 7.7a1 1 0 0 1-1.5-.87V4.3z" />
  </svg>
);

export const PauseIcon = () => (
  <svg {...base} fill="currentColor" stroke="none">
    <rect x="6" y="4" width="4" height="16" rx="1" />
    <rect x="14" y="4" width="4" height="16" rx="1" />
  </svg>
);

// Lock / unlock (Feather "lock" / "unlock") — the Builder's square-grid toggle.
export const LockIcon = () => (
  <svg {...base}>
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);
export const UnlockIcon = () => (
  <svg {...base}>
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M7 11V7a5 5 0 0 1 9.5-2.2" />
  </svg>
);

// Paint mode: a solid square, echoing the black grid squares it paints.
export const SquareIcon = () => (
  <svg {...base} fill="currentColor" stroke="none">
    <rect x="5" y="5" width="14" height="14" rx="1.5" />
  </svg>
);

// Symmetry: a diagonal with corner brackets at each end.
export const SymmetryIcon = () => (
  <svg {...base} strokeWidth={2}>
    <path d="M7 17L17 7" />
    <path d="M7 13v4h4" />
    <path d="M17 11V7h-4" />
  </svg>
);

// Circle decoration toggle: a plain ring.
export const CircleIcon = () => (
  <svg {...base}>
    <circle cx="12" cy="12" r="8" />
  </svg>
);

// Shade decoration toggle: a squared-off grid.
export const ShadeIcon = () => (
  <svg {...base} strokeWidth={2}>
    <rect x="4" y="4" width="16" height="16" rx="1" />
    <path d="M4 9.3h16M4 14.7h16M9.3 4v16M14.7 4v16" />
  </svg>
);

// Bar-right / bar-bottom decoration toggles: a square with one thick edge.
export const BarRightIcon = () => (
  <svg {...base} strokeWidth={2}>
    <rect x="4" y="4" width="16" height="16" rx="1" />
    <path d="M17 4v16" strokeWidth={3.6} />
  </svg>
);
export const BarBottomIcon = () => (
  <svg {...base} strokeWidth={2}>
    <rect x="4" y="4" width="16" height="16" rx="1" />
    <path d="M4 17h16" strokeWidth={3.6} />
  </svg>
);

// Save: a floppy disk (Feather "save").
export const SaveIcon = () => (
  <svg {...base} strokeWidth={2}>
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
    <path d="M17 21v-8H7v8" />
    <path d="M7 3v5h8" />
  </svg>
);

// Upload / download (Feather "upload" / "download") — publish, import, export.
export const UploadIcon = () => (
  <svg {...base} strokeWidth={2}>
    <path d="M12 16V4" />
    <path d="M6.5 9.5L12 4l5.5 5.5" />
    <path d="M4 16.5V19a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2.5" />
  </svg>
);
export const DownloadIcon = () => (
  <svg {...base} strokeWidth={2}>
    <path d="M12 4v12" />
    <path d="M6.5 11l5.5 5.5L17.5 11" />
    <path d="M4 16.5V19a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2.5" />
  </svg>
);

// Theme controls: sun / moon / half-circle ("system").
export const SunIcon = () => (
  <svg {...base} strokeWidth={2}>
    <circle cx="12" cy="12" r="4.2" />
    <path d="M12 2.5v2.3M12 19.2v2.3M4.4 4.4l1.6 1.6M18 18l1.6 1.6M2.5 12h2.3M19.2 12h2.3M4.4 19.6l1.6-1.6M18 6l1.6-1.6" />
  </svg>
);
export const MoonIcon = () => (
  <svg {...base} fill="currentColor" stroke="none">
    <path d="M20.5 14.7A8.5 8.5 0 1 1 9.3 3.5a7 7 0 0 0 11.2 11.2z" />
  </svg>
);
export const SystemIcon = () => (
  <svg {...base} strokeWidth={2}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor" stroke="none" />
  </svg>
);

// Small disclosure caret on the Toolbar's reveal dropdown.
export const ChevronDownIcon = () => (
  <svg {...base} width={12} height={12} strokeWidth={3}>
    <path d="M5 9l7 7 7-7" />
  </svg>
);

// Mobile keyboard's backspace key.
export const BackspaceIcon = () => (
  <svg {...base} strokeWidth={2}>
    <path d="M9 5h11a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H9l-6-7 6-7z" />
    <path d="M13 10l5 5M18 10l-5 5" />
  </svg>
);

// Anagram (mobile key): letters arranged in a circle, echoing the helper's
// circle view of the scrambled tiles.
export const AnagramCircleIcon = () => {
  const letters = ["A", "B", "C", "D", "E"];
  const c = 14;
  const r = 9;
  return (
    <svg
      {...base}
      width={24}
      height={24}
      viewBox="0 0 28 28"
      fill="currentColor"
      stroke="none"
    >
      {letters.map((ch, i) => {
        const a = (i / letters.length) * 2 * Math.PI - Math.PI / 2;
        return (
          <text
            key={ch}
            x={c + Math.cos(a) * r}
            y={c + Math.sin(a) * r}
            fontSize="10"
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
