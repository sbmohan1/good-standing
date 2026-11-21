import { buildCalendar } from "./calendar.ts";
import { formatDate } from "./dates.ts";
import { estimateFranchiseTax, type MissingInput } from "./franchiseTax.ts";
import { count, describeProvenance, DISCLAIMER, usd } from "./format.ts";
import { LINKS } from "./links.ts";
import type { RuleContext } from "./rules/types.ts";
import type { CompanyRecord, Fact } from "./schema.ts";

export type FilingPacket =
  | { status: "ok"; taxYear: number; fileName: string; markdown: string }
  | { status: "needs_confirmation"; taxYear: number; missing: MissingInput[]; message: string }
  | { status: "not_applicable"; taxYear: number; message: string };

function source<T>(fact: Fact<T>): string {
  return fact.status === "confirmed" ? describeProvenance(fact.provenance) : "not confirmed";
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

/**
 * A Markdown packet for the Delaware annual report and franchise tax: pre-filled fields with their
 * sources, the computation, a checklist and links. The founder reviews it and files it themselves.
 */
export function buildFilingPacket(record: CompanyRecord, ctx: RuleContext): FilingPacket {
  const estimate = estimateFranchiseTax(record, { taxYear: ctx.taxYear });
  if (estimate.status !== "ok") return estimate;

  const name = record.legalName.value ?? "Your company";
  const classes = estimate.inputs.shareClasses.value ?? [];
  const calendar = buildCalendar(record, ctx);
  const others = [...calendar.applies, ...calendar.maybe].filter((e) => e.ruleId !== "de-franchise-tax");
  const methodName = estimate.method === "assumed_par_value" ? "Assumed Par Value Capital" : "Authorized Shares";
  const apv = estimate.assumedParValue;

  const lines = [
    `# Delaware annual report and franchise tax, tax year ${ctx.taxYear}`,
    "",
    `**${name}**, prepared ${formatDate(ctx.today)} by Good Standing.`,
    "",
    "> You file this yourself. Good Standing never files or pays anything. Check every value before you submit.",
    "",
    "## Amount due",
    "",
    `- **Total: ${usd(estimate.totalDueUsd)}**, made up of ${usd(estimate.taxUsd)} franchise tax (${methodName} method) and the ${usd(estimate.annualReportFeeUsd)} annual report fee.`,
    `- **Due: ${formatDate(estimate.dueDate)}.** Late filing costs ${estimate.latePenalty.charAt(0).toLowerCase()}${estimate.latePenalty.slice(1)}`,
    `- Delaware's notice may show ${usd(estimate.delawareNotice.totalUsd)}, because it defaults to the Authorized Shares method. Entering your gross assets and issued shares below is what gets you the lower amount.`,
    ...(estimate.installments
      ? [
          "- Because the tax is $5,000 or more, Delaware's installment schedule applies:",
          ...estimate.installments.map((i) => `  - ${formatDate(i.date)}: ${i.percent}%${i.note ? ` (${i.note})` : ""}, ${usd(i.usd)}`),
        ]
      : []),
    "",
    "## Fields to enter in the annual report",
    "",
    "| Field | Value | Source |",
    "| --- | --- | --- |",
    `| Corporation name | ${name} | ${source(record.legalName)} |`,
    `| Delaware file number | ${record.delawareFileNumber.value ?? "_find it on your certificate or in the Atlas Dashboard_"} | ${source(record.delawareFileNumber)} |`,
    ...classes.map(
      (c) =>
        `| Authorized shares: ${c.name} | ${count(c.authorizedShares)} at ${c.parValue === null ? "no par" : `$${c.parValue} par`} | ${source(estimate.inputs.shareClasses)} |`,
    ),
    `| Issued shares (including treasury shares), as of ${ctx.taxYear}-12-31 | ${count(estimate.inputs.issuedShares.value ?? 0)} | ${source(estimate.inputs.issuedShares)} |`,
    `| Gross assets (Form 1120 Schedule L total assets), ${ctx.taxYear} | ${usd(estimate.inputs.grossAssets.value ?? 0)} | ${source(estimate.inputs.grossAssets)} |`,
    "| Officers and directors | _Enter each name and address. Good Standing doesn't store these._ | You |",
    "| Principal place of business | _Enter your current business address._ | You |",
    "",
    "## How the tax was calculated",
    "",
    "**Authorized Shares method (Delaware's default)**",
    "",
    ...estimate.authorizedShares.workings.map((w) => `- ${w}`),
    `- Result: ${usd(estimate.authorizedShares.taxUsd)}`,
    "",
    "**Assumed Par Value Capital method**",
    "",
    ...(apv.status === "ok"
      ? [...apv.workings.map((w) => `- ${w.trim()}`), `- Result: ${usd(apv.taxUsd)}`]
      : [`- Not calculated: ${apv.reason}`]),
    "",
    `You pay the lower: **${usd(estimate.taxUsd)}**.`,
    ...(estimate.flags.length > 0 ? ["", "**Check before filing**", "", ...estimate.flags.map((f) => `- ${f.message}`)] : []),
    "",
    "## Checklist",
    "",
    `- [ ] Gross assets match total assets on your ${ctx.taxYear} Form 1120, Schedule L.`,
    "- [ ] Issued shares include every share issued, including treasury shares.",
    "- [ ] Officer and director names and addresses are current.",
    `- [ ] File and pay at ${LINKS.delawareFileOnline} (instructions: ${LINKS.delawareAnnualReportInstructions}).`,
    `- [ ] Save the confirmation, and note the filing in your Atlas Dashboard (${LINKS.atlasDashboard}).`,
    "",
    "## Also on your calendar this tax year",
    "",
    ...(others.length > 0
      ? others.map((e) => {
          const when = e.due ? `${e.due.approximate ? "~" : ""}${formatDate(e.due.date)}` : "no fixed date";
          const amount = e.amount?.usd != null ? `, ${usd(e.amount.usd)}` : "";
          const label = e.status === "maybe" ? ` (${e.label ?? "may apply"})` : "";
          return `- ${when}: ${e.title}${label}${amount}`;
        })
      : ["- Nothing else found."]),
    "",
    "## Sources",
    "",
    ...estimate.sourceUrls.map((u) => `- ${u}`),
    ...estimate.verifyNotes.map((n) => `- To verify: ${n}`),
    "",
    "---",
    "",
    `_${DISCLAIMER}_`,
    "",
  ];

  return {
    status: "ok",
    taxYear: ctx.taxYear,
    fileName: `${slug(name)}-delaware-annual-report-${ctx.taxYear}.md`,
    markdown: lines.join("\n"),
  };
}
