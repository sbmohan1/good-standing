import type { CompanyRecord } from "../schema.js";

/**
 * Rule shape from BRIEF §6, with one deliberate change: rules receive a context
 * (`taxYear`, `today`) instead of just the record, because several values depend on the tax year
 * (LLC tax, 1099 threshold) and the 83(b) urgency check depends on today's date. Passing `today`
 * in keeps every rule a pure function.
 */
export interface RuleContext {
  taxYear: number;
  /** ISO date. Injected, never read from the clock inside a rule. */
  today: string;
}

export interface Applicability {
  applies: boolean | "maybe";
  /** Plain-language reason that cites the record fields it was based on. */
  reason: string;
  /** Optional display label, e.g. "likely applies". */
  label?: string;
  /** Needs attention now (e.g. a missed 83(b) window). */
  urgent?: boolean;
}

export interface DueDate {
  date: string;
  /** True when the date is an estimate the founder should confirm. */
  approximate?: boolean;
  note?: string;
}

export interface Amount {
  /** null when the amount can't be computed until facts are confirmed. */
  usd: number | null;
  workings: string[];
  needsConfirmation?: string[];
}

export interface Rule {
  id: string;
  title: string;
  jurisdiction: "DE" | "US-federal" | "state";
  appliesTo(record: CompanyRecord, ctx: RuleContext): Applicability;
  due(record: CompanyRecord, ctx: RuleContext): DueDate | null;
  amount?(record: CompanyRecord, ctx: RuleContext): Amount | null;
  penalty?: string;
  sourceUrls: string[];
  /** Date the rule's values were last checked against its sources. */
  asOf: string;
  /** Present when a value still needs verification (mirrors a TODO(verify) in the code). */
  verifyNote?: string;
}
