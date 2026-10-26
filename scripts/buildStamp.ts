/**
 * One id per build, written where both the bundles and the service worker can
 * read it: `define` bakes it into every bundle, and `dist/build.json` is the
 * copy on disk the worker compares itself against to notice it is stale.
 */
const STAMP_FILE = new URL("../public/build.json", import.meta.url);

const id = new Date().toISOString();
await Bun.write(STAMP_FILE, `${JSON.stringify({ id }, null, 2)}\n`);
console.log(`build id ${id}`);
