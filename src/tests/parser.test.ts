import { expect, test } from "bun:test";

import { parseExperience } from "../parser/experience.ts";
import { matchLanguages } from "../parser/languages.ts";
import { formatPay, parsePay } from "../parser/salary.ts";
import { parseJob } from "../parser/index.ts";
import type { Sections } from "../content/boundaries.ts";

const PAY_CASES: readonly (readonly [string, number | null, number | null, string, string | null])[] = [
  ["$120,000 - $150,000 a year", 120000, 150000, "USD", "year"],
  ["$60/hr", 60, 60, "USD", "hour"],
  ["CA$95K–$120K per year", 95000, 120000, "CAD", "year"],
  ["Up to £70,000 annually", null, 70000, "GBP", "year"],
  ["From $25.00 per hour", 25, null, "USD", "hour"],
  ["€4,500 per month", 4500, 4500, "EUR", "month"],
  ["$1,200 a week", 1200, 1200, "USD", "week"],
];

test("pay strings parse into amounts, currency and period", (): void => {
  for (const [raw, min, max, currency, period] of PAY_CASES) {
    const pay = parsePay(raw);
    expect(pay).not.toBeNull();
    expect(pay?.min).toBe(min);
    expect(pay?.max).toBe(max);
    expect(pay?.currency).toBe(currency);
    expect(pay?.period).toBe(period as never);
  }
});

test("pay formats back to a display string", (): void => {
  expect(formatPay(parsePay("$120,000 - $150,000 a year") as never)).toBe(
    "$120,000–$150,000 / year",
  );
  expect(formatPay(parsePay("Up to £70,000 a year") as never)).toBe("Up to £70,000 / year");
  expect(formatPay(parsePay("From $25.50 per hour") as never)).toBe("From $25.50 / hour");
});

test("trailing hours and 401(k) do not become the range minimum", (): void => {
  const indeed = parsePay("$55,000 - $75,000 a year - Full-time, 40 hours per week");
  expect(indeed?.min).toBe(55000);
  expect(indeed?.max).toBe(75000);
  expect(formatPay(indeed as never)).toBe("$55,000–$75,000 / year");

  const withBenefits = parsePay("$120,000 a year, 401(k) matching");
  expect(withBenefits?.min).toBe(120000);
  expect(withBenefits?.max).toBe(120000);
});

test("currency codes are word-bounded", (): void => {
  expect(parsePay("Remote in Europe · $120,000/yr")?.currency).toBe("USD");
  expect(parsePay("Internal audit role, $90,000 a year")?.currency).toBe("USD");
  expect(parsePay("CAD 95,000 - CAD 120,000 per year")?.currency).toBe("CAD");
});

test("text with no numbers is not pay", (): void => {
  expect(parsePay("Competitive salary")).toBeNull();
  expect(parsePay("")).toBeNull();
  // No currency evidence at all: better to store nothing than a wrong range.
  expect(parsePay("40 hours per week")).toBeNull();
});

test("experience forms parse", (): void => {
  expect(parseExperience("3+ years of experience")?.minYears).toBe(3);
  expect(parseExperience("3-5 years experience")).toMatchObject({ minYears: 3, maxYears: 5 });
  expect(parseExperience("minimum of 7 years")?.minYears).toBe(7);
  expect(parseExperience("at least 2 years")?.minYears).toBe(2);
  expect(parseExperience("five years' experience")?.minYears).toBe(5);
  expect(parseExperience("no numbers here")).toBeNull();
});

test("skills match whole tokens only", (): void => {
  expect(matchLanguages("We value trust and good goals")).toEqual([]);
  expect(matchLanguages("Google Cloud shop")).toEqual([]);
  expect(matchLanguages("Rust and Go services")).toEqual(expect.arrayContaining(["Rust", "Go"]));
  expect(matchLanguages("Node.js / TypeScript")).toEqual(
    expect.arrayContaining(["Node.js", "TypeScript"]),
  );
  expect(matchLanguages("C++ and C# teams")).toEqual(expect.arrayContaining(["C++", "C#"]));
  expect(matchLanguages("Our R&D group")).toEqual([]);
});

function sections(overrides: Partial<Sections> = {}): Sections {
  return { description: "", requirements: [], qualifications: [], benefits: [], ...overrides };
}

test("parseJob picks job type, modality, pay and merged skills", (): void => {
  const parsed = parseJob({
    sections: sections({
      description: "Build services with React and Kubernetes.",
      requirements: ["5+ years with TypeScript", "Experience with Terraform"],
    }),
    payRaw: "$120,000 - $150,000 a year",
    titleRaw: "Senior Platform Engineer",
    locationRaw: "Toronto, ON (Hybrid)",
    jobTypeRaw: "Full-time",
  });

  expect(parsed.jobType).toBe("Full-Time");
  expect(parsed.modality).toBe("Hybrid");
  expect(parsed.pay).toBe("$120,000–$150,000 / year");
  expect(parsed.skills).toEqual(expect.arrayContaining(["React", "Kubernetes", "TypeScript", "Terraform"]));
  expect(parsed.requirements).toHaveLength(2);
});

test("the job-type chip outranks the title and prose", (): void => {
  const parsed = parseJob({
    sections: sections({ description: "This is a full-time team." }),
    payRaw: "",
    titleRaw: "Software Engineer Intern",
    locationRaw: "Remote",
    jobTypeRaw: "Co-op",
  });
  expect(parsed.jobType).toBe("Co-op");
  expect(parsed.modality).toBe("Remote");
  expect(parsed.pay).toBeNull();
});

test("qualifications stand in when no requirements section exists", (): void => {
  const parsed = parseJob({
    sections: sections({ qualifications: ["BSc in CS"] }),
    payRaw: "",
    titleRaw: "Engineer",
    locationRaw: "",
    jobTypeRaw: "",
  });
  expect(parsed.requirements).toEqual(["BSc in CS"]);
});
