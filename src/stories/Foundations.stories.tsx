import { useState } from "react";
import type { Story, StoryDefault } from "@ladle/react";
import { ACCENTS } from "../lib/theme.ts";
import { SettingsIcon } from "../components/icons.tsx";

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

export const Buttons: Story = () => (
  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
    <button className="btn">Default</button>
    <button className="btn active">Active</button>
    <button className="btn btn-accent">Accent</button>
    <button className="btn" disabled>
      Disabled
    </button>
    <button className="btn icon-btn" aria-label="Settings">
      <SettingsIcon />
    </button>
  </div>
);

export const SegmentedControl: Story = () => {
  const options = ["Cell", "Word", "Puzzle"];
  const [active, setActive] = useState("Word");
  return (
    <div className="seg">
      {options.map((o) => (
        <button
          key={o}
          className={`seg-btn ${o === active ? "active" : ""}`}
          onClick={() => setActive(o)}
        >
          {o}
        </button>
      ))}
    </div>
  );
};

export const TextInput: Story = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 420 }}>
    <input className="text-input" placeholder="Paste an invite link" />
    <div style={{ display: "flex", gap: 8 }}>
      <input className="text-input" placeholder="Shares a row with a button" style={{ flex: 1 }} />
      <button className="btn">Join</button>
    </div>
  </div>
);

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
