import { readFileSync } from "node:fs";

import { stampIdOf } from "./src/lib/buildStamp.ts";

/**
 * The id `bun scripts/buildStamp.ts` just wrote, so every bundle in one build
 * carries the same one — which is what lets the worker compare itself against
 * dist/build.json. "dev" stands in for `vite dev`, where no stamp was written.
 */
export function buildId(): string {
  try {
    return stampIdOf(JSON.parse(readFileSync("public/build.json", "utf8"))) ?? "dev";
  } catch {
    return "dev";
  }
}
