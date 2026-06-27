import { useState } from "react";
import {
  ACCENTS,
  getAccent,
  getMode,
  setAccent,
  setMode,
  type AccentId,
  type Mode,
} from "../lib/theme.ts";

/** Body of the settings modal: theme mode + accent colour pickers. */
export function ThemeControls() {
  const [mode, setModeState] = useState<Mode>(getMode);
  const [accent, setAccentState] = useState<AccentId>(getAccent);

  const choose = (m: Mode) => {
    setMode(m);
    setModeState(m);
  };
  const pick = (id: AccentId) => {
    setAccent(id);
    setAccentState(id);
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
            ☾ Light
          </button>
          <button
            className={`seg-btn ${mode === "dark" ? "active" : ""}`}
            onClick={() => choose("dark")}
            aria-pressed={mode === "dark"}
          >
            ☀ Dark
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
    </div>
  );
}
