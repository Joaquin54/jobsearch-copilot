import { bulkPut } from "../../lib/db.ts";
import {
  applicationId,
  companyKeyOf,
  type JobApplication,
  type JobSource,
  type JobType,
  type Modality,
} from "../../lib/types.ts";

/**
 * Dev-only fixture for the performance pass. Reached only from the
 * import.meta.env.DEV branch in main.tsx, so it is absent from a production
 * build.
 *
 * Records go through db.bulkPut — one readwrite transaction rather than 5000
 * awaited upsertApplication calls, each of which would open its own.
 */
const COMPANIES = [
  "Acme Corp",
  "Globex",
  "Initech",
  "Umbrella Health",
  "Stark Industries",
  "Wayne Enterprises",
  "Soylent",
  "Hooli",
  "Vehement Capital",
  "Massive Dynamic",
];

const TITLES = [
  "Frontend Engineer",
  "Backend Engineer",
  "Full-Stack Developer",
  "Platform Engineer",
  "Staff Engineer",
  "Data Engineer",
];

const LOCATIONS = ["Toronto, ON", "Remote", "Vancouver, BC", "Montreal, QC", "Ottawa, ON"];
const JOB_TYPES: readonly (JobType | null)[] = ["Full-Time", "Contract", "Internship", null];
const MODALITIES: readonly (Modality | null)[] = ["Remote", "Hybrid", "On-site", null];
const PAYS: readonly (string | null)[] = ["$120,000 - $150,000", "$90/hr", null];
const SKILLS = ["TypeScript", "React", "Go", "Postgres", "Kubernetes", "Rust", "GraphQL", "AWS"];

/** Deterministic, so two seeds of the same size are comparable. */
function pseudoRandom(seed: number): () => number {
  let state = seed;
  return (): number => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function pick<T>(items: readonly T[], roll: number): T {
  return items[Math.floor(roll * items.length)] ?? (items[0] as T);
}

export async function seedApplications(count: number, months: number): Promise<number> {
  const random = pseudoRandom(count);
  const now = new Date();
  const records: JobApplication[] = [];

  for (let i = 0; i < count; i += 1) {
    const source: JobSource = pick(["linkedin", "indeed", "handshake"] as const, random());
    const company = pick(COMPANIES, random());
    // Spread back over `months` whole months, at a local hour inside the day.
    const dayOffset = Math.floor(random() * months * 30);
    const applied = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - dayOffset,
      Math.floor(random() * 14) + 7,
      Math.floor(random() * 60),
    );
    const posted = new Date(
      applied.getFullYear(),
      applied.getMonth(),
      applied.getDate() - Math.floor(random() * 20),
    );
    const skillCount = Math.floor(random() * 6);
    const nativeBoardId = `seed-${i}`;

    records.push({
      id: applicationId(source, nativeBoardId),
      source,
      nativeBoardId,
      url: `https://www.${source}.com/jobs/view/${1000000 + i}`,
      title: pick(TITLES, random()),
      company,
      companyKey: companyKeyOf(company),
      location: pick(LOCATIONS, random()),
      jobType: pick(JOB_TYPES, random()),
      modality: pick(MODALITIES, random()),
      pay: pick(PAYS, random()),
      skills: SKILLS.slice(0, skillCount),
      requirements: ["Seeded fixture record"],
      datePosted: random() < 0.2 ? null : posted.toISOString(),
      dateApplied: applied.toISOString(),
      // ~70% applied, the rest left pending so the status filter has both.
      status: random() < 0.7 ? "applied" : "pending",
      createdAt: applied.toISOString(),
      updatedAt: applied.toISOString(),
    });
  }

  return await bulkPut(records);
}

/**
 * Exposes the seeder on window and honours ?seed=5000, whose value is captured
 * by main.tsx before the table's URL sync can clear it.
 */
export function installSeeder(requested: number): void {
  const api = { seedApplications };
  Object.assign(window, { jobsearchDev: api });

  if (Number.isInteger(requested) && requested > 0) {
    void seedApplications(requested, 12).then((written: number): void => {
      console.log(`[jobsearch-copilot] seeded ${written} applications; reload to see them`);
    });
  }
}
