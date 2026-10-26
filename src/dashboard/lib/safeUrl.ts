/**
 * Job URLs come from scraped pages, so a row's link is only rendered when the
 * URL is https and its host is one of the two job boards. The host is compared
 * against the full label boundary: a plain substring test would accept
 * evil-linkedin.com and linkedin.com.evil.net.
 */
const ALLOWED_HOSTS = ["linkedin.com", "indeed.com", "joinhandshake.com"] as const;

export function isDisplayableJobUrl(raw: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  const host = parsed.hostname.toLowerCase();
  return ALLOWED_HOSTS.some((domain: string): boolean => {
    return host === domain || host.endsWith(`.${domain}`);
  });
}
