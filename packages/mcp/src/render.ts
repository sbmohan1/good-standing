import {
  type CalendarEntry,
  type CompanyRecord,
  type CompanyRecordField,
  deriveForeignOwnership,
  describeProvenance,
  DISCLAIMER,
  type FranchiseTaxEstimate,
  formatDate,
  knownValue,
  type ObligationsSummary,
  usd,
} from "@good-standing/core";
import { displayValue, FIELDS } from "@good-standing/core";

export function withFooter(text: string): string {
  return `${text.trimEnd()}\n\n---\n_${DISCLAIMER}_`;
}

const STATUS_LABEL = { confirmed: "confirmed", needs_confirmation: "**needs confirmation**", missing: "missing" } as const;

function sourceCell(record: CompanyRecord, field: CompanyRecordField): string {
  const p = record[field].provenance;
  if (!p) return "—";
  if (p.kind === "document") return `${describeProvenance(p)}: "${p.quote}"`;
  return describeProvenance(p);
}

function escapeCell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

export function renderRecord(record: CompanyRecord, opts: { storePath?: string } = {}): string {
  const fields = Object.keys(FIELDS) as CompanyRecordField[];
  const lines = [
    "## Company record",
    "",
    "| Field | Value | Status | Source |",
    "| --- | --- | --- | --- |",
    ...fields.map(
      (f) =>
        `| ${FIELDS[f].label} | ${escapeCell(displayValue(f, record))} | ${STATUS_LABEL[record[f].status]} | ${escapeCell(sourceCell(record, f))} |`,
    ),
  ];

  const founders = knownValue(record.founders);
  if (founders && founders.length > 0) {
    lines.push("", "**Foreign ownership (derived from founders):** " + deriveForeignOwnership(founders).workings.join("; "));
  }

  const toConfirm = fields.filter((f) => record[f].status === "needs_confirmation");
  if (toConfirm.length > 0) {
    lines.push(
      "",
      `**Waiting for your confirmation:** ${toConfirm.map((f) => FIELDS[f].label).join(", ")}. Check each value against its quote, then confirm or correct it with \`set_company_facts\`.`,
    );
  }
  const questions = openQuestions(record);
  if (questions.length > 0) {
    lines.push("", "**Questions to answer:**", ...questions.map((q) => `- ${q}`));
  }
  if (opts.storePath) lines.push("", `_Stored locally at ${opts.storePath}._`);
  return lines.join("\n");
}

/** Questions for missing fields, most important first. */
export function openQuestions(record: CompanyRecord): string[] {
  const order: CompanyRecordField[] = [
    "grossAssets",
    "founders",
    "issuedShares",
    "shareClasses",
    "entityType",
    "incorporationDate",
    "contractorPaymentsByPayee",
    "statesWithOperations",
    "atlasCompany",
    "registeredAgent",
    "has83bConfirmation",
    "founderStockIssueDate",
    "hasReportableRelatedPartyTransactions",
    "amendedAuthorizedSharesThisYear",
    "fiscalYearEnd",
  ];
  return order
    .filter((f) => record[f].status === "missing" && FIELDS[f].question)
    .map((f) => `${FIELDS[f].label}: ${FIELDS[f].question}`);
}

function renderEntry(e: CalendarEntry): string[] {
  const when = e.due ? `${e.due.approximate ? "~" : ""}${formatDate(e.due.date)}` : "No fixed date";
  const amount = e.amount ? (e.amount.usd !== null ? ` · **${usd(e.amount.usd)}**` : " · amount needs confirmed facts") : "";
  const label = e.label ? ` _(${e.label})_` : "";
  const lines = [`- **${when}: ${e.title}**${label}${amount}${e.urgent ? " · ⚠️ urgent" : ""}`, `  - Why: ${e.reason}`];
  if (e.due?.note) lines.push(`  - Note: ${e.due.note}`);
  if (e.amount?.needsConfirmation?.length) lines.push(`  - To calculate: confirm ${e.amount.needsConfirmation.map((f) => FIELDS[f as CompanyRecordField]?.label ?? f).join(", ")}`);
  if (e.penalty) lines.push(`  - If missed: ${e.penalty}`);
  lines.push(`  - Sources (checked ${e.asOf}): ${e.sourceUrls.join(", ")}`);
  if (e.verifyNote) lines.push(`  - To verify: ${e.verifyNote}`);
  return lines;
}

export function renderCalendar(summary: ObligationsSummary, opts: { defaulted?: boolean } = {}): string {
  const { calendar } = summary;
  const lines = [
    `## What you owe for tax year ${summary.taxYear}`,
    "",
    ...summary.headline.map((h) => `${h}`),
    "",
  ];
  if (opts.defaulted) {
    lines.push(`_Tax year ${summary.taxYear} chosen from today's date (${formatDate(calendar.generatedFor)}). Ask for another year with \`taxYear\`._`, "");
  }
  const group = (title: string, entries: CalendarEntry[]) => {
    lines.push(`### ${title}`, "");
    if (entries.length === 0) lines.push("- None.");
    else for (const e of entries) lines.push(...renderEntry(e));
    lines.push("");
  };
  group("Applies", calendar.applies);
  group("May apply: please confirm", calendar.maybe);
  lines.push("### Not required", "");
  if (calendar.notRequired.length === 0) lines.push("- None.");
  for (const e of calendar.notRequired) lines.push(`- **${e.title}**: ${e.reason} (source: ${e.sourceUrls[0]})`);
  return lines.join("\n");
}

export function renderEstimate(estimate: FranchiseTaxEstimate): string {
  if (estimate.status === "not_applicable") return `## Delaware franchise tax\n\n${estimate.message}`;
  if (estimate.status === "needs_confirmation") {
    return [
      "## Delaware franchise tax: not estimated yet",
      "",
      estimate.message,
      "",
      ...estimate.missing.map((m) => `- ${m.reason} (\`${m.field}\`)`),
      "",
      "Confirm or provide these with `set_company_facts`, then ask again.",
    ].join("\n");
  }

  const apv = estimate.assumedParValue;
  const method = estimate.method === "assumed_par_value" ? "Assumed Par Value Capital" : "Authorized Shares";
  const input = (label: string, fact: { value: unknown; provenance?: Parameters<typeof describeProvenance>[0] }, shown: string) =>
    `- ${label}: ${shown} (${describeProvenance(fact.provenance)}${fact.provenance?.kind === "document" ? `: "${fact.provenance.quote}"` : ""})`;

  return [
    `## Delaware franchise tax, tax year ${estimate.taxYear}`,
    "",
    `**You owe ${usd(estimate.totalDueUsd)}**: ${usd(estimate.taxUsd)} franchise tax (${method} method) + ${usd(estimate.annualReportFeeUsd)} annual report fee, due **${formatDate(estimate.dueDate)}**.`,
    "",
    `**Delaware notice vs. actual:** ${estimate.delawareNotice.explanation}`,
    "",
    "### Inputs",
    input("Authorized shares", estimate.inputs.shareClasses, (estimate.inputs.shareClasses.value ?? []).map((c) => `${c.authorizedShares.toLocaleString("en-US")} ${c.name} @ ${c.parValue === null ? "no par" : `$${c.parValue}`}`).join("; ")),
    input("Issued shares (incl. treasury)", estimate.inputs.issuedShares, (estimate.inputs.issuedShares.value ?? 0).toLocaleString("en-US")),
    input("Gross assets (Schedule L total assets)", estimate.inputs.grossAssets, usd(estimate.inputs.grossAssets.value ?? 0)),
    "",
    `### Authorized Shares method: ${usd(estimate.authorizedShares.taxUsd)}`,
    ...estimate.authorizedShares.workings.map((w) => `- ${w}`),
    "",
    apv.status === "ok" ? `### Assumed Par Value Capital method: ${usd(apv.taxUsd)}` : "### Assumed Par Value Capital method: not calculated",
    ...(apv.status === "ok" ? apv.workings.map((w) => `- ${w.trim()}`) : [`- ${apv.reason}`]),
    "",
    `Delaware lets you pay the lower amount: **${usd(estimate.taxUsd)}**.`,
    ...(estimate.installments
      ? ["", "### Installments (tax of $5,000 or more)", ...estimate.installments.map((i) => `- ${formatDate(i.date)}: ${i.percent}%${i.note ? ` (${i.note})` : ""}, ${usd(i.usd)}`)]
      : []),
    ...(estimate.flags.length > 0 ? ["", "### Check", ...estimate.flags.map((f) => `- ${f.message}`)] : []),
    "",
    `If late: ${estimate.latePenalty}`,
    `Sources: ${estimate.sourceUrls.join(", ")}`,
    ...estimate.verifyNotes.map((n) => `To verify: ${n}`),
  ].join("\n");
}
