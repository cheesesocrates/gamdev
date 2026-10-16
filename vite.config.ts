import { defineConfig } from "vite";

// The Kenney source bundle (93k files) lives in the project folder; keep Vite's
// watcher and dependency scanner away from it.
const IGNORED = ["**/Kenney Game Assets*/**", "**/assets_src/**", "**/tools/models/**", "**/dist/**"];

export default defineConfig({
  base: "./",
  server: {
    port: 5173,
    strictPort: false,
    watch: { ignored: IGNORED }
  },
  optimizeDeps: {
    entries: ["index.html", "tools/render.html"]
  },
  build: {
    outDir: "dist",
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 2000
  }
});
