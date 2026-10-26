import type { SupportedDomain } from "./types.ts";

export type ActivationChoice = "yes" | "not-now" | "never";

/** What the background tells a content script. "not-now" collapses into "suppressed". */
export type ActivationState = "ask" | "suppressed" | "active";

export type Settings = {
  activation: Partial<Record<SupportedDomain, ActivationChoice>>;
};

export function defaultSettings(): Settings {
  return { activation: {} };
}

const LOCAL_KEY = "settings";
const SESSION_PREFIX = "suppressed:";
const QUOTA_WARNED_KEY = "quotaWarned";

export async function readSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get(LOCAL_KEY);
  const value: unknown = stored[LOCAL_KEY];
  if (!value || typeof value !== "object") return defaultSettings();
  const partial = value as Partial<Settings>;
  return { activation: partial.activation ?? {} };
}

async function writeSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ [LOCAL_KEY]: settings });
}

export async function setActivation(
  domain: SupportedDomain,
  choice: ActivationChoice,
): Promise<void> {
  const settings = await readSettings();
  if (choice === "not-now") {
    await suppressForSession(domain);
    return;
  }
  settings.activation = { ...settings.activation, [domain]: choice };
  await writeSettings(settings);
}

/**
 * Puts the domain back to "ask". Both stores are cleared: a "not-now" from this
 * session would otherwise outlive the reset and keep the card hidden.
 */
export async function clearActivation(domain: SupportedDomain): Promise<void> {
  const settings = await readSettings();
  const activation = { ...settings.activation };
  delete activation[domain];
  await writeSettings({ ...settings, activation });
  await chrome.storage.session.remove(`${SESSION_PREFIX}${domain}`);
}

/**
 * Session-scoped on purpose: dismissing the warning silences it for this
 * browsing session only, so ignoring it once cannot mute the warning forever.
 */
export async function setQuotaWarned(warned: boolean): Promise<void> {
  if (warned) {
    await chrome.storage.session.set({ [QUOTA_WARNED_KEY]: true });
    return;
  }
  await chrome.storage.session.remove(QUOTA_WARNED_KEY);
}

export async function wasQuotaWarned(): Promise<boolean> {
  const stored = await chrome.storage.session.get(QUOTA_WARNED_KEY);
  return stored[QUOTA_WARNED_KEY] === true;
}

/**
 * "not-now" lives in chrome.storage.session, which defaults to TRUSTED_CONTEXTS —
 * only the background can read it, which is why activation is resolved there.
 */
export async function suppressForSession(domain: SupportedDomain): Promise<void> {
  await chrome.storage.session.set({ [`${SESSION_PREFIX}${domain}`]: true });
}

export async function isSuppressedThisSession(domain: SupportedDomain): Promise<boolean> {
  const key = `${SESSION_PREFIX}${domain}`;
  const stored = await chrome.storage.session.get(key);
  return stored[key] === true;
}

/**
 * Every domain answered "Not now" this session. Reads the whole session store
 * and keeps the SESSION_PREFIX keys: the `as SupportedDomain` cast is safe only
 * because suppressForSession is the sole writer of that prefix.
 */
export async function suppressedThisSession(): Promise<SupportedDomain[]> {
  const stored = await chrome.storage.session.get();
  return Object.keys(stored)
    .filter((key: string): boolean => key.startsWith(SESSION_PREFIX) && stored[key] === true)
    .map((key: string): SupportedDomain => key.slice(SESSION_PREFIX.length) as SupportedDomain);
}

export async function resolveActivation(domain: SupportedDomain): Promise<ActivationState> {
  const settings = await readSettings();
  const choice = settings.activation[domain];
  if (choice === "yes") return "active";
  if (choice === "never") return "suppressed";
  return (await isSuppressedThisSession(domain)) ? "suppressed" : "ask";
}
