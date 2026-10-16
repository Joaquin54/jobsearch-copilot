export type JobSource = "linkedin" | "indeed";
export type SupportedDomain = "linkedin.com" | "indeed.com";
export type JobType = "Contract" | "Full-Time" | "Part-Time" | "Internship" | "Co-op";
export type Modality = "Remote" | "Hybrid" | "On-site";
export type ApplicationStatus = "pending" | "applied";

/** ISO-8601 UTC, e.g. 2026-10-15T14:03:00.000Z. Lexicographic order == chronological. */
export type IsoDate = string;

export type JobApplication = {
  id: string;
  source: JobSource;
  nativeBoardId: string;
  url: string;
  title: string;
  company: string;
  /** company lowercased + trimmed; index key only, never displayed. */
  companyKey: string;
  location: string;
  jobType: JobType | null;
  modality: Modality | null;
  pay: string | null;
  skills: string[];
  requirements: string[];
  datePosted: IsoDate | null;
  dateApplied: IsoDate;
  status: ApplicationStatus;
  createdAt: IsoDate;
  updatedAt: IsoDate;
};

/** What a content script can produce. The db fills in the rest. */
export type JobDraft = Omit<
  JobApplication,
  "id" | "companyKey" | "status" | "dateApplied" | "createdAt" | "updatedAt"
>;

export type ApplicationQuery = {
  status?: ApplicationStatus;
  source?: JobSource;
  companyKey?: string;
  sort: "dateApplied";
  direction: "asc" | "desc";
  limit: number;
  offset: number;
};

export function applicationId(source: JobSource, nativeBoardId: string): string {
  return `${source}:${nativeBoardId}`;
}

export function companyKeyOf(company: string): string {
  return company.trim().toLowerCase();
}
