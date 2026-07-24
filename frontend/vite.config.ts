import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Repo layout: this project lives in `frontend/`, one level below the repo
// root. The UI intentionally imports its contract addresses and ABIs
// straight from the backend's own generated artifacts instead of
// hand-copying them (see src/config/contracts.ts) — the golden rule being
// "never let the UI's idea of an address/ABI drift from what was actually
// deployed". That requires Vite's dev-server to be allowed to read outside
// `frontend/` (its own project root), specifically the repo root's
// `deployments/` and `artifacts/` directories.
export default defineConfig({
  plugins: [react()],
  server: {
    fs: {
      allow: [".."],
    },
  },
});
