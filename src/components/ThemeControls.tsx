import { useState } from "react";
import {
  ACCENTS,
  getAccent,
  getAutoAdvance,
  getMode,
  setAccent,
  setAutoAdvance,
  setMode,
  type AccentId,
  type Mode,
} from "../lib/theme.ts";
import { CheckIcon, MoonIcon, SunIcon, SystemIcon } from "./icons.tsx";

/** Body of the settings modal: theme mode + accent colour pickers. */
export function ThemeControls() {
  const [mode, setModeState] = useState<Mode>(getMode);
  const [accent, setAccentState] = useState<AccentId>(getAccent);
  const [advance, setAdvanceState] = useState<boolean>(getAutoAdvance);

  const choose = (m: Mode) => {
    setMode(m);
    setModeState(m);
  };
  const pick = (id: AccentId) => {
    setAccent(id);
    setAccentState(id);
  };
  const toggleAdvance = () => {
    const next = !advance;
    setAutoAdvance(next);
    setAdvanceState(next);
  };

  return (
    <div className="settings">
      <div className="setting-row">
        <span className="setting-label">Theme</span>
        <div className="seg">
          <button
            className={`seg-btn ${mode === "light" ? "active" : ""}`}
            onClick={() => choose("light")}
            aria-pressed={mode === "light"}
          >
            <SunIcon /> Light
          </button>
          <button
            className={`seg-btn ${mode === "dark" ? "active" : ""}`}
            onClick={() => choose("dark")}
            aria-pressed={mode === "dark"}
          >
            <MoonIcon /> Dark
          </button>
          <button
            className={`seg-btn ${mode === "system" ? "active" : ""}`}
            onClick={() => choose("system")}
            aria-pressed={mode === "system"}
          >
            <SystemIcon /> System
          </button>
        </div>
      </div>

      <div className="setting-row">
        <span className="setting-label">Accent</span>
        <div className="swatches" role="radiogroup" aria-label="Accent colour">
          {ACCENTS.map((a) => (
            <button
              key={a.id}
              className={`swatch ${accent === a.id ? "active" : ""}`}
              style={{ background: a.swatch }}
              onClick={() => pick(a.id)}
              role="radio"
              aria-checked={accent === a.id}
              aria-label={a.label}
              title={a.label}
            />
          ))}
        </div>
      </div>

      <div className="setting-row">
        <span className="setting-label">Typing</span>
        <button
          type="button"
          role="checkbox"
          aria-checked={advance}
          className="check-row"
          onClick={toggleAdvance}
        >
          <span className={`checkbox ${advance ? "on" : ""}`}>
            {advance && <CheckIcon />}
          </span>
          <span>Skip to the next clue when a word is finished</span>
        </button>
      </div>
    </div>
  );
}
