import { useEffect, useState } from "react";

/** Track a CSS media query. */
export function useMediaQuery(query: string): boolean {
  const [match, setMatch] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setMatch(m.matches);
    m.addEventListener("change", on);
    setMatch(m.matches);
    return () => m.removeEventListener("change", on);
  }, [query]);
  return match;
}
