import { useState } from "react";
import type { Story, StoryDefault } from "@ladle/react";
import { SettingsIcon } from "../components/icons.tsx";
import { Note } from "./helpers.tsx";

/** The class-styled controls (.btn, .filter-chip, .seg, .text-input) — as
 *  much Primitives as the component-shaped ones, they just have no .tsx of
 *  their own. Each comes in a raised default and a flat secondary variant;
 *  Foundations / Elevation shows where each variant belongs. */
export default {
  title: "Primitives / Controls",
} satisfies StoryDefault;

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <div className="setting-label" style={{ marginBottom: 8 }}>
      {label}
    </div>
    {/* 8px is the app's gap between adjacent controls in a row (12px is
        reserved for gaps between whole groups). */}
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
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
    <Row label="Secondary — .flat: shadowless with the tinted key face, inset press (as inside modals and panels)">
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
      <Row label="Secondary — .flat: tinted face, selected shows the inset pressed face">
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
    <Note>
      Every text input and select shares the .text-input base — same surface,
      border, focus ring, and .btn-matched height. Specialized fields stack a
      modifier on top.
    </Note>
    <Row label="Base">
      <input className="text-input" placeholder="Paste an invite link" style={{ flex: 1 }} />
    </Row>
    <Row label="Sharing a row with a button — the row is .flat: the button drops its shadow but keeps the tinted key face, so it never reads as a second field">
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
