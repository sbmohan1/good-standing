/**
 * Delaware franchise tax for C-corps, implemented as Delaware's calculator page describes:
 * https://corp.delaware.gov/frtaxcalc/
 *
 * Delaware's default notice uses the Authorized Shares method, which for a typical startup
 * (10,000,000 authorized shares) comes to $85,165. The Assumed Par Value Capital method usually
 * gives a far smaller number. Founders may pay the lower of the two. This module computes both,
 * exactly, with workings a founder can check line by line.
 */

import { ceilDiv, formatDecimal, parseDecimal, roundToPlaces, SCALE_FACTOR, toNumber } from "./decimal.js";
import { formatDate, isoDate } from "./dates.js";
import { count, groupDecimalString, usd } from "./format.js";
import type { CompanyRecord, CompanyRecordField, Fact, ShareClass } from "./schema.js";

export const FRANCHISE_TAX_SOURCES = [
  "https://corp.delaware.gov/frtaxcalc/",
  "https://docs.stripe.com/atlas/business-taxes",
  "https://stripe.com/atlas/guides/tax-season",
];

// Authorized Shares method (Delaware)
const AS_MIN_TAX = 175; // up to 5,000 shares
const AS_MID_TAX = 250; // 5,001–10,000 shares
const AS_STEP_TAX = 85; // per additional 10,000 shares or portion thereof
const AS_STEP_SHARES = 10_000;

// Assumed Par Value Capital method (Delaware)
const APV_TAX_PER_MILLION = 400; // per $1,000,000 of capital or portion thereof
const APV_MIN_TAX = 400;
const ASSUMED_PAR_DECIMALS = 6;

const MAX_TAX = 200_000;

// TODO(verify): $50 is the annual report fee before Delaware HB 400, which raised several fees
// effective Aug 1, 2026. Confirm the current domestic-corporation annual report fee.
export const ANNUAL_REPORT_FEE_USD = 50;
export const ANNUAL_REPORT_FEE_VERIFY_NOTE =
  "Annual report fee of $50 to be re-checked against Delaware HB 400's fee schedule (fees changed Aug 1, 2026).";

export const LATE_PENALTY = "$200 late penalty plus 1.5% interest per month on the unpaid tax.";

const INSTALLMENT_THRESHOLD_USD = 5_000;
const LARGE_CORPORATE_FILER_ASSETS_USD = 750_000_000;

export type FranchiseTaxMethod = "authorized_shares" | "assumed_par_value";

export interface MethodResult {
  taxUsd: number;
  workings: string[];
}

export type AssumedParValueResult =
  | {
      status: "ok";
      taxUsd: number;
      /** Rounded to 6 decimal places, as a string so it prints exactly as Delaware shows it. */
      assumedPar: string;
      capitalUsd: number;
      classes: Array<{
        name: string;
        authorizedShares: number;
        parValue: number;
        rateUsed: "assumed_par" | "par_value";
        capitalUsd: number;
      }>;
      workings: string[];
    }
  | { status: "not_applicable"; reason: string; workings: string[] };

export interface FranchiseTaxFlag {
  id:
    | "no_par_stock"
    | "large_corporate_filer"
    | "amended_shares_prorating"
    | "amendment_unknown";
  message: string;
}

export interface Installment {
  date: string;
  percent: number;
  usd: number;
  note?: string;
}

export interface FranchiseTaxInput {
  shareClasses: ShareClass[];
  issuedShares: number;
  grossAssets: number;
  amendedAuthorizedSharesThisYear?: boolean | null;
  listedOnNationalExchange?: boolean | null;
}

export interface FranchiseTaxCalculation {
  taxYear: number;
  authorizedShares: MethodResult;
  assumedParValue: AssumedParValueResult;
  method: FranchiseTaxMethod;
  taxUsd: number;
  annualReportFeeUsd: number;
  totalDueUsd: number;
  /** What Delaware's default notice (Authorized Shares method) would say, and how far off it is. */
  delawareNotice: { taxUsd: number; totalUsd: number; gapUsd: number; explanation: string };
  dueDate: string;
  installments: Installment[] | null;
  latePenalty: string;
  flags: FranchiseTaxFlag[];
  sourceUrls: string[];
  verifyNotes: string[];
}

export function authorizedSharesMethod(totalAuthorized: number): MethodResult {
  const workings = [`Total authorized shares: ${count(totalAuthorized)}`];

  if (totalAuthorized <= 5_000) {
    workings.push(`5,000 shares or fewer → minimum tax ${usd(AS_MIN_TAX)}`);
    return { taxUsd: AS_MIN_TAX, workings };
  }
  if (totalAuthorized <= AS_STEP_SHARES) {
    workings.push(`5,001 to 10,000 shares → ${usd(AS_MID_TAX)}`);
    return { taxUsd: AS_MID_TAX, workings };
  }

  const additional = totalAuthorized - AS_STEP_SHARES;
  const blocks = Math.ceil(additional / AS_STEP_SHARES);
  const uncapped = AS_MID_TAX + AS_STEP_TAX * blocks;
  workings.push(
    `More than 10,000 shares → ${usd(AS_MID_TAX)} plus ${usd(AS_STEP_TAX)} for each additional 10,000 shares or portion thereof`,
    `Additional shares: ${count(totalAuthorized)} − 10,000 = ${count(additional)} → ${count(blocks)} block(s) of 10,000`,
    `${usd(AS_MID_TAX)} + ${count(blocks)} × ${usd(AS_STEP_TAX)} = ${usd(uncapped)}`,
  );
  if (uncapped > MAX_TAX) {
    workings.push(`Capped at Delaware's maximum of ${usd(MAX_TAX)}`);
    return { taxUsd: MAX_TAX, workings };
  }
  return { taxUsd: uncapped, workings };
}

export function assumedParValueMethod(input: {
  shareClasses: ShareClass[];
  issuedShares: number;
  grossAssets: number;
}): AssumedParValueResult {
  const noPar = input.shareClasses.filter((c) => c.parValue === null);
  if (noPar.length > 0) {
    // TODO(verify): Delaware's calculator handles mixed par/no-par structures with extra steps.
    // We don't attempt APV at all when any class is no-par, per BRIEF §5.
    const names = noPar.map((c) => c.name).join(", ");
    return {
      status: "not_applicable",
      reason: `${names} is no-par stock. Delaware says the Authorized Shares method always gives the lower result for no-par stock, so the Assumed Par Value method isn't calculated here.`,
      workings: [],
    };
  }
  if (input.issuedShares <= 0) {
    return {
      status: "not_applicable",
      reason: "Issued shares must be greater than zero to compute an assumed par value.",
      workings: [],
    };
  }

  const grossAssets = parseDecimal(input.grossAssets);
  const issued = BigInt(input.issuedShares);
  // Step 1: assumed par = gross assets ÷ issued shares, rounded to 6 decimal places.
  const assumedPar = roundToPlaces(grossAssets / issued, ASSUMED_PAR_DECIMALS);
  const assumedParText = formatDecimal(assumedPar, ASSUMED_PAR_DECIMALS);

  const workings = [
    `Step 1: assumed par = gross assets ÷ issued shares = ${usd(input.grossAssets)} ÷ ${count(input.issuedShares)} = $${assumedParText} (rounded to 6 decimal places)`,
    "Step 2: for each class, multiply authorized shares by the higher of its par value and the assumed par",
  ];

  // Step 2: assumed par value capital.
  let capital = 0n;
  const classes = input.shareClasses.map((c) => {
    const par = parseDecimal(c.parValue as number);
    const useAssumed = par < assumedPar;
    const rate = useAssumed ? assumedPar : par;
    const classCapital = BigInt(c.authorizedShares) * rate;
    capital += classCapital;
    workings.push(
      `  ${c.name}: par $${formatTrimmed(par)} ${useAssumed ? "<" : "≥"} assumed par $${assumedParText} → ${count(c.authorizedShares)} × $${formatTrimmed(rate)} = $${groupDecimalString(formatTrimmed(classCapital))}`,
    );
    return {
      name: c.name,
      authorizedShares: c.authorizedShares,
      parValue: c.parValue as number,
      rateUsed: useAssumed ? ("assumed_par" as const) : ("par_value" as const),
      capitalUsd: toNumber(classCapital),
    };
  });
  workings.push(`  Assumed par value capital = $${groupDecimalString(formatTrimmed(capital))}`);

  // Step 3: $400 per $1,000,000 or portion thereof, min $400, max $200,000.
  const millions = ceilDiv(capital, 1_000_000n * SCALE_FACTOR);
  const uncapped = APV_TAX_PER_MILLION * Number(millions);
  const taxUsd = Math.min(Math.max(uncapped, APV_MIN_TAX), MAX_TAX);
  workings.push(
    `Step 3: ${usd(APV_TAX_PER_MILLION)} per $1,000,000 of capital or portion thereof → ${count(Number(millions))} × ${usd(APV_TAX_PER_MILLION)} = ${usd(uncapped)}`,
  );
  if (uncapped < APV_MIN_TAX) workings.push(`Raised to Delaware's minimum of ${usd(APV_MIN_TAX)}`);
  if (uncapped > MAX_TAX) workings.push(`Capped at Delaware's maximum of ${usd(MAX_TAX)}`);

  return {
    status: "ok",
    taxUsd,
    assumedPar: assumedParText,
    capitalUsd: toNumber(capital),
    classes,
    workings,
  };
}

function formatTrimmed(scaled: bigint): string {
  const text = formatDecimal(scaled, 18);
  return text.replace(/\.?0+$/, "");
}

function installmentsFor(taxUsd: number, taxYear: number): Installment[] | null {
  if (taxUsd < INSTALLMENT_THRESHOLD_USD) return null;
  const cents = taxUsd * 100;
  const part = (pct: number) => Math.round((cents * pct) / 100) / 100;
  const first = part(40);
  const second = part(20);
  const third = part(20);
  const balance = Math.round(cents - (first + second + third) * 100) / 100;
  return [
    { date: isoDate(taxYear, 6, 1), percent: 40, usd: first },
    { date: isoDate(taxYear, 9, 1), percent: 20, usd: second },
    { date: isoDate(taxYear, 12, 1), percent: 20, usd: third },
    { date: isoDate(taxYear + 1, 3, 1), percent: 20, usd: balance, note: "balance" },
  ];
}

/** Pure calculation on plain inputs. Callers are responsible for having confirmed them. */
export function calculateFranchiseTax(input: FranchiseTaxInput, opts: { taxYear: number }): FranchiseTaxCalculation {
  const totalAuthorized = input.shareClasses.reduce((sum, c) => sum + c.authorizedShares, 0);
  const authorizedShares = authorizedSharesMethod(totalAuthorized);
  const assumedParValue = assumedParValueMethod(input);

  const method: FranchiseTaxMethod =
    assumedParValue.status === "ok" && assumedParValue.taxUsd < authorizedShares.taxUsd
      ? "assumed_par_value"
      : "authorized_shares";
  const taxUsd =
    method === "assumed_par_value" && assumedParValue.status === "ok"
      ? assumedParValue.taxUsd
      : authorizedShares.taxUsd;
  const totalDueUsd = taxUsd + ANNUAL_REPORT_FEE_USD;
  const noticeTotal = authorizedShares.taxUsd + ANNUAL_REPORT_FEE_USD;
  const gapUsd = noticeTotal - totalDueUsd;
  const dueDate = isoDate(opts.taxYear + 1, 3, 1);

  const flags: FranchiseTaxFlag[] = [];
  if (assumedParValue.status === "not_applicable" && input.shareClasses.some((c) => c.parValue === null)) {
    flags.push({ id: "no_par_stock", message: assumedParValue.reason });
  }
  if (input.grossAssets >= LARGE_CORPORATE_FILER_ASSETS_USD || input.listedOnNationalExchange === true) {
    flags.push({
      id: "large_corporate_filer",
      message:
        "You may be a Large Corporate Filer (gross assets of $750M or more, or listed on a national exchange). Different rules and rates apply and aren't calculated here. Ask a tax professional.",
    });
  }
  if (input.amendedAuthorizedSharesThisYear === true) {
    flags.push({
      id: "amended_shares_prorating",
      message:
        "You amended authorized shares this year, so the tax may be prorated across the periods before and after the amendment. This estimate doesn't prorate. Ask a tax professional or use Delaware's calculator.",
    });
  } else if (input.amendedAuthorizedSharesThisYear == null) {
    flags.push({
      id: "amendment_unknown",
      message:
        "Did you amend your authorized shares this year? If so, the tax is prorated and this estimate won't match.",
    });
  }

  return {
    taxYear: opts.taxYear,
    authorizedShares,
    assumedParValue,
    method,
    taxUsd,
    annualReportFeeUsd: ANNUAL_REPORT_FEE_USD,
    totalDueUsd,
    delawareNotice: {
      taxUsd: authorizedShares.taxUsd,
      totalUsd: noticeTotal,
      gapUsd,
      explanation:
        gapUsd > 0
          ? `Delaware's notice defaults to the Authorized Shares method (${usd(authorizedShares.taxUsd)} + ${usd(ANNUAL_REPORT_FEE_USD)} fee = ${usd(noticeTotal)}). Filing with the Assumed Par Value method, you owe ${usd(totalDueUsd)}, which is ${usd(gapUsd)} less. You must report gross assets and issued shares in your annual report to get the lower amount.`
          : `The Authorized Shares method is already the lower amount, so Delaware's notice (${usd(noticeTotal)}) should match what you owe.`,
    },
    dueDate,
    installments: installmentsFor(taxUsd, opts.taxYear),
    latePenalty: LATE_PENALTY,
    flags,
    sourceUrls: FRANCHISE_TAX_SOURCES,
    verifyNotes: [ANNUAL_REPORT_FEE_VERIFY_NOTE],
  };
}

export interface MissingInput {
  field: CompanyRecordField;
  reason: string;
}

export type FranchiseTaxEstimate =
  | (FranchiseTaxCalculation & {
      status: "ok";
      inputs: {
        shareClasses: Fact<ShareClass[]>;
        issuedShares: Fact<number>;
        grossAssets: Fact<number>;
      };
    })
  | { status: "needs_confirmation"; taxYear: number; missing: MissingInput[]; message: string }
  | { status: "not_applicable"; taxYear: number; message: string };

function requireConfirmed(record: CompanyRecord, field: CompanyRecordField, label: string): MissingInput | null {
  const fact = record[field];
  if (fact.status === "confirmed" && fact.value !== null) return null;
  return {
    field,
    reason:
      fact.status === "needs_confirmation"
        ? `${label} was found but you haven't confirmed it yet`
        : `${label} is missing`,
  };
}

/**
 * Record-level entry point with the "never guess" guardrail: refuses to produce any number until
 * authorized shares, par value, issued shares and gross assets are all founder-confirmed.
 */
export function estimateFranchiseTax(record: CompanyRecord, opts: { taxYear: number }): FranchiseTaxEstimate {
  if (record.entityType.value === "llc") {
    return {
      status: "not_applicable",
      taxYear: opts.taxYear,
      message: "Delaware LLCs pay a flat annual tax instead of the corporate franchise tax.",
    };
  }

  const missingInputs = [
    requireConfirmed(record, "entityType", "Entity type"),
    requireConfirmed(record, "shareClasses", "Authorized shares and par value"),
    requireConfirmed(record, "issuedShares", "Issued shares (including treasury shares)"),
    requireConfirmed(record, "grossAssets", `Gross assets (Form 1120 Schedule L total assets) for ${opts.taxYear}`),
  ].filter((m): m is MissingInput => m !== null);

  if (missingInputs.length === 0 && (record.issuedShares.value ?? 0) <= 0) {
    missingInputs.push({ field: "issuedShares", reason: "Issued shares must be greater than zero" });
  }

  if (missingInputs.length > 0) {
    return {
      status: "needs_confirmation",
      taxYear: opts.taxYear,
      missing: missingInputs,
      message: `I won't estimate franchise tax until these are confirmed: ${missingInputs.map((m) => m.reason).join("; ")}.`,
    };
  }

  const calc = calculateFranchiseTax(
    {
      shareClasses: record.shareClasses.value as ShareClass[],
      issuedShares: record.issuedShares.value as number,
      grossAssets: record.grossAssets.value as number,
      amendedAuthorizedSharesThisYear: record.amendedAuthorizedSharesThisYear.value,
      listedOnNationalExchange: record.listedOnNationalExchange.value,
    },
    opts,
  );

  return {
    status: "ok",
    ...calc,
    inputs: {
      shareClasses: record.shareClasses as Fact<ShareClass[]>,
      issuedShares: record.issuedShares as Fact<number>,
      grossAssets: record.grossAssets as Fact<number>,
    },
  };
}

/** One-paragraph summary, e.g. for a calendar entry or the demo moment. */
export function summarizeFranchiseTax(calc: FranchiseTaxCalculation): string {
  const methodName = calc.method === "assumed_par_value" ? "Assumed Par Value method" : "Authorized Shares method";
  return `Delaware's default math says ${usd(calc.delawareNotice.taxUsd)}. Under the ${methodName} you owe ${usd(calc.taxUsd)} tax + ${usd(calc.annualReportFeeUsd)} annual report fee = ${usd(calc.totalDueUsd)}. File by ${formatDate(calc.dueDate)}.`;
}
