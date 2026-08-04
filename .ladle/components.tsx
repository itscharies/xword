import { useEffect, useState } from "react";
import type { GlobalProvider } from "@ladle/react";
import { ACCENTS, setAccent, type AccentId } from "../src/lib/theme.ts";
import "../src/index.css";

/** Wires Ladle's built-in light/dark toggle to the app's [data-theme]
 *  attribute, and adds a floating accent picker (top-right) so every story
 *  can be checked against all ten [data-accent] palettes. */
export const Provider: GlobalProvider = ({ globalState, children }) => {
  const [accent, pickAccent] = useState<AccentId>("yellow");
  const [probe, setProbe] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const dark =
      globalState.theme === "dark" ||
      (globalState.theme === "auto" &&
        matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }, [globalState.theme]);

  useEffect(() => {
    setAccent(accent);
  }, [accent]);

  /* When a viewport width is picked, Ladle moves the story into a real
     iframe and copies the parent head's stylesheets across — but not the
     <html> attributes, and every token in index.css hangs off [data-theme]/
     [data-accent]. The probe span tells us which document the story really
     rendered into; mirror the attributes onto that root (and keep them in
     step when the toggles change them on the parent). */
  useEffect(() => {
    if (!probe) return;
    const src = document.documentElement;
    const dst = probe.ownerDocument.documentElement;
    if (dst === src) return;
    const sync = () => {
      dst.dataset.theme = src.dataset.theme;
      dst.dataset.accent = src.dataset.accent;
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(src, {
      attributes: true,
      attributeFilter: ["data-theme", "data-accent"],
    });
    return () => observer.disconnect();
  }, [probe]);

  return (
    <>
      <span ref={setProbe} hidden />
      {/* Ladle's story pane paints its own background; hand it the app's. */}
      <style>{`.ladle-main { background: var(--bg); color: var(--fg); }`}</style>
      <div
        style={{
          position: "fixed",
          bottom: 8,
          right: 8,
          zIndex: 30,
          display: "flex",
          gap: 4,
        }}
      >
        {ACCENTS.map((a) => (
          <button
            key={a.id}
            title={a.label}
            aria-label={`Accent: ${a.label}`}
            aria-pressed={a.id === accent}
            onClick={() => pickAccent(a.id)}
            style={{
              width: 16,
              height: 16,
              padding: 0,
              background: a.swatch,
              border: "2px solid",
              borderColor: a.id === accent ? "var(--fg)" : "transparent",
              borderRadius: "50%",
            }}
          />
        ))}
      </div>
      {children}
    </>
  );
};
