import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Popup (HTML + React) and the background service worker ship as ES modules.
// Content scripts cannot be modules, so they are built by vite.content.config.ts.
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: "index.html",
        background: "src/background/index.ts",
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});
