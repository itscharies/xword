import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base is './' so the built site works under any static host subpath
// (e.g. GitHub Pages project sites).
export default defineConfig({
  base: "./",
  plugins: [react()],
});
