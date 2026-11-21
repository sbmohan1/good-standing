import { cite, describeProvenance } from "../format.js";
import type { CompanyRecord } from "../schema.js";
import { deriveForeignOwnership, knownValue } from "../schema.js";
import { federalReturnDueDate, joinNotes, RULES_AS_OF, weekendNote } from "./shared.js";
import type { Applicability, Rule } from "./types.js";

const FOREIGN_OWNERSHIP_THRESHOLD_PCT = 25;

const REPORTABLE_NOTE =
  "Founder capital contributions and loans count as reportable transactions.";

function decideOnTransactions(record: CompanyRecord, why: string): Applicability {
  const reportable = knownValue(record.hasReportableRelatedPartyTransactions);
  if (reportable === true) {
    return {
      applies: true,
      reason: `${why} You reported transactions with your foreign owner(s) (${cite("reportable transactions", record.hasReportableRelatedPartyTransactions, () => "yes")}). File Form 5472 with the return.`,
    };
  }
  if (reportable === false) {
    return {
      applies: false,
      reason: `${why} You reported no transactions with your foreign owner(s) (${cite("reportable transactions", record.hasReportableRelatedPartyTransactions, () => "none")}). ${REPORTABLE_NOTE} If that changes, this applies.`,
    };
  }
  return {
    applies: "maybe",
    label: "likely applies",
    reason: `${why} It applies if the company had any reportable transactions with them this year. ${REPORTABLE_NOTE}`,
  };
}

export const form5472: Rule = {
  id: "form-5472",
  title: "Form 5472 (foreign-owned company information return)",
  jurisdiction: "US-federal",
  appliesTo(record) {
    const entity = record.entityType.value;
    const founders = knownValue(record.founders);
    if (entity === null) {
      return { applies: "maybe", reason: "Depends on entity type and founder residency. Confirm both." };
    }
    if (founders === null || founders.length === 0) {
      return {
        applies: "maybe",
        reason: "Applies to foreign-owned companies. Tell us each founder's ownership and US tax residency.",
      };
    }

    const { pct, workings } = deriveForeignOwnership(founders);
    const unconfirmed = record.founders.status === "needs_confirmation" ? ", unconfirmed" : "";
    const derivation = `${workings.join("; ")} [${describeProvenance(record.founders.provenance)}${unconfirmed}]`;

    if (entity === "c_corp") {
      if (pct >= FOREIGN_OWNERSHIP_THRESHOLD_PCT) {
        return decideOnTransactions(
          record,
          `Your C-corp is ${pct}% foreign-owned (at least ${FOREIGN_OWNERSHIP_THRESHOLD_PCT}%): ${derivation}.`,
        );
      }
      return {
        applies: false,
        reason: `Your C-corp is ${pct}% foreign-owned, under the ${FOREIGN_OWNERSHIP_THRESHOLD_PCT}% threshold: ${derivation}.`,
      };
    }

    // LLC: applies to a foreign-owned single-member LLC, filed with a pro forma 1120.
    const [only] = founders;
    if (founders.length === 1 && only && !only.usTaxResident) {
      return decideOnTransactions(
        record,
        `Your LLC has a single member (${only.name}) who is not a US tax resident; it files Form 5472 with a pro forma 1120.`,
      );
    }
    return {
      applies: false,
      reason: `Form 5472 for LLCs covered here only applies to a foreign-owned single-member LLC: ${derivation}.`,
    };
  },
  due(record, { taxYear }) {
    const date = federalReturnDueDate(record, taxYear);
    return { date, note: joinNotes("Filed with the federal return (Form 1120 or pro forma 1120).", weekendNote(date)) };
  },
  penalty: "$25,000 per form, per year, for failing to file.",
  sourceUrls: ["https://plane.com/blog/international-founders-us-taxes"],
  asOf: RULES_AS_OF,
};
