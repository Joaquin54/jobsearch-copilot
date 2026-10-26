import { defineConfig } from "vite";

import { buildId } from "./vite.buildId.ts";

// MV3 content scripts run as classic scripts, so this pass emits a single IIFE
// bundle into the dist produced by vite.config.ts.
export default defineConfig({
  define: { __BUILD_ID__: JSON.stringify(buildId()) },
  build: {
    outDir: "dist",
    emptyOutDir: false,
    lib: {
      entry: "src/content/index.ts",
      name: "jobsearchCopilotContent",
      formats: ["iife"],
      fileName: (): string => "content.js",
    },
  },
});
