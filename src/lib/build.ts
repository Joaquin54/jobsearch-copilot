/**
 * Stamped in by vite's `define` at build time. The `typeof` guard is what lets
 * the same module load under `bun test`, which runs the sources with no define
 * pass and would otherwise throw on the bare identifier.
 */
export const BUILD_ID: string = typeof __BUILD_ID__ === "string" ? __BUILD_ID__ : "dev";
