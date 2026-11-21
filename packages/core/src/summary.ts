import { buildCalendar, type CalendarEntry, type ComplianceCalendar } from "./calendar.ts";
import { formatDate, yearOf } from "./dates.ts";
import { estimateFranchiseTax } from "./franchiseTax.ts";
import { usd } from "./format.ts";
import type { RuleContext } from "./rules/types.ts";
import type { CompanyRecord } from "./schema.ts";
import { deriveForeignOwnership, knownValue } from "./schema.ts";

/**
 * The "what does my company owe?" answer, assembled deterministically from the engine's outputs.
 * Every number and date here comes from franchiseTax.ts or the rules registry; nothing is computed
 * by a language model.
 */

export interface ObligationsSummary {
  taxYear: number;
  headline: string[];
  /** Sum of every known amount in the "applies" group, computed here so no model has to add. */
  totalKnownUsd: number;
  alsoDue: CalendarEntry[];
  calendar: ComplianceCalendar;
}

/**
 * Tax year a founder most likely means by "this year": during filing season (Jan–Apr) it's last
 * year's filings that are due; from May on, it's the current year.
 */
export function defaultTaxYear(today: string): number {
  const month = Number(today.slice(5, 7));
  return month <= 4 ? yearOf(today) - 1 : yearOf(today);
}

const FRANCHISE_FIELD_LABELS: Record<string, string> = {
  entityType: "entity type",
  shareClasses: "authorized shares and par value",
  issuedShares: "issued shares",
  grossAssets: "gross assets",
};

export function summarizeObligations(record: CompanyRecord, ctx: RuleContext): ObligationsSummary {
  const calendar = buildCalendar(record, ctx);
  const headline: string[] = [];

  for (const entry of [...calendar.applies, ...calendar.maybe].filter((e) => e.urgent)) {
    headline.push(`Urgent: ${entry.title}. ${entry.reason}`);
  }

  const estimate = estimateFranchiseTax(record, { taxYear: ctx.taxYear });
  if (estimate.status === "ok") {
    const method = estimate.method === "assumed_par_value" ? "Assumed Par Value method" : "Authorized Shares method";
    const filing = `File by ${formatDate(estimate.dueDate)}.`;
    headline.push(
      estimate.delawareNotice.gapUsd > 0
        ? `Delaware's default math says ${usd(estimate.delawareNotice.taxUsd)}. Under the ${method} you owe ${usd(estimate.totalDueUsd)} (${usd(estimate.taxUsd)} tax + ${usd(estimate.annualReportFeeUsd)} annual report fee). ${filing}`
        : `Delaware franchise tax: you owe ${usd(estimate.totalDueUsd)} (${usd(estimate.taxUsd)} tax under the ${method} + ${usd(estimate.annualReportFeeUsd)} annual report fee). ${filing}`,
    );
  } else if (estimate.status === "needs_confirmation") {
    const fields = estimate.missing.map((m) => FRANCHISE_FIELD_LABELS[m.field] ?? m.field).join(", ");
    headline.push(`I can't estimate Delaware franchise tax yet. Confirm: ${fields}.`);
  }

  const form5472 = [...calendar.applies, ...calendar.maybe].find((e) => e.ruleId === "form-5472");
  const founders = knownValue(record.founders);
  if (form5472 && founders && founders.length > 0) {
    const { pct } = deriveForeignOwnership(founders);
    const who = founders.length === 1 ? "you're a non-US founder owning" : "non-US founders own";
    const status = form5472.status === "applies" ? "applies" : "likely applies";
    headline.push(
      `Since ${who} ${pct}% (25% or more), Form 5472 ${status} too; missing it costs ${usd(25_000)} per form, per year.`,
    );
  }

  const alsoDue = calendar.applies.filter((e) => e.ruleId !== "de-franchise-tax" && e.due !== null && !e.urgent);
  if (alsoDue.length > 0) {
    const items = alsoDue.map((e) => {
      const amount = e.amount?.usd != null ? ` (${usd(e.amount.usd)})` : "";
      const when = `${e.due?.approximate ? "around " : "by "}${formatDate(e.due!.date)}`;
      return `${e.title}${amount} ${when}`;
    });
    headline.push(`Also due: ${items.join("; ")}.`);
  }

  const priced = calendar.applies.filter((e) => e.amount?.usd != null);
  const unpriced = calendar.applies.filter((e) => e.amount?.usd == null);
  const totalKnownUsd = priced.reduce((sum, e) => sum + (e.amount?.usd ?? 0), 0);
  if (priced.length > 0) {
    const parts = priced.map((e) => `${usd(e.amount!.usd!)} ${e.title}`).join(" + ");
    const rest = unpriced.length > 0 ? ` The other ${unpriced.length} filing${unpriced.length > 1 ? "s" : ""} that apply have no fee from Good Standing's rules but carry penalties if missed.` : "";
    headline.push(`Known amounts for tax year ${ctx.taxYear}: ${usd(totalKnownUsd)} in total (${parts}).${rest}`);
  }

  return { taxYear: ctx.taxYear, headline, totalKnownUsd, alsoDue, calendar };
}
