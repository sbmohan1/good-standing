import { fifteenthOfNthMonthAfter, fiscalYearEndDate, isWeekend } from "../dates.ts";
import { cite } from "../format.ts";
import type { CompanyRecord } from "../schema.ts";
import { knownValue } from "../schema.ts";

/** Date the rule values in this registry were last checked against BRIEF §6 and its cited sources. */
export const RULES_AS_OF = "2026-11-21";

const ENTITY_LABELS = { c_corp: "C-corp", llc: "LLC" } as const;

export function citeEntityType(record: CompanyRecord): string {
  return cite("entity type", record.entityType, (v) => ENTITY_LABELS[v]);
}

export function fiscalYearEnd(record: CompanyRecord): string {
  return knownValue(record.fiscalYearEnd) ?? "12-31";
}

/** Federal returns: 15th day of the 4th month after fiscal year end (April 15 for calendar-year companies). */
export function federalReturnDueDate(record: CompanyRecord, taxYear: number): string {
  return fifteenthOfNthMonthAfter(fiscalYearEndDate(fiscalYearEnd(record), taxYear), 4);
}

/** IRC §7503: a federal deadline on a weekend or legal holiday moves to the next business day. */
export function weekendNote(date: string): string | undefined {
  return isWeekend(date)
    ? "This date falls on a weekend; the IRS treats the next business day as on time."
    : undefined;
}

export function joinNotes(...notes: Array<string | undefined>): string | undefined {
  const present = notes.filter((n): n is string => Boolean(n));
  return present.length > 0 ? present.join(" ") : undefined;
}
