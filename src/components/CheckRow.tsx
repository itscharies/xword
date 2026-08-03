import { CheckIcon } from "./icons.tsx";

/** The app's one checkbox-style control — a bordered box that shows a check
 *  icon when on, with the same depress-on-click animation as every other
 *  button. Shared by Settings' "auto-advance" toggle and the archive's
 *  "people you follow" filter, so both look and behave identically. */
export function CheckRow({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  /** For sub-options gated on a parent toggle: keeps its stored value
   *  visible but washed out and untogglable while the parent is off. */
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      className="check-row"
      onClick={() => onChange(!checked)}
      disabled={disabled}
    >
      <span className={`checkbox ${checked ? "on" : ""}`}>{checked && <CheckIcon />}</span>
      <span>{label}</span>
    </button>
  );
}
