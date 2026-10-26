import { handshakeAdapter } from "./handshake.ts";
import { indeedAdapter } from "./indeed.ts";
import { linkedinAdapter } from "./linkedin.ts";
import type { SiteAdapter } from "./types.ts";

export type { FieldContext, FieldName, FieldReader, Selector, SiteAdapter } from "./types.ts";

export const ADAPTERS: readonly SiteAdapter[] = [linkedinAdapter, indeedAdapter, handshakeAdapter];

export function resolveAdapter(url: URL): SiteAdapter | null {
  return ADAPTERS.find((adapter: SiteAdapter): boolean => adapter.matches(url)) ?? null;
}
