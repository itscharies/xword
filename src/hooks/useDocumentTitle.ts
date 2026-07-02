import { useEffect } from "react";

/** Sets the browser tab title for the page a component represents. */
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    document.title = title ? `${title} — The Daily Grid` : "The Daily Grid";
  }, [title]);
}
