import { isoDate } from "../dates.js";
import { usd } from "../format.js";
import { knownValue } from "../schema.js";
import { RULES_AS_OF, weekendNote } from "./shared.js";
import type { Rule } from "./types.js";

// OBBBA raised the 1099-NEC threshold from $600 to $2,000 for payments made in calendar 2026.
const THRESHOLD_FROM_2026_USD = 2_000;
const THRESHOLD_BEFORE_2026_USD = 600;

function thresholdFor(taxYear: number): number {
  return taxYear >= 2026 ? THRESHOLD_FROM_2026_USD : THRESHOLD_BEFORE_2026_USD;
}

export const form1099Nec: Rule = {
  id: "form-1099-nec",
  title: "Form 1099-NEC for contractors",
  jurisdiction: "US-federal",
  appliesTo(record, { taxYear }) {
    const payments = knownValue(record.contractorPaymentsByPayee);
    const threshold = thresholdFor(taxYear);
    if (payments === null) {
      return {
        applies: "maybe",
        reason: `Applies if you paid any single contractor ${usd(threshold)} or more in ${taxYear}. Tell us what you paid each contractor.`,
      };
    }
    const over = payments.filter((p) => p.totalPaidThisYear >= threshold);
    const unconfirmed = record.contractorPaymentsByPayee.status === "needs_confirmation" ? " (unconfirmed)" : "";
    if (over.length > 0) {
      const list = over.map((p) => `${p.payee} (${usd(p.totalPaidThisYear)})`).join(", ");
      return {
        applies: true,
        reason: `You paid ${list} in ${taxYear}, at or above the ${usd(threshold)} threshold for ${taxYear}${unconfirmed} [founder answer]. File one 1099-NEC per contractor.`,
      };
    }
    return {
      applies: false,
      reason: `No single contractor was paid ${usd(threshold)} or more in ${taxYear}${unconfirmed} [founder answer].`,
    };
  },
  due(_record, { taxYear }) {
    const date = isoDate(taxYear + 1, 1, 31);
    return { date, note: weekendNote(date) };
  },
  sourceUrls: ["https://support.stripe.com/express/questions/whats-new-for-the-2026-tax-season"],
  asOf: RULES_AS_OF,
};
