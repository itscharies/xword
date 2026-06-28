import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Absolute base for the GitHub Pages project site. It must be absolute (not
// "./") so assets resolve from the same place regardless of the current route
// depth — required now that the app uses real path-based URLs like
// /xword/gdn-cryptic/20260615 (see the SPA redirect in 404.html / index.html).
export default defineConfig({
  base: "/xword/",
  plugins: [react()],
});
