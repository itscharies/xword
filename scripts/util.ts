/** Small helpers shared by the fetch/migrate scripts. */

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Run a script's async main(), exiting non-zero on failure. */
export function runMain(main: () => Promise<unknown>): void {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
