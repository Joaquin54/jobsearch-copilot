export type Experience = { minYears: number | null; maxYears: number | null; raw: string };

const WORD_NUMBERS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

const RANGE = /(\d{1,2})\s*(?:-|–|to)\s*(\d{1,2})\+?\s*(?:\+\s*)?years?/i;
const AT_LEAST = /(\d{1,2})\s*\+\s*years?|\bminimum\s+of\s+(\d{1,2})\s*years?|\bat\s+least\s+(\d{1,2})\s*years?/i;
const PLAIN = /(\d{1,2})\s*years?/i;
const WORDED = new RegExp(`\\b(${Object.keys(WORD_NUMBERS).join("|")})\\b[^.]{0,20}?years?`, "i");

export function parseExperience(text: string): Experience | null {
  const range = RANGE.exec(text);
  if (range) {
    return {
      minYears: Number.parseInt(range[1] as string, 10),
      maxYears: Number.parseInt(range[2] as string, 10),
      raw: range[0],
    };
  }

  const atLeast = AT_LEAST.exec(text);
  if (atLeast) {
    const digits = atLeast[1] ?? atLeast[2] ?? atLeast[3];
    return { minYears: Number.parseInt(digits as string, 10), maxYears: null, raw: atLeast[0] };
  }

  const plain = PLAIN.exec(text);
  if (plain) {
    const years = Number.parseInt(plain[1] as string, 10);
    return { minYears: years, maxYears: null, raw: plain[0] };
  }

  const worded = WORDED.exec(text);
  if (worded) {
    const word = (worded[1] as string).toLowerCase();
    return { minYears: WORD_NUMBERS[word] ?? null, maxYears: null, raw: worded[0] };
  }

  return null;
}
