type Area = Record<string, unknown>;

const local: Area = {};
const session: Area = {};

function area(store: Area): chrome.storage.StorageArea {
  return {
    get: async (key: string | string[] | null): Promise<Area> => {
      if (key === null || key === undefined) return { ...store };
      const keys = Array.isArray(key) ? key : [key];
      const out: Area = {};
      for (const k of keys) if (k in store) out[k] = store[k];
      return out;
    },
    set: async (items: Area): Promise<void> => {
      Object.assign(store, items);
    },
    remove: async (key: string | string[]): Promise<void> => {
      for (const k of Array.isArray(key) ? key : [key]) delete store[k];
    },
    clear: async (): Promise<void> => {
      for (const k of Object.keys(store)) delete store[k];
    },
  } as unknown as chrome.storage.StorageArea;
}

/**
 * Minimal in-memory stand-in for the two chrome.storage areas we use. The
 * stores are module-level and emptied per install: re-assigning globalThis.chrome
 * does not rebind the global that module code resolves under happy-dom.
 */
export function installChromeDouble(): { local: Area; session: Area } {
  for (const k of Object.keys(local)) delete local[k];
  for (const k of Object.keys(session)) delete session[k];

  (globalThis as { chrome?: unknown }).chrome ??= {};
  const target = (globalThis as { chrome: { storage?: unknown } }).chrome;
  target.storage = { local: area(local), session: area(session) };

  return { local, session };
}
