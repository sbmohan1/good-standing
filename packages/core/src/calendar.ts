import { compareIso, fiscalYearEndDate } from "./dates.ts";
import { cite } from "./format.ts";
import { RULES } from "./rules/index.ts";
import { fiscalYearEnd } from "./rules/shared.ts";
import type { Amount, DueDate, Rule, RuleContext } from "./rules/types.ts";
import type { CompanyRecord } from "./schema.ts";
import { knownValue } from "./schema.ts";

export interface CalendarEntry {
  ruleId: string;
  title: string;
  jurisdiction: Rule["jurisdiction"];
  status: "applies" | "maybe" | "not_required";
  label?: string;
  urgent: boolean;
  reason: string;
  due: DueDate | null;
  amount: Amount | null;
  penalty?: string;
  sourceUrls: string[];
  asOf: string;
  verifyNote?: string;
}

export interface ComplianceCalendar {
  taxYear: number;
  generatedFor: string;
  applies: CalendarEntry[];
  maybe: CalendarEntry[];
  notRequired: CalendarEntry[];
}

/** Runs every rule against the record and groups the results, each group sorted by due date. */
export function buildCalendar(
  record: CompanyRecord,
  ctx: RuleContext,
  rules: readonly Rule[] = RULES,
): ComplianceCalendar {
  const notFormedReason = companyDidNotExistReason(record, ctx.taxYear);
  const entries = rules.map((rule) => evaluate(rule, record, ctx, notFormedReason));

  return {
    taxYear: ctx.taxYear,
    generatedFor: ctx.today,
    applies: sortByDue(entries.filter((e) => e.status === "applies")),
    maybe: sortByDue(entries.filter((e) => e.status === "maybe")),
    notRequired: sortByDue(entries.filter((e) => e.status === "not_required")),
  };
}

function evaluate(rule: Rule, record: CompanyRecord, ctx: RuleContext, notFormedReason: string | null): CalendarEntry {
  const base = {
    ruleId: rule.id,
    title: rule.title,
    jurisdiction: rule.jurisdiction,
    penalty: rule.penalty,
    sourceUrls: rule.sourceUrls,
    asOf: rule.asOf,
    verifyNote: rule.verifyNote,
  };

  if (notFormedReason) {
    return { ...base, status: "not_required", urgent: false, reason: notFormedReason, due: null, amount: null };
  }

  const result = rule.appliesTo(record, ctx);
  const status = result.applies === true ? "applies" : result.applies === "maybe" ? "maybe" : "not_required";
  const active = status !== "not_required";
  return {
    ...base,
    status,
    label: result.label,
    urgent: result.urgent ?? false,
    reason: result.reason,
    due: active ? rule.due(record, ctx) : null,
    amount: active ? (rule.amount?.(record, ctx) ?? null) : null,
  };
}

function companyDidNotExistReason(record: CompanyRecord, taxYear: number): string | null {
  const incorporated = knownValue(record.incorporationDate);
  if (!incorporated) return null;
  const yearEnd = fiscalYearEndDate(fiscalYearEnd(record), taxYear);
  if (compareIso(incorporated, yearEnd) <= 0) return null;
  return `Not required for tax year ${taxYear}: the company was incorporated on ${incorporated}, after that year ended (${cite("incorporation date", record.incorporationDate)}).`;
}

function sortByDue(entries: CalendarEntry[]): CalendarEntry[] {
  return [...entries].sort((a, b) => {
    if (a.due && b.due) return compareIso(a.due.date, b.due.date) || a.title.localeCompare(b.title);
    if (a.due) return -1;
    if (b.due) return 1;
    return a.title.localeCompare(b.title);
  });
}
