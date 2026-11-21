import { parseDecimal, roundToPlaces, toNumber } from "./decimal.ts";
import { usd } from "./format.ts";

/**
 * Gross assets worksheet. Delaware's Assumed Par Value method needs total gross assets as reported
 * on Form 1120, Schedule L. Founders often don't have that number yet, so this adds up the usual
 * balance-sheet lines in exact decimal arithmetic. The result is the founder's own estimate, to be
 * checked against the return; it is never inferred from a bank or Stripe balance.
 */

export const GROSS_ASSET_LINES = [
  { id: "cash", label: "Cash in bank accounts", help: "Every business account at year end, including your Stripe balance and any money market or treasury accounts." },
  { id: "receivables", label: "Money owed to you", help: "Invoices customers hadn't paid yet at year end (accounts receivable)." },
  { id: "equipment", label: "Equipment and other property", help: "Computers and other equipment you own, after depreciation." },
  { id: "prepaid", label: "Prepaid expenses and deposits", help: "Annual software paid in advance, security deposits and similar." },
  { id: "other", label: "Other assets", help: "Loans the company made, investments, intellectual property you capitalized." },
] as const;

export type GrossAssetLineId = (typeof GROSS_ASSET_LINES)[number]["id"];

export interface GrossAssetLine {
  label: string;
  amountUsd: number | string;
}

export type GrossAssetsWorksheet =
  | { status: "ok"; totalUsd: number; workings: string[]; detail: string }
  | { status: "invalid"; errors: string[] };

export function sumGrossAssets(lines: GrossAssetLine[]): GrossAssetsWorksheet {
  const errors: string[] = [];
  const parsed: Array<{ label: string; scaled: bigint }> = [];
  for (const line of lines) {
    const raw = typeof line.amountUsd === "string" ? line.amountUsd.replace(/[$,\s]/g, "") : line.amountUsd;
    if (raw === "") continue;
    let scaled: bigint;
    try {
      scaled = parseDecimal(raw);
    } catch {
      errors.push(`${line.label}: "${line.amountUsd}" isn't a number.`);
      continue;
    }
    if (scaled < 0n) {
      errors.push(`${line.label}: amounts can't be negative.`);
      continue;
    }
    parsed.push({ label: line.label, scaled });
  }
  if (errors.length > 0) return { status: "invalid", errors };

  // Exact sum, then rounded half up to cents.
  const total = roundToPlaces(parsed.reduce((sum, l) => sum + l.scaled, 0n), 2);
  const asUsd = (s: bigint) => usd(toNumber(roundToPlaces(s, 2)));
  const nonZero = parsed.filter((l) => l.scaled > 0n);
  const workings = [
    ...nonZero.map((l) => `${l.label}: ${asUsd(l.scaled)}`),
    nonZero.length > 0 ? `Total gross assets: ${nonZero.map((l) => asUsd(l.scaled)).join(" + ")} = ${asUsd(total)}` : "Total gross assets: $0",
  ];
  return {
    status: "ok",
    totalUsd: toNumber(total),
    workings,
    detail: `Worksheet: ${nonZero.length > 0 ? nonZero.map((l) => `${l.label} ${asUsd(l.scaled)}`).join(", ") : "all lines $0"}. Check against Form 1120, Schedule L.`,
  };
}
