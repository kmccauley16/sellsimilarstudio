export const MAX_AUTOMATIC_KEYWORDS = 15;
export const MAX_REVIEW_KEYWORDS = 25;
export const MAX_KEYWORD_LENGTH = 80;
export const EBAY_TITLE_LIMIT = 80;
export const ITEM_SPECIFIC_VALUE_LIMIT = 300;

export type KeywordSpecific = {
  name: string;
  value: string;
};

export type KeywordCoverage = {
  title: boolean;
  description: boolean;
  itemSpecifics: boolean;
};

export type KeywordInsertResult = {
  value: string;
  status: "inserted" | "already_present" | "too_long" | "empty";
};

/**
 * Keeps keyword phrases readable for sellers while producing a stable form for
 * duplicate detection. This is intentionally conservative: it does not invent,
 * truncate, or stem search terms.
 */
export function normalizeKeywordPhrase(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFKC")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function decodeCommonEntities(value: string): string {
  return value
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, " and ")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, " ")
    .replace(/&gt;/gi, " ");
}

function stripTags(value: string): string {
  return value.replace(/<[^>]*>/g, " ");
}

/** Turns visible listing text into a comparison form without exposing HTML. */
export function normalizeKeywordSearchText(value: string): string {
  return stripTags(decodeCommonEntities(value))
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function keywordIdentity(value: string): string {
  return normalizeKeywordSearchText(value);
}

export function normalizeKeywordPhrases(
  values: unknown,
  limit = MAX_REVIEW_KEYWORDS,
): string[] {
  if (!Array.isArray(values)) return [];

  const unique = new Set<string>();
  const phrases: string[] = [];
  for (const rawValue of values) {
    const phrase = normalizeKeywordPhrase(rawValue);
    const identity = keywordIdentity(phrase);
    if (
      !phrase ||
      phrase.length > MAX_KEYWORD_LENGTH ||
      !identity ||
      unique.has(identity)
    ) {
      continue;
    }
    unique.add(identity);
    phrases.push(phrase);
    if (phrases.length >= limit) break;
  }
  return phrases;
}

export function keywordAppearsInText(text: string, keyword: string): boolean {
  const normalizedText = normalizeKeywordSearchText(text);
  const normalizedKeyword = keywordIdentity(keyword);
  if (!normalizedText || !normalizedKeyword) return false;
  return ` ${normalizedText} `.includes(` ${normalizedKeyword} `);
}

export function getKeywordCoverage(
  keyword: string,
  fields: {
    title: string;
    description: string;
    itemSpecifics: KeywordSpecific[];
  },
): KeywordCoverage {
  return {
    title: keywordAppearsInText(fields.title, keyword),
    description: keywordAppearsInText(fields.description, keyword),
    itemSpecifics: fields.itemSpecifics.some(specific =>
      keywordAppearsInText(`${specific.name} ${specific.value}`, keyword),
    ),
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function appendKeyword(
  value: string,
  keyword: string,
  maxLength?: number,
): KeywordInsertResult {
  const phrase = normalizeKeywordPhrase(keyword);
  const currentValue = value ?? "";
  if (!phrase) return { value: currentValue, status: "empty" };
  if (keywordAppearsInText(currentValue, phrase)) {
    return { value: currentValue, status: "already_present" };
  }

  const nextValue = `${currentValue.trimEnd()}${currentValue.trimEnd() ? " " : ""}${phrase}`;
  if (maxLength !== undefined && nextValue.length > maxLength) {
    return { value: currentValue, status: "too_long" };
  }
  return { value: nextValue, status: "inserted" };
}

export function insertKeywordIntoTitle(title: string, keyword: string): KeywordInsertResult {
  return appendKeyword(title, keyword, EBAY_TITLE_LIMIT);
}

export function insertKeywordIntoItemSpecificValue(
  value: string,
  keyword: string,
): KeywordInsertResult {
  return appendKeyword(value, keyword, ITEM_SPECIFIC_VALUE_LIMIT);
}

export function insertKeywordIntoDescription(
  description: string,
  keyword: string,
): KeywordInsertResult {
  const phrase = normalizeKeywordPhrase(keyword);
  const currentValue = description ?? "";
  if (!phrase) return { value: currentValue, status: "empty" };
  if (keywordAppearsInText(currentValue, phrase)) {
    return { value: currentValue, status: "already_present" };
  }

  const isHtmlDescription = /<\/?[a-z][^>]*>/i.test(currentValue);
  const separator = currentValue.trimEnd() ? (isHtmlDescription ? "" : "\n\n") : "";
  const nextValue = isHtmlDescription
    ? `${currentValue.trimEnd()}<p>${escapeHtml(phrase)}</p>`
    : `${currentValue.trimEnd()}${separator}${phrase}`;
  return { value: nextValue, status: "inserted" };
}

export function countKeywordCoverage(coverage: KeywordCoverage): number {
  return Number(coverage.title) + Number(coverage.description) + Number(coverage.itemSpecifics);
}
