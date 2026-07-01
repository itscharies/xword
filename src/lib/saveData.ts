// Back up and restore everything the app keeps in localStorage — puzzle
// progress, theme/accent, filters, the builder draft — so it can move between
// browsers/devices. All app keys live under the "xword:" prefix.

const PREFIX = "xword:";

interface SaveFile {
  app: "the-daily-grid";
  version: 1;
  exportedAt: string;
  data: Record<string, string>;
}

/** Collect every app-owned localStorage entry. */
function collect(): Record<string, string> {
  const data: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(PREFIX)) data[k] = localStorage.getItem(k) ?? "";
  }
  return data;
}

/** Download the current save data as a JSON file. */
export function exportSaveData(): void {
  const payload: SaveFile = {
    app: "the-daily-grid",
    version: 1,
    exportedAt: new Date().toISOString(),
    data: collect(),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `daily-grid-save-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Restore save data from an exported file, merging into localStorage
 * (overwriting any matching keys). Accepts either the wrapped SaveFile shape
 * or a bare {key: value} map. Returns the number of entries written, or throws
 * if the file isn't valid JSON / has no usable entries.
 */
export async function importSaveData(file: File): Promise<number> {
  const parsed = JSON.parse(await file.text());
  const data: unknown =
    parsed && typeof parsed === "object" && "data" in parsed
      ? (parsed as SaveFile).data
      : parsed;
  if (!data || typeof data !== "object") {
    throw new Error("Unrecognised save file.");
  }
  let n = 0;
  for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
    if (k.startsWith(PREFIX) && typeof v === "string") {
      localStorage.setItem(k, v);
      n++;
    }
  }
  if (n === 0) throw new Error("No Daily Grid save data found in that file.");
  return n;
}
