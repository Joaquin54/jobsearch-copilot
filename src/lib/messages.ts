export type ScrapedJob = {
  title: string;
  company: string;
  url: string;
};

export type Message =
  | { type: "SCRAPE_JOB" }
  | { type: "JOB_SCRAPED"; payload: ScrapedJob };
