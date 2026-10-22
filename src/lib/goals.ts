/** Goals and activity levels, shared by the popup and the dashboard. */

export const WEEKLY_GOAL = 15;
export const MONTHLY_GOAL = 60;

/** Milestones are the next multiple of this, strictly above the running total. */
export const MILESTONE_STEP = 50;

/** Upper bound of each activity level: 0, 1-2, 3-4, 5-6, 7+. */
export const LEVEL_BOUNDS = [0, 2, 4, 6] as const;

export const LEVEL_COUNT = LEVEL_BOUNDS.length + 1;

export type Level = 0 | 1 | 2 | 3 | 4;

export function levelOf(count: number): Level {
  if (count <= 0) return 0;
  if (count <= 2) return 1;
  if (count <= 4) return 2;
  if (count <= 6) return 3;
  return 4;
}

/** 200 -> 250, 214 -> 250. Clamped, so a bad count can never read as negative. */
export function nextMilestone(total: number): number {
  return (Math.floor(Math.max(total, 0) / MILESTONE_STEP) + 1) * MILESTONE_STEP;
}
