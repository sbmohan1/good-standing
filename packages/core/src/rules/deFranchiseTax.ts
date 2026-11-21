import { isoDate } from "../dates.ts";
import {
  ANNUAL_REPORT_FEE_VERIFY_NOTE,
  estimateFranchiseTax,
  FRANCHISE_TAX_SOURCES,
  LATE_PENALTY,
  summarizeFranchiseTax,
} from "../franchiseTax.ts";
import { citeEntityType, RULES_AS_OF } from "./shared.ts";
import type { Rule } from "./types.ts";

export const deFranchiseTax: Rule = {
  id: "de-franchise-tax",
  title: "Delaware franchise tax + annual report",
  jurisdiction: "DE",
  appliesTo(record) {
    const entity = record.entityType.value;
    if (entity === "c_corp") {
      return {
        applies: true,
        reason: `Every Delaware corporation files an annual report and pays franchise tax for the prior calendar year (${citeEntityType(record)}).`,
      };
    }
    if (entity === "llc") {
      return { applies: false, reason: `LLCs pay the flat Delaware LLC annual tax instead (${citeEntityType(record)}).` };
    }
    return { applies: "maybe", reason: "Applies to Delaware C-corps. Confirm your entity type." };
  },
  due(_record, { taxYear }) {
    return { date: isoDate(taxYear + 1, 3, 1) };
  },
  amount(record, { taxYear }) {
    const estimate = estimateFranchiseTax(record, { taxYear });
    if (estimate.status === "not_applicable") return null;
    if (estimate.status === "needs_confirmation") {
      return { usd: null, workings: [estimate.message], needsConfirmation: estimate.missing.map((m) => m.field) };
    }
    return { usd: estimate.totalDueUsd, workings: [summarizeFranchiseTax(estimate)] };
  },
  penalty: LATE_PENALTY,
  sourceUrls: FRANCHISE_TAX_SOURCES,
  asOf: RULES_AS_OF,
  verifyNote: ANNUAL_REPORT_FEE_VERIFY_NOTE,
};
