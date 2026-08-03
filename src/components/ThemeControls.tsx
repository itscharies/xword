import { useState } from "react";
import {
  ACCENTS,
  getAccent,
  getAutoAdvance,
  getBackfillGaps,
  getGridFit,
  getMode,
  getSkipFilledClues,
  getSkipFilledSquares,
  setAccent,
  setAutoAdvance,
  setBackfillGaps,
  setGridFit,
  setMode,
  setSkipFilledClues,
  setSkipFilledSquares,
  type AccentId,
  type GridFit,
  type Mode,
} from "../lib/theme.ts";
import { MoonIcon, SunIcon, SystemIcon } from "./icons.tsx";
import { CheckRow } from "./CheckRow.tsx";
import { useAuth } from "../hooks/useAuthContext.tsx";

/** Body of the settings modal: theme mode picker plus, for signed-out
 *  users only, the accent picker — signed-in users' accent follows their
 *  profile's avatar colour (set on the account page) instead. */
export function ThemeControls() {
  const { user } = useAuth();
  const [mode, setModeState] = useState<Mode>(getMode);
  const [accent, setAccentState] = useState<AccentId>(getAccent);
  const [advance, setAdvanceState] = useState<boolean>(getAutoAdvance);
  const [skipFilled, setSkipFilledState] = useState<boolean>(getSkipFilledSquares);
  const [backfill, setBackfillState] = useState<boolean>(getBackfillGaps);
  const [skipDone, setSkipDoneState] = useState<boolean>(getSkipFilledClues);
  const [gridFit, setGridFitState] = useState<GridFit>(getGridFit);

  const choose = (m: Mode) => {
    setMode(m);
    setModeState(m);
  };
  const pick = (id: AccentId) => {
    setAccent(id);
    setAccentState(id);
  };
  const changeAdvance = (next: boolean) => {
    setAutoAdvance(next);
    setAdvanceState(next);
  };
  const changeSkipFilled = (next: boolean) => {
    setSkipFilledSquares(next);
    setSkipFilledState(next);
  };
  const changeBackfill = (next: boolean) => {
    setBackfillGaps(next);
    setBackfillState(next);
  };
  const changeSkipDone = (next: boolean) => {
    setSkipFilledClues(next);
    setSkipDoneState(next);
  };
  const chooseGridFit = (fit: GridFit) => {
    setGridFit(fit);
    setGridFitState(fit);
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

      {!user && (
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
      )}

      <div className="setting-row">
        <span className="setting-label">Typing</span>
        <CheckRow
          checked={skipFilled}
          onChange={changeSkipFilled}
          label="Skip over squares that are already filled"
        />
        <CheckRow
          checked={backfill}
          onChange={changeBackfill}
          label="Jump back to the first blank in the word"
        />
      </div>

      <div className="setting-row">
        <span className="setting-label">Clues</span>
        <CheckRow
          checked={advance}
          onChange={changeAdvance}
          label="Skip to the next clue when a word is finished"
        />
        <CheckRow
          checked={skipDone}
          onChange={changeSkipDone}
          label="Skip clues that are already filled"
        />
      </div>

      <div className="setting-row">
        <span className="setting-label">Grid</span>
        <div className="seg">
          <button
            className={`seg-btn ${gridFit === "width" ? "active" : ""}`}
            onClick={() => chooseGridFit("width")}
            aria-pressed={gridFit === "width"}
          >
            Fit
          </button>
          <button
            className={`seg-btn ${gridFit === "canvas" ? "active" : ""}`}
            onClick={() => chooseGridFit("canvas")}
            aria-pressed={gridFit === "canvas"}
          >
            Pan &amp; zoom
          </button>
        </div>
      </div>
    </div>
  );
}
