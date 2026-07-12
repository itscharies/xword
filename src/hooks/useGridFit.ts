import { useSyncExternalStore } from "react";
import { getGridFit, subscribeGridFit, type GridFit } from "../lib/theme.ts";

/** The grid-fit setting as live state — re-renders when the settings modal
 *  flips it, so the solver can swap between the fit and canvas grid views
 *  without a reload. */
export function useGridFit(): GridFit {
  return useSyncExternalStore(subscribeGridFit, getGridFit);
}
