/** Dashboard-only tuning. Goals and levels are shared, in src/lib/goals.ts. */

export { MILESTONE_STEP, MONTHLY_GOAL, WEEKLY_GOAL, nextMilestone } from "../lib/goals.ts";

export const PAGE_SIZES = [10, 25, 50] as const;
export const DEFAULT_PAGE_SIZE = 25;

/** Rows per round-trip while building an export. Keeps each yield slice short. */
export const EXPORT_CHUNK = 500;
