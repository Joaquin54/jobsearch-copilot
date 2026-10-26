import { expect, test } from "bun:test";

/**
 * Chrome reads content_scripts[].matches when the extension loads, so a board
 * missing from this file is injected nowhere until the extension is reloaded —
 * a silent failure no adapter test can catch, because the adapter itself is
 * fine. These assertions are the fan-out's only guard.
 */
const PATTERNS = [
  "https://*.linkedin.com/*",
  "https://*.indeed.com/*",
  "https://*.joinhandshake.com/*",
];

type Manifest = {
  content_scripts: { matches: string[]; js: string[] }[];
  host_permissions: string[];
};

async function manifest(): Promise<Manifest> {
  return (await Bun.file(`${import.meta.dir}/../../public/manifest.json`).json()) as Manifest;
}

test("every supported board is matched and permitted", async (): Promise<void> => {
  const { content_scripts: scripts, host_permissions: hosts } = await manifest();
  expect(scripts).toHaveLength(1);
  // A "*." host pattern covers the apex and every subdomain, which is what
  // makes one Handshake pattern enough for every school's own host.
  for (const pattern of PATTERNS) {
    expect(scripts[0]?.matches).toContain(pattern);
    expect(hosts).toContain(pattern);
  }
});

test("the content script the manifest names is the one the build emits", async (): Promise<void> => {
  const { content_scripts: scripts } = await manifest();
  expect(scripts[0]?.js).toEqual(["content.js"]);
});
