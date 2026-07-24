/** Date helpers shared by the fetch/parse scripts. */

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Day-of-week abbreviation for an ISO date. Parsed as UTC to avoid timezone
 * drift on the weekday. */
export function weekdayFromIso(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

/** "YYYYMMDD" -> "YYYY-MM-DD". */
export function isoFromYmd(ymd: string): string {
  return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
}

/** "YYMMDD" -> "20YY-MM-DD". */
export function isoFromYymmdd(ymd: string): string {
  return `20${ymd.slice(0, 2)}-${ymd.slice(2, 4)}-${ymd.slice(4, 6)}`;
}
