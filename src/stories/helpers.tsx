/** Story-only layout bits, shared so every gallery page reads the same. */

/** The muted intro paragraph above a story — what it shows, how to poke it. */
export const Note = ({ children }: { children: React.ReactNode }) => (
  <p style={{ maxWidth: 560, color: "var(--muted)", fontSize: 14 }}>{children}</p>
);

/** Standard layout for a solver control paired with the grid it drives —
 *  control above, grid below, the app's column rhythm. Solver stories run
 *  the real engine, so the grid is what makes their state visible; every
 *  story of a grid-driving component uses this instead of ad-hoc wrappers. */
export const WithGrid = ({ children }: { children: React.ReactNode }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 560 }}>
    {children}
  </div>
);
