import { addDays, compareIso, formatDate } from "./dates.ts";
import { registeredAgent } from "./rules/registeredAgent.ts";
import type { CompanyRecord } from "./schema.ts";
import { knownValue } from "./schema.ts";

export interface ChecklistItem {
  id: "ein" | "83b" | "bank-account" | "investor-funds" | "backup-payment" | "registered-agent-date";
  title: string;
  /** done: the record shows it. confirm: the record can't know, so ask. todo / urgent: needs action. */
  status: "done" | "todo" | "confirm" | "urgent";
  detail: string;
}

export interface FirstThirtyDays {
  daysSinceIncorporation: number | null;
  items: ChecklistItem[];
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function firstThirtyDaysCheck(record: CompanyRecord, today: string): FirstThirtyDays {
  const incorporated = knownValue(record.incorporationDate);
  const items: ChecklistItem[] = [];

  items.push({
    id: "ein",
    title: "EIN received",
    status: "confirm",
    detail: "Confirm the IRS has issued your Employer Identification Number. You need it for the bank account and tax filings.",
  });

  const has83b = knownValue(record.has83bConfirmation);
  const issued = knownValue(record.founderStockIssueDate);
  const deadline = issued ? addDays(issued, 30) : null;
  const atlas = knownValue(record.atlasCompany) === true;
  if (has83b === true) {
    items.push({ id: "83b", title: "83(b) election confirmation", status: "done", detail: "IRS-stamped confirmation on file." });
  } else if (deadline && compareIso(today, deadline) > 0) {
    items.push({
      id: "83b",
      title: "83(b) election confirmation",
      status: "urgent",
      detail: `The 30-day window closed ${formatDate(deadline)} and no confirmation is on file.${atlas ? " Atlas files it automatically: look in your Atlas Dashboard." : ""} If you can't find it, talk to a tax professional now.`,
    });
  } else {
    items.push({
      id: "83b",
      title: "83(b) election confirmation",
      status: "todo",
      detail: `${deadline ? `Due by ${formatDate(deadline)}. ` : "Due within 30 days of founder stock issuance. "}${atlas ? "Atlas files it automatically; keep the IRS-stamped confirmation when it arrives." : "Get the IRS-stamped confirmation and keep it."}`,
    });
  }

  items.push({
    id: "bank-account",
    title: "Company bank account open",
    status: "confirm",
    detail: "Keep company money separate from personal money from day one.",
  });

  const safes = knownValue(record.safes) ?? [];
  items.push({
    id: "investor-funds",
    title: "Investor money arrives the right way",
    status: "confirm",
    detail: `${safes.length > 0 ? `You have ${safes.length} SAFE${safes.length > 1 ? "s" : ""} on record. ` : ""}Investor money should arrive by wire into the company bank account (or Stripe Treasury via Stripe Fundraising), not a card invoice.`,
  });

  items.push({
    id: "backup-payment",
    title: "Backup payment method",
    status: "confirm",
    detail: "Keep a backup payment method on file so recurring charges, like the registered agent renewal, don't fail.",
  });

  const taxYear = incorporated ? Number(incorporated.slice(0, 4)) : Number(today.slice(0, 4));
  const renewal = registeredAgent.due(record, { taxYear, today });
  items.push({
    id: "registered-agent-date",
    title: "Registered agent renewal on your calendar",
    status: renewal && !renewal.approximate ? "done" : "confirm",
    detail: renewal
      ? `${renewal.approximate ? "Estimated" : "Renews"} ${formatDate(renewal.date)}.${renewal.approximate ? " Confirm the exact date in your Atlas Dashboard and add it to your calendar." : ""} A lapsed agent puts the company out of good standing.`
      : "Add your incorporation date so we can estimate it, then confirm the date in your Atlas Dashboard.",
  });

  return { daysSinceIncorporation: incorporated ? daysBetween(incorporated, today) : null, items };
}
