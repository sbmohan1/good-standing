import { parseDecimal } from "@good-standing/core";

/**
 * Post-checks on the model's answer, run against the PDF's own extracted text:
 *  1. the quote really appears on the cited page, and
 *  2. the number or date we extracted really appears in that quote.
 * Anything that fails is downgraded to low confidence and flagged for the founder.
 */

/** Collapse whitespace and unify quote marks and dashes so line wrapping doesn't cause false negatives. */
export function normalizeText(text: string): string {
  return text
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export type QuoteCheck =
  | { status: "verified" }
  | { status: "wrong_page"; foundOnPage: number }
  | { status: "not_found" };

export function checkQuote(quote: string, pages: string[], citedPage: number): QuoteCheck {
  const needle = normalizeText(quote);
  if (!needle) return { status: "not_found" };
  const onCited = pages[citedPage - 1];
  if (onCited !== undefined && normalizeText(onCited).includes(needle)) return { status: "verified" };
  const other = pages.findIndex((p) => normalizeText(p).includes(needle));
  return other >= 0 ? { status: "wrong_page", foundOnPage: other + 1 } : { status: "not_found" };
}

/** Every number written in the text, e.g. "10,000,000 shares ... $0.00001" → [10000000, 0.00001] (exact). */
export function numbersIn(text: string): bigint[] {
  const matches = text.match(/\d[\d,]*(?:\.\d+)?/g) ?? [];
  return matches.map((m) => parseDecimal(m.replace(/,/g, "")));
}

export function quoteContainsNumber(quote: string, value: number): boolean {
  const target = parseDecimal(value);
  return numbersIn(quote).includes(target);
}

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Every date written in the text, as YYYY-MM-DD. Handles "February 10, 2026", "10 February 2026", "2026-02-10" and "2/10/2026". */
export function datesIn(text: string): string[] {
  const found: string[] = [];
  const lower = text.toLowerCase();
  for (const m of lower.matchAll(/\b([a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/g)) {
    const month = MONTHS.findIndex((name) => name.startsWith(m[1] as string) && (m[1] as string).length >= 3);
    if (month >= 0) found.push(`${m[3]}-${pad(month + 1)}-${pad(Number(m[2]))}`);
  }
  for (const m of lower.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)\.?,?\s+(\d{4})\b/g)) {
    const month = MONTHS.findIndex((name) => name.startsWith(m[2] as string) && (m[2] as string).length >= 3);
    if (month >= 0) found.push(`${m[3]}-${pad(month + 1)}-${pad(Number(m[1]))}`);
  }
  for (const m of lower.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) found.push(`${m[1]}-${m[2]}-${m[3]}`);
  for (const m of lower.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g)) found.push(`${m[3]}-${pad(Number(m[1]))}-${pad(Number(m[2]))}`);
  return found;
}

export function quoteContainsDate(quote: string, isoDate: string): boolean {
  return datesIn(quote).includes(isoDate);
}
