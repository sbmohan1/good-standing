import { buildCalendar, type CalendarEntry } from "./calendar.ts";
import { formatDate } from "./dates.ts";
import { describeProvenance, DISCLAIMER, usd } from "./format.ts";
import { displayValue, FIELDS, openQuestions } from "./fields.ts";
import { estimateFranchiseTax } from "./franchiseTax.ts";
import type { RuleContext } from "./rules/types.ts";
import type { CompanyRecord, CompanyRecordField } from "./schema.ts";

/**
 * A read-only summary to hand to an accountant: every fact with its status and source, the
 * franchise tax workings (or why it isn't calculated yet), the obligations calendar and the open
 * questions. Unlike the filing packet it works with an incomplete record, so it shows what's
 * missing instead of refusing.
 */

const STATUS: Record<string, string> = { confirmed: "Confirmed", needs_confirmation: "Unconfirmed", missing: "Missing" };

/** Markdown table cells can't contain pipes or newlines. */
function cell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function source(record: CompanyRecord, field: CompanyRecordField): string {
  const p = record[field].provenance;
  if (!p) return "—";
  if (p.kind === "document") return `${describeProvenance(p)}: "${p.quote}"`;
  if (p.kind === "user") return p.detail ? `Founder answer. ${p.detail}` : "Founder answer";
  return describeProvenance(p);
}

function entryLine(e: CalendarEntry): string {
  const when = e.due ? `${e.due.approximate ? "~" : ""}${formatDate(e.due.date)}` : "No fixed date";
  const amount = e.amount?.usd != null ? `, ${usd(e.amount.usd)}` : "";
  const label = e.label ? ` (${e.label})` : "";
  return `- **${when}: ${e.title}**${label}${amount}. ${e.reason}${e.penalty ? ` If missed: ${e.penalty}` : ""}`;
}

export function buildAccountantSummary(record: CompanyRecord, ctx: RuleContext): { fileName: string; markdown: string } {
  const name = record.legalName.value ?? "Your company";
  const fields = (Object.keys(record) as CompanyRecordField[]).filter((f) => record[f].status !== "missing" && f !== "foreignOwnershipPct");
  const estimate = estimateFranchiseTax(record, { taxYear: ctx.taxYear });
  const calendar = buildCalendar(record, ctx);
  const unconfirmed = (Object.keys(record) as CompanyRecordField[]).filter((f) => record[f].status === "needs_confirmation");

  const lines: string[] = [
    `# ${name}: compliance summary for tax year ${ctx.taxYear}`,
    "",
    `Prepared ${formatDate(ctx.today)} by Good Standing for review by the company's accountant. Read-only: nothing has been filed or paid.`,
    "",
    `> ${DISCLAIMER}`,
    "",
    "## Company facts",
    "",
    "| Fact | Value | Status | Source |",
    "| --- | --- | --- | --- |",
    ...fields.map((f) => `| ${cell(FIELDS[f].label)} | ${cell(displayValue(f, record))} | ${STATUS[record[f].status]} | ${cell(source(record, f))} |`),
    "",
    "## Delaware franchise tax",
    "",
  ];

  if (estimate.status === "ok") {
    const apv = estimate.assumedParValue;
    lines.push(
      `- **Amount due: ${usd(estimate.totalDueUsd)}** (${usd(estimate.taxUsd)} tax by the ${estimate.method === "assumed_par_value" ? "Assumed Par Value Capital" : "Authorized Shares"} method + ${usd(estimate.annualReportFeeUsd)} annual report fee), due ${formatDate(estimate.dueDate)}.`,
      `- Delaware's default notice (Authorized Shares method): ${usd(estimate.delawareNotice.totalUsd)} in total.`,
      "",
      `**Authorized Shares method: ${usd(estimate.authorizedShares.taxUsd)}**`,
      "",
      ...estimate.authorizedShares.workings.map((w) => `1. ${w}`),
      "",
      `**Assumed Par Value Capital method: ${apv.status === "ok" ? usd(apv.taxUsd) : "not calculated"}**`,
      "",
      ...(apv.status === "ok" ? apv.workings : [apv.reason]).map((w) => `1. ${w.trim()}`),
      "",
    );
    if (estimate.flags.length > 0) lines.push(...estimate.flags.map((f) => `- ⚠️ ${f.message}`), "");
  } else if (estimate.status === "needs_confirmation") {
    lines.push("Not calculated yet. Good Standing won't estimate until these are confirmed:", "", ...estimate.missing.map((m) => `- ${m.reason}`), "");
  } else {
    lines.push(estimate.message, "");
  }

  lines.push("## Obligations", "");
  if (calendar.applies.length > 0) lines.push("**Applies**", "", ...calendar.applies.map(entryLine), "");
  if (calendar.maybe.length > 0) lines.push("**May apply**", "", ...calendar.maybe.map(entryLine), "");
  if (calendar.notRequired.length > 0) lines.push("**Not required**", "", ...calendar.notRequired.map((e) => `- ${e.title}: ${e.reason}`), "");

  const questions = openQuestions(record);
  if (unconfirmed.length > 0 || questions.length > 0) {
    lines.push("## Open questions", "");
    if (unconfirmed.length > 0) lines.push(`- Extracted but not yet confirmed by the founder: ${unconfirmed.map((f) => FIELDS[f].label).join(", ")}.`);
    lines.push(...questions.map((q) => `- ${q}`), "");
  }

  lines.push(
    "## Worth checking",
    "",
    "- Gross assets should match total assets on Form 1120, Schedule L.",
    "- Issued shares should include treasury shares and match the cap table.",
    "- Every rule lists its sources and the date it was checked. Rules can change.",
    "",
    "---",
    "",
    DISCLAIMER,
  );

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "company";
  return { fileName: `${slug}-accountant-summary-${ctx.taxYear}.md`, markdown: `${lines.join("\n")}\n` };
}
