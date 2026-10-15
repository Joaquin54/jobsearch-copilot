type Status = "applied" | "not_applied";
export type JobPosting = {
  id: string;
  title: string;
  keywords: string[];
  requirements: string[];
  application_status: Status;
  salary_range: string[]; // Tuple?
}
export type ReadResponse = { ok: true; job_posting: JobPosting } | { ok: false; reason: string }

