/*Where does the job posting start and end?*/
import type { JobPosting } from "../lib/types"

export function readFromDom(): JobPosting | null {
  const headings = [...document.querySelectorAll<HTMLHeadElement>("h1, h2, h3, h4")];

  const postingStart = headings.find((h) => /^\s*job\s*$/i.test(h.innerText));

  if (!postingStart) return null;

  const contentHeaders = headings.find((h) =>
    /^\s*(descriptions|requirements|benefits)\s*$/i.test(h.innerText),
  );
};
