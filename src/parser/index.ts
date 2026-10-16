import type { JobType, Modality } from "../lib/types.ts";
import type { Sections } from "../content/boundaries.ts";
import skills from "./dictionaries/skills.json" with { type: "json" };
import { buildPhrases, matchDictionary, matchLanguages, type Dictionary } from "./languages.ts";
import { formatPay, parsePay } from "./salary.ts";

const SKILL_PHRASES = buildPhrases(skills as Dictionary);

export type ParsedFields = {
  jobType: JobType | null;
  modality: Modality | null;
  pay: string | null;
  skills: string[];
  requirements: string[];
};

export type ParseInput = {
  sections: Sections;
  payRaw: string;
  titleRaw: string;
  locationRaw: string;
  jobTypeRaw: string;
};

const JOB_TYPE_PATTERNS: readonly (readonly [RegExp, JobType])[] = [
  [/\bco-?op\b/i, "Co-op"],
  [/\bintern(ship)?\b/i, "Internship"],
  [/\b(?:contract|contractor|fixed[- ]term|c2h|contract[- ]to[- ]hire)\b/i, "Contract"],
  [/\bpart[- ]time\b/i, "Part-Time"],
  [/\bfull[- ]time\b/i, "Full-Time"],
];

const MODALITY_PATTERNS: readonly (readonly [RegExp, Modality])[] = [
  [/\bhybrid\b/i, "Hybrid"],
  [/\bremote\b|\bwork from home\b|\bwfh\b/i, "Remote"],
  [/\bon-?site\b|\bin-?office\b|\bin person\b/i, "On-site"],
];

function firstMatch<T>(text: string, patterns: readonly (readonly [RegExp, T])[]): T | null {
  for (const [pattern, value] of patterns) {
    if (pattern.test(text)) return value;
  }
  return null;
}

export function parseJob(input: ParseInput): ParsedFields {
  const { sections } = input;
  const body = [
    sections.description,
    ...sections.requirements,
    ...sections.qualifications,
    ...sections.benefits,
  ].join("\n");

  // The job-type chip is the most reliable signal, then the title, then prose.
  const jobType =
    firstMatch(input.jobTypeRaw, JOB_TYPE_PATTERNS) ??
    firstMatch(input.titleRaw, JOB_TYPE_PATTERNS) ??
    firstMatch(body, JOB_TYPE_PATTERNS);

  const modality =
    firstMatch(input.locationRaw, MODALITY_PATTERNS) ??
    firstMatch(input.titleRaw, MODALITY_PATTERNS) ??
    firstMatch(body, MODALITY_PATTERNS);

  const payText = input.payRaw.trim() !== "" ? input.payRaw : "";
  const pay = payText === "" ? null : parsePay(payText);

  const searchText = `${input.titleRaw}\n${body}`;
  const merged = new Set<string>([
    ...matchLanguages(searchText),
    ...matchDictionary(searchText, SKILL_PHRASES),
  ]);

  const requirements =
    sections.requirements.length > 0 ? sections.requirements : sections.qualifications;

  return {
    jobType,
    modality,
    pay: pay === null ? null : formatPay(pay),
    skills: [...merged].sort(),
    requirements,
  };
}
