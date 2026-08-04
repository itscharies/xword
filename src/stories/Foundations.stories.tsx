import type { Story, StoryDefault } from "@ladle/react";
import { ACCENTS } from "../lib/theme.ts";
import { SettingsIcon } from "../components/icons.tsx";
import { CheckRow } from "../components/CheckRow.tsx";
import { useState } from "react";

/** Foundations = the design language itself: colour tokens, accents, type,
 *  and the elevation rules every surface follows. The controls built from
 *  it (buttons, chips, inputs…) live under Primitives. */
export default {
  title: "Foundations",
} satisfies StoryDefault;

const TOKENS = [
  "--bg",
  "--fg",
  "--muted",
  "--surface",
  "--surface-2",
  "--line",
  "--accent",
  "--accent-2",
  "--accent-deep",
  "--wrong",
  "--revealed",
  "--shaded",
  "--cell-bg",
  "--cell-block",
];

export const Colors: Story = () => (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
      gap: 8,
      maxWidth: 720,
    }}
  >
    {TOKENS.map((token) => (
      <div key={token} style={{ border: "1px solid var(--line)" }}>
        <div style={{ height: 48, background: `var(${token})` }} />
        <code style={{ display: "block", padding: 4, fontSize: 11 }}>{token}</code>
      </div>
    ))}
  </div>
);

export const Accents: Story = () => (
  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, maxWidth: 560 }}>
    {ACCENTS.map((a) => (
      <div key={a.id} style={{ textAlign: "center", fontSize: 12 }}>
        <div
          style={{
            width: 56,
            height: 56,
            background: a.swatch,
            border: "var(--bw) solid var(--line)",
            boxShadow: "var(--sh) var(--sh) 0 var(--shadow-col)",
          }}
        />
        <div style={{ marginTop: 8, color: "var(--muted)" }}>{a.id}</div>
      </div>
    ))}
  </div>
);

const Level = ({
  label,
  blurb,
  children,
}: {
  label: string;
  blurb: string;
  children: React.ReactNode;
}) => (
  <section>
    <div className="setting-label" style={{ marginBottom: 4 }}>
      {label}
    </div>
    <p style={{ color: "var(--muted)", fontSize: 14, margin: "0 0 14px" }}>{blurb}</p>
    {children}
  </section>
);

/** One card, one shadow — the app's whole elevation system, shown at each
 *  level it actually occurs in. Containers that already cast the hard offset
 *  shadow flatten every control inside them (--nested-shadow: none) and hand
 *  pressables a --surface-2 face (--nested-btn-bg), so buttons stay visually
 *  distinct from the paper-coloured text fields they share rows with. */
export const Elevation: Story = () => {
  const [autocheck, setAutocheck] = useState(true);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 36, maxWidth: 620 }}>
      <Level
        label="On the page — raised"
        blurb="Controls sitting directly on the page carry the full hard shadow
               and press down into it, like the solver's action bar."
      >
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn">Check</button>
          <button className="btn">Reveal</button>
          <button className="btn btn-accent">New puzzle</button>
          <button className="btn icon-btn" aria-label="Settings">
            <SettingsIcon />
          </button>
        </div>
      </Level>

      <Level
        label="Inside a panel — flat, automatically"
        blurb="A .box (or session gate, account summary, clue banner…) casts the
               one shadow itself, so everything nested goes flat. Buttons wear
               the tinted key face; the input keeps the paper surface; the
               segmented control's inset affordance is untouched."
      >
        <div
          className="box"
          style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}
        >
          <div className="seg">
            {["Cell", "Word", "Puzzle"].map((o) => (
              <button key={o} className={`seg-btn ${o === "Word" ? "active" : ""}`}>
                {o}
              </button>
            ))}
          </div>
          <CheckRow
            checked={autocheck}
            onChange={setAutocheck}
            label="Check letters as you type"
          />
          <div style={{ display: "flex", gap: 8 }}>
            <input className="text-input" placeholder="Username" style={{ flex: 1 }} />
            <button className="btn">Claim</button>
          </div>
        </div>
      </Level>

      <Level
        label="Inside a modal — the same rule"
        blurb="The invite dialog's link row (rendered inline here — a real modal
               floats on the overlay): a paper field between key-faced buttons,
               where a shadowless all-white row used to blur together."
      >
        <div className="modal">
          <h2 className="modal-title">Solve together</h2>
          <p>Anyone with this link can sign in and join your session.</p>
          <div className="savedata-actions">
            <input
              className="text-input"
              readOnly
              value="https://itscharies.github.io/xword/s/fixture123"
            />
            <button className="btn">Copy</button>
            <button className="btn btn-accent">Share…</button>
          </div>
          <div className="modal-actions">
            <button className="btn">Done</button>
          </div>
        </div>
      </Level>

      <Level
        label="Manual opt-in — .flat"
        blurb="Anywhere the automatic containers don't reach, .flat on a wrapper
               (or the control itself) applies the identical treatment — used
               whenever a control shares a row with a shadowless input."
      >
        <div className="flat" style={{ display: "flex", gap: 8 }}>
          <input className="text-input" placeholder="Paste an invite link" style={{ flex: 1 }} />
          <button className="btn">Join</button>
        </div>
      </Level>
    </div>
  );
};

export const Type: Story = () => (
  <div style={{ maxWidth: 560 }}>
    <span className="brand" style={{ fontSize: 40 }}>
      The Daily Grid
    </span>
    <h1>Heading one</h1>
    <h2>Heading two</h2>
    <h3>Heading three</h3>
    <p>
      Body text set in SN Pro. The brand wordmark above uses Jaro, reserved
      for the title alone.
    </p>
    <p style={{ color: "var(--muted)" }}>Muted text for secondary detail.</p>
  </div>
);
