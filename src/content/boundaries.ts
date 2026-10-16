/** Where does each part of a job description start and end? */

export type Sections = {
  description: string;
  requirements: string[];
  qualifications: string[];
  benefits: string[];
};

type SectionKind = "requirements" | "qualifications" | "benefits" | "description";

const HEADING_PATTERNS: readonly (readonly [RegExp, SectionKind])[] = [
  [/requirement|what you.?ll need|must have|you have|need to have/i, "requirements"],
  [/qualificat|skills|experience|nice to have|preferred|about you/i, "qualifications"],
  [/benefit|perk|we offer|compensation|what we offer/i, "benefits"],
  [/responsibilit|what you.?ll do|the role|about the (?:role|job)|duties/i, "description"],
];

const HEADING_TAGS = new Set(["H1", "H2", "H3", "H4", "H5", "H6"]);

function classify(text: string): SectionKind | null {
  const trimmed = text.trim();
  if (trimmed === "" || trimmed.length > 80) return null;
  for (const [pattern, kind] of HEADING_PATTERNS) {
    if (pattern.test(trimmed)) return kind;
  }
  return null;
}

/** A bolded lone line reads as a heading on both boards as often as an <h3>. */
function isHeadingLike(element: Element): boolean {
  if (HEADING_TAGS.has(element.tagName)) return true;
  if ((element.getAttribute("class") ?? "").toLowerCase().includes("heading")) return true;
  if (element.tagName === "STRONG" || element.tagName === "B") {
    const parent = element.parentElement;
    return parent !== null && parent.childElementCount === 1;
  }
  return false;
}

function textOf(element: Element): string {
  return (element.textContent ?? "").replace(/\s+/g, " ").trim();
}

function bulletsOf(block: Element): string[] {
  const items = [...block.querySelectorAll("li")].map(textOf).filter((t: string): boolean => t !== "");
  if (items.length > 0) return items;
  // Split the raw text, before whitespace is collapsed, so newline- and
  // dash-delimited lists still come apart into separate entries.
  return (block.textContent ?? "")
    .split(/[\u2022\u2023\u25cf\n\r]+|\s+-\s+/)
    .map((line: string): string => line.replace(/^-\s*/, "").replace(/\s+/g, " ").trim())
    .filter((line: string): boolean => line.length > 2);
}

/**
 * Walks the detail root's blocks once, switching buckets whenever a
 * heading-like node names a new section. Prose before any recognised heading is
 * the description, so a posting with no headings at all still yields a usable
 * record rather than nothing.
 */
export function sectionize(root: ParentNode): Sections {
  const sections: Sections = {
    description: "",
    requirements: [],
    qualifications: [],
    benefits: [],
  };

  const blocks = [...root.querySelectorAll("h1, h2, h3, h4, h5, h6, p, ul, ol, div, strong, b")];
  const descriptionParts: string[] = [];
  let current: SectionKind = "description";
  const emitted: Element[] = [];

  const push = (lines: readonly string[]): void => {
    if (current === "description") descriptionParts.push(...lines);
    else sections[current].push(...lines);
  };

  for (const block of blocks) {
    // Skip anything already covered by a block emitted whole, so
    // <p><strong>Note:</strong> body</p> is not recorded twice.
    if (emitted.some((ancestor: Element): boolean => ancestor.contains(block))) continue;

    if (isHeadingLike(block)) {
      const kind = classify(textOf(block));
      if (kind !== null) {
        current = kind;
        continue;
      }
    }

    if (block.tagName === "UL" || block.tagName === "OL") {
      push(bulletsOf(block));
      emitted.push(block);
      continue;
    }

    // A div holding nothing but text is how both boards render some lists.
    if (block.tagName === "DIV") {
      if (block.querySelector("p, ul, ol, div, h1, h2, h3, h4, h5, h6") !== null) continue;
      // A div wrapping only a bolded line is a heading; let the child decide.
      const lone = block.childElementCount === 1 ? block.firstElementChild : null;
      if (lone !== null && isHeadingLike(lone)) continue;
      const lines = bulletsOf(block);
      if (lines.length === 0) continue;
      push(lines);
      emitted.push(block);
      continue;
    }

    if (block.tagName !== "P" && block.tagName !== "STRONG" && block.tagName !== "B") continue;

    const text = textOf(block);
    if (text === "") continue;
    push([text]);
    if (block.tagName === "P") emitted.push(block);
  }

  sections.description = descriptionParts.join("\n").trim();
  return sections;
}
