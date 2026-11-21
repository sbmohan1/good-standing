import { addDays, compareIso, formatDate } from "../dates.ts";
import { cite } from "../format.ts";
import { knownValue } from "../schema.ts";
import { RULES_AS_OF } from "./shared.ts";
import type { Rule } from "./types.ts";

const ELECTION_WINDOW_DAYS = 30;

export const election83b: Rule = {
  id: "83b-election",
  title: "83(b) election for founder stock",
  jurisdiction: "US-federal",
  appliesTo(record, { today }) {
    const has83b = knownValue(record.has83bConfirmation);
    if (has83b === true) {
      return {
        applies: false,
        reason: `Done: your IRS-stamped 83(b) confirmation is on file (${cite("83(b) confirmation", record.has83bConfirmation, () => "yes")}). Keep it with your permanent records.`,
      };
    }

    const issued = knownValue(record.founderStockIssueDate);
    const atlas = knownValue(record.atlasCompany) === true;
    const atlasNote = atlas ? " Atlas files the 83(b) automatically for Atlas companies." : "";
    if (!issued) {
      return {
        applies: "maybe",
        reason: `An 83(b) election is due within 30 days of founder stock issuance.${atlasNote} When was your founder stock issued, and do you have the IRS-stamped confirmation?`,
      };
    }

    const deadline = addDays(issued, ELECTION_WINDOW_DAYS);
    const issuedCite = cite("founder stock issued", record.founderStockIssueDate);
    if (compareIso(today, deadline) <= 0) {
      return {
        applies: true,
        reason: `Due within 30 days of founder stock issuance, so by ${formatDate(deadline)} (${issuedCite}).${atlasNote} Confirm you receive the IRS-stamped confirmation.`,
      };
    }
    return {
      applies: true,
      urgent: true,
      reason: `The 30-day window closed on ${formatDate(deadline)} (${issuedCite}) and there's no 83(b) confirmation on file.${atlas ? " Atlas files it automatically: look for the IRS-stamped confirmation in your Atlas Dashboard." : ""} If you can't find it, talk to a tax professional now.`,
    };
  },
  due(record) {
    const issued = knownValue(record.founderStockIssueDate);
    return issued ? { date: addDays(issued, ELECTION_WINDOW_DAYS) } : null;
  },
  // TODO(verify): BRIEF §6 gives no source URL for this rule. stripe.com/atlas supports "Atlas files
  // it automatically"; an IRS source for the 30-day window should be added.
  sourceUrls: ["https://stripe.com/atlas"],
  asOf: RULES_AS_OF,
  verifyNote: "No primary (IRS) source cited yet for the 30-day 83(b) window.",
};
