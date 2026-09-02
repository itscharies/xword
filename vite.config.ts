import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Absolute base for the GitHub Pages project site. It must be absolute (not
// "./") so assets resolve from the same place regardless of the current route
// depth — required now that the app uses real path-based URLs like
// /xword/gdn-cryptic/20260615 (see the SPA redirect in 404.html / index.html).
export default defineConfig({
  base: "/xword/",
  plugins: [react()],
  server: {
    port: Number(process.env.PORT) || 5173,
    // Vite only binds to localhost by default — unreachable from a phone on
    // the same network. This exposes it on the LAN too (Vite prints the
    // actual IP to use on startup).
    host: true,
  },
});
