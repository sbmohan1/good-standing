import { isoDate } from "../dates.ts";
import { usd } from "../format.ts";
import { citeEntityType, RULES_AS_OF } from "./shared.ts";
import type { Rule } from "./types.ts";

// Delaware HB 400 raised the LLC annual tax from $300 to $400 starting with tax year 2026
// (payable by June 1, 2027). Stripe Atlas's tax-season guide still says $300 as of RULES_AS_OF:
// this is the "rules drift" example in the README.
const HB400_FIRST_TAX_YEAR = 2026;
const TAX_FROM_2026_USD = 400;
const TAX_BEFORE_2026_USD = 300;

export const deLlcAnnualTax: Rule = {
  id: "de-llc-annual-tax",
  title: "Delaware LLC annual tax",
  jurisdiction: "DE",
  appliesTo(record) {
    const entity = record.entityType.value;
    if (entity === "llc") {
      return { applies: true, reason: `Every Delaware LLC pays a flat annual tax (${citeEntityType(record)}).` };
    }
    if (entity === "c_corp") {
      return { applies: false, reason: `Only for LLCs; corporations pay franchise tax instead (${citeEntityType(record)}).` };
    }
    return { applies: "maybe", reason: "Applies to Delaware LLCs. Confirm your entity type." };
  },
  due(_record, { taxYear }) {
    return { date: isoDate(taxYear + 1, 6, 1) };
  },
  amount(_record, { taxYear }) {
    const amount = taxYear >= HB400_FIRST_TAX_YEAR ? TAX_FROM_2026_USD : TAX_BEFORE_2026_USD;
    return {
      usd: amount,
      workings: [
        taxYear >= HB400_FIRST_TAX_YEAR
          ? `Tax year ${taxYear}: ${usd(TAX_FROM_2026_USD)} (raised from ${usd(TAX_BEFORE_2026_USD)} by Delaware HB 400 starting with tax year 2026)`
          : `Tax year ${taxYear}: ${usd(TAX_BEFORE_2026_USD)} (before the HB 400 increase)`,
      ],
    };
  },
  sourceUrls: [
    "https://www.delawareinc.com/blog/delaware-franchise-tax-update-hb-400/",
    "https://maples.com/knowledge/delaware-house-bill-400-introduces-new-fee-changes",
  ],
  asOf: RULES_AS_OF,
};
