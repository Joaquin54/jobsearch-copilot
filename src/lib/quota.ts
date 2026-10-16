export type QuotaReading = { usage: number; quota: number; ratio: number };

export const WARN_RATIO = 0.8;

/**
 * navigator.storage.estimate() is origin-wide and approximate (compression,
 * dedup), so the ratio is advisory — never a hard gate on writes.
 */
export async function readQuota(): Promise<QuotaReading> {
  const estimate = await navigator.storage.estimate();
  const usage = estimate.usage ?? 0;
  const quota = estimate.quota ?? 0;
  return { usage, quota, ratio: quota > 0 ? usage / quota : 0 };
}

export function isOverThreshold(reading: QuotaReading): boolean {
  return reading.ratio >= WARN_RATIO;
}
