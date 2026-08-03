import { useState } from "react";
import {
  ACCENTS,
  getAccent,
  getAdvanceAnywhere,
  getAutoAdvance,
  getAutocheck,
  getBackfillGaps,
  getBackspacePrevWord,
  getGridFit,
  getMode,
  getShowTimer,
  getSkipFilledClues,
  getSkipFilledSquares,
  getSpaceClears,
  getStrikeFilledClues,
  setAccent,
  setAdvanceAnywhere,
  setAutoAdvance,
  setAutocheck,
  setBackfillGaps,
  setBackspacePrevWord,
  setGridFit,
  setMode,
  setShowTimer,
  setSkipFilledClues,
  setSkipFilledSquares,
  setSpaceClears,
  setStrikeFilledClues,
  type AccentId,
  type GridFit,
  type Mode,
} from "../lib/theme.ts";
import { MoonIcon, SunIcon, SystemIcon } from "./icons.tsx";
import { CheckRow } from "./CheckRow.tsx";
import { useAuth } from "../hooks/useAuthContext.tsx";

/** One boolean setting: reads its saved value on mount, writes through on
 *  toggle. Keeps the modal body from drowning in per-toggle useState. */
function PrefRow({
  get,
  set,
  label,
  disabled,
}: {
  get: () => boolean;
  set: (on: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  const [on, setOn] = useState<boolean>(get);
  return (
    <CheckRow
      checked={on}
      onChange={(next) => {
        set(next);
        setOn(next);
      }}
      label={label}
      disabled={disabled}
    />
  );
}

/** Body of the settings modal: theme mode picker plus, for signed-out
 *  users only, the accent picker — signed-in users' accent follows their
 *  profile's avatar colour (set on the account page) instead. */
export function ThemeControls() {
  const { user } = useAuth();
  const [mode, setModeState] = useState<Mode>(getMode);
  const [accent, setAccentState] = useState<AccentId>(getAccent);
  const [gridFit, setGridFitState] = useState<GridFit>(getGridFit);
  // Lifted out of PrefRow because the "from anywhere" sub-row disables
  // itself while this is off.
  const [advance, setAdvanceState] = useState<boolean>(getAutoAdvance);

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
        <PrefRow
          get={getSkipFilledSquares}
          set={setSkipFilledSquares}
          label="Skip over squares that are already filled"
        />
        <PrefRow
          get={getBackfillGaps}
          set={setBackfillGaps}
          label="Jump back to the first blank in the word"
        />
        <PrefRow
          get={getSpaceClears}
          set={setSpaceClears}
          label="Space clears the square (instead of switching direction)"
        />
        <PrefRow
          get={getBackspacePrevWord}
          set={setBackspacePrevWord}
          label="Backspace into the previous word"
        />
      </div>

      <div className="setting-row">
        <span className="setting-label">Clues</span>
        <CheckRow
          checked={advance}
          onChange={changeAdvance}
          label="Skip to the next clue when a word is finished"
        />
        {/* Sub-option of auto-advance — meaningless on its own, so it can
            only be toggled while its parent is on. */}
        <div className="check-sub">
          <PrefRow
            get={getAdvanceAnywhere}
            set={setAdvanceAnywhere}
            label="From anywhere in the word, not just the end"
            disabled={!advance}
          />
        </div>
        <PrefRow
          get={getSkipFilledClues}
          set={setSkipFilledClues}
          label="Skip clues that are already filled"
        />
        <PrefRow
          get={getStrikeFilledClues}
          set={setStrikeFilledClues}
          label="Strike through clues that are already filled"
        />
      </div>

      <div className="setting-row">
        <span className="setting-label">Checking</span>
        <PrefRow
          get={getAutocheck}
          set={setAutocheck}
          label="Check letters as you type"
        />
      </div>

      <div className="setting-row">
        <span className="setting-label">Timer</span>
        <PrefRow get={getShowTimer} set={setShowTimer} label="Show the timer" />
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
