import { citeEntityType, federalReturnDueDate, fiscalYearEnd, joinNotes, RULES_AS_OF, weekendNote } from "./shared.js";
import type { Rule } from "./types.js";

export const form1120: Rule = {
  id: "form-1120",
  title: "Federal corporate income tax return (Form 1120)",
  jurisdiction: "US-federal",
  appliesTo(record) {
    const entity = record.entityType.value;
    if (entity === "c_corp") {
      return {
        applies: true,
        reason: `Every C-corp files Form 1120 each year, even with zero revenue (${citeEntityType(record)}).`,
      };
    }
    if (entity === "llc") {
      return {
        applies: false,
        reason:
          "Form 1120 is for C-corps. A foreign-owned single-member LLC files a pro forma 1120 with Form 5472 (see that item); other LLC returns aren't covered here.",
      };
    }
    return { applies: "maybe", reason: "Applies to C-corps. Confirm your entity type." };
  },
  due(record, { taxYear }) {
    const date = federalReturnDueDate(record, taxYear);
    // TODO(verify): C-corps with a June 30 fiscal year end historically had a different due date
    // (15th day of the 3rd month). We apply the 4th-month rule from BRIEF §6 to every fiscal year end.
    const nonCalendar = fiscalYearEnd(record) !== "12-31";
    return {
      date,
      note: joinNotes(
        "Form 7004 extends the time to file by 6 months, but not the time to pay any tax owed.",
        weekendNote(date),
        nonCalendar ? "Non-calendar fiscal year: confirm this date with a tax professional." : undefined,
      ),
    };
  },
  sourceUrls: ["https://docs.stripe.com/atlas/business-taxes?business-type=ccorp"],
  asOf: RULES_AS_OF,
  verifyNote: "Due-date rule for non-calendar (especially June 30) fiscal years not independently verified.",
};
