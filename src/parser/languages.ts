import languages from "./dictionaries/languages.json" with { type: "json" };

export type DictionaryEntry = { canonical: string; aliases: string[] };
export type Dictionary = { version: number; comment?: string; entries: DictionaryEntry[] };

/**
 * "r&d" would otherwise tokenize to a bare "r" and match the R language.
 * Phrases are stripped before matching, not after, so they cannot contribute
 * tokens at all.
 */
const STOP_PHRASES = ["r&d", "r & d", "research and development"];

/**
 * Keeps the characters that are part of a technology's name (c++, c#, .net,
 * node.js, ci/cd) and turns everything else into a token break, so matching is
 * whole-token: "rust" never matches inside "trust", "go" never inside "google".
 */
export function tokenize(text: string): string[] {
  let normalized = text.toLowerCase();
  for (const phrase of STOP_PHRASES) normalized = normalized.replaceAll(phrase, " ");
  return normalized
    .replace(/[^a-z0-9+#./-]+/g, " ")
    .split(" ")
    .map((token: string): string => token.replace(/^[.\-/]+|[.\-/]+$/g, ""))
    .filter((token: string): boolean => token.length > 0);
}

type Phrase = { tokens: string[]; canonical: string };

function phrasesOf(entries: readonly DictionaryEntry[]): Phrase[] {
  const phrases: Phrase[] = [];
  for (const entry of entries) {
    for (const alias of [entry.canonical, ...entry.aliases]) {
      const tokens = tokenize(alias);
      if (tokens.length > 0) phrases.push({ tokens, canonical: entry.canonical });
    }
  }
  // Longest first so "react native" wins over "react" at the same position.
  return phrases.sort((a: Phrase, b: Phrase): number => b.tokens.length - a.tokens.length);
}

const LANGUAGE_DICTIONARY = languages as Dictionary;
const LANGUAGE_PHRASES = phrasesOf(LANGUAGE_DICTIONARY.entries);

export function matchDictionary(text: string, phrases: readonly Phrase[]): string[] {
  const tokens = tokenize(text);
  const found = new Set<string>();
  for (let i = 0; i < tokens.length; i += 1) {
    for (const phrase of phrases) {
      if (phrase.tokens.every((t: string, offset: number): boolean => tokens[i + offset] === t)) {
        found.add(phrase.canonical);
        break;
      }
    }
  }
  return [...found];
}

export function buildPhrases(dictionary: Dictionary): Phrase[] {
  return phrasesOf(dictionary.entries);
}

export function matchLanguages(text: string): string[] {
  return matchDictionary(text, LANGUAGE_PHRASES);
}

/** Single token -> canonical name, for callers that already have a candidate. */
export function canonicalize(token: string): string | null {
  const tokens = tokenize(token);
  for (const phrase of LANGUAGE_PHRASES) {
    if (phrase.tokens.length === tokens.length && phrase.tokens.every((t, i) => tokens[i] === t)) {
      return phrase.canonical;
    }
  }
  return null;
}
