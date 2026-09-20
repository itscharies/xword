import { useEffect, useState } from "react";
import { getConnState, onConnChange, type ConnState } from "../lib/online.ts";

/** Live connectivity state (see lib/online.ts) — used to disable "Save
 *  offline" while there's no network to fetch a puzzle with. */
export function useConnState(): ConnState {
  const [state, setState] = useState(getConnState);
  useEffect(() => onConnChange(setState), []);
  return state;
}
