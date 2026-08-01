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

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <div className="setting-label" style={{ marginBottom: 8 }}>
      {label}
    </div>
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
      {children}
    </div>
  </div>
);

export const Buttons: Story = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
    <Row label="Primary — hard shadow, press to sit down">
      <button className="btn">Default</button>
      <button className="btn active">Active</button>
      <button className="btn btn-accent">Accent</button>
      <button className="btn" disabled>
        Disabled
      </button>
      <button className="btn icon-btn" aria-label="Settings">
        <SettingsIcon />
      </button>
    </Row>
    <Row label="Secondary — .flat, shadowless (as inside modals and panels)">
      <button className="btn flat">Default</button>
      <button className="btn flat active">Active</button>
      <button className="btn flat btn-accent">Accent</button>
      <button className="btn flat" disabled>
        Disabled
      </button>
      <button className="btn flat icon-btn" aria-label="Settings">
        <SettingsIcon />
      </button>
    </Row>
  </div>
);

export const Chips: Story = () => {
  const [on, setOn] = useState(["Mon"]);
  const toggle = (d: string) =>
    setOn((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]));
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <Row label="Filter chips">
        <div className="filter-chip-group">
          {days.map((d) => (
            <button
              key={d}
              className={`filter-chip ${on.includes(d) ? "on" : ""}`}
              onClick={() => toggle(d)}
            >
              {d}
            </button>
          ))}
        </div>
      </Row>
      <Row label="Secondary — .flat">
        <div className="filter-chip-group flat">
          {days.map((d) => (
            <button
              key={d}
              className={`filter-chip ${on.includes(d) ? "on" : ""}`}
              onClick={() => toggle(d)}
            >
              {d}
            </button>
          ))}
        </div>
      </Row>
    </div>
  );
};

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

export const Inputs: Story = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 480 }}>
    <p style={{ color: "var(--muted)", fontSize: 14, margin: 0 }}>
      Every text input and select shares the .text-input base — same surface,
      border, focus ring, and .btn-matched height. Specialized fields stack a
      modifier on top.
    </p>
    <Row label="Base">
      <input className="text-input" placeholder="Paste an invite link" style={{ flex: 1 }} />
    </Row>
    <Row label="Sharing a row with a button — the row is .flat, so the button drops its shadow to match">
      <div className="flat" style={{ display: "flex", gap: 8, flex: 1 }}>
        <input className="text-input" placeholder="https://…" style={{ flex: 1 }} />
        <button className="btn">Join</button>
      </div>
    </Row>
    <Row label="Select, number, date — same base">
      <select className="text-input" defaultValue="quick">
        <option value="quick">Quick</option>
        <option value="cryptic">Cryptic</option>
      </select>
      <input className="text-input" type="number" defaultValue={15} style={{ width: 72 }} />
      <input className="text-input" type="date" defaultValue="2026-01-01" />
    </Row>
    <Row label=".ana-input — spaced uppercase letter entry">
      <input
        className="text-input ana-input"
        defaultValue="LISTEN"
        autoCapitalize="characters"
        spellCheck={false}
      />
    </Row>
    <Row label=".compact — the same input, smaller, for dense rows">
      <input className="text-input compact" placeholder="Clue…" style={{ flex: 1 }} />
      <select className="text-input compact" defaultValue="">
        <option value="">+ link…</option>
        <option value="1a">1a</option>
      </select>
    </Row>
    <Row label="States">
      <input className="text-input" disabled placeholder="Disabled" />
      <input className="text-input" readOnly value="Read-only" />
    </Row>
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
