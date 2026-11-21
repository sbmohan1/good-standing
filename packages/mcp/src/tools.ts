import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  buildFilingPacket,
  type CompanyRecord,
  type CompanyRecordField,
  ContractorPaymentSchema,
  defaultTaxYear,
  deriveForeignOwnership,
  EntityTypeSchema,
  estimateFranchiseTax,
  type Fact,
  firstThirtyDaysCheck,
  FounderSchema,
  lumenLabsRecord,
  RegisteredAgentSchema,
  SafeSchema,
  ShareClassSchema,
  summarizeObligations,
} from "@good-standing/core";
import { buildRecord, type DocumentExtraction, extractDocument, type ExtractionModel } from "@good-standing/extract";
import { z } from "zod";
import { explainGrounding } from "./explain.ts";
import { displayValue, FIELDS } from "./fields.ts";
import { openQuestions, renderCalendar, renderEstimate, renderRecord } from "./render.ts";
import type { RecordStore } from "./store.ts";
import { checkAgentKey, fetchStripeHints, renderStripeHints, type StripeReader } from "./stripeHints.ts";

export interface ToolDeps {
  store: RecordStore;
  extractionModel: () => ExtractionModel;
  /** Today's date (YYYY-MM-DD). */
  today: () => string;
  /** Current timestamp (ISO), for user-answer provenance. */
  now: () => string;
  cwd: string;
  /** Where to write packet files; null to skip writing. */
  packetDir: string | null;
  writeFile?: (file: string, text: string) => Promise<void>;
  /** The configured Stripe agent key (never logged or echoed). */
  stripeKey?: string;
  stripeReader?: (key: string) => StripeReader;
}

export interface ToolResult {
  text: string;
  isError?: boolean;
}

// ---------- Input schemas ----------

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use YYYY-MM-DD");
const taxYear = z.number().int().min(2020).max(2100).optional().describe("Tax year, e.g. 2026. Defaults from today's date.");

export const FactsSchema = z
  .object({
    entityType: EntityTypeSchema.optional(),
    legalName: z.string().min(1).optional(),
    delawareFileNumber: z.string().min(1).optional(),
    incorporationDate: isoDate.optional(),
    fiscalYearEnd: z.string().regex(/^\d{2}-\d{2}$/, "use MM-DD").optional().describe("MM-DD, e.g. 12-31"),
    shareClasses: z.array(ShareClassSchema).min(1).optional().describe("parValue null means no-par stock"),
    issuedShares: z.number().int().nonnegative().optional().describe("All issued shares, including treasury shares"),
    grossAssets: z.number().nonnegative().optional().describe("Total assets from Form 1120 Schedule L for the tax year, in USD. Not a bank or Stripe balance."),
    founders: z.array(FounderSchema).optional(),
    safes: z.array(SafeSchema).optional(),
    statesWithOperations: z.array(z.string().regex(/^[A-Z]{2}$/)).optional().describe("Two-letter codes of states besides Delaware; [] for none"),
    contractorPaymentsByPayee: z.array(ContractorPaymentSchema).optional().describe("[] for none"),
    registeredAgent: RegisteredAgentSchema.optional(),
    has83bConfirmation: z.boolean().optional(),
    atlasCompany: z.boolean().optional(),
    founderStockIssueDate: isoDate.optional(),
    hasReportableRelatedPartyTransactions: z.boolean().optional(),
    amendedAuthorizedSharesThisYear: z.boolean().optional(),
    listedOnNationalExchange: z.boolean().optional(),
  })
  .strict();

const CONFIRMABLE = Object.keys(FactsSchema.shape) as [keyof z.infer<typeof FactsSchema>, ...Array<keyof z.infer<typeof FactsSchema>>];

export const inputSchemas = {
  ingestDocuments: z.object({
    paths: z.array(z.string().min(1)).min(1).max(10).describe("Paths to PDF files (absolute, or relative to the server's working directory)"),
  }),
  setCompanyFacts: z.object({
    facts: FactsSchema.optional().describe("Values the founder gave or corrected. Each becomes confirmed, sourced to the founder."),
    confirm: z.array(z.enum(CONFIRMABLE)).optional().describe("Fields whose extracted value the founder checked and accepts as-is. Keeps the document citation."),
  }),
  loadDemoCompany: z.object({
    overwrite: z.boolean().optional().describe("Must be true to replace an existing record"),
  }),
  taxYearOnly: z.object({ taxYear }),
  explain: z.object({ question: z.string().min(1).max(2000) }),
};

// ---------- Helpers ----------

function ctxFor(deps: ToolDeps, year?: number) {
  const today = deps.today();
  return { taxYear: year ?? defaultTaxYear(today), today, defaulted: year === undefined };
}

function readiness(record: CompanyRecord, year: number): string {
  const estimate = estimateFranchiseTax(record, { taxYear: year });
  if (estimate.status === "ok") return `Ready: everything the franchise tax estimate needs is confirmed. Ask "what does my company owe this year?"`;
  if (estimate.status === "needs_confirmation") return `Not ready for a franchise tax estimate yet: ${estimate.missing.map((m) => m.reason).join("; ")}.`;
  return estimate.message;
}

// ---------- Tools ----------

export async function ingestDocuments(deps: ToolDeps, input: z.infer<typeof inputSchemas.ingestDocuments>): Promise<ToolResult> {
  const model = deps.extractionModel();
  const docs: DocumentExtraction[] = [];
  const failures: string[] = [];
  for (const p of input.paths) {
    const file = path.resolve(deps.cwd, p);
    const docName = path.basename(file);
    try {
      const bytes = new Uint8Array(await readFile(file));
      docs.push(await extractDocument({ docName, bytes }, { model }));
    } catch (error) {
      // Error messages never include document contents.
      failures.push(`${docName}: ${error instanceof Error ? error.message : "couldn't be read"}`);
    }
  }
  if (docs.length === 0) {
    return { isError: true, text: `No documents were extracted.\n\n${failures.map((f) => `- ${f}`).join("\n")}` };
  }

  const existing = await deps.store.load();
  const result = buildRecord(docs, existing);
  await deps.store.save(result.record);

  const lines = ["## Extracted from your documents", ""];
  for (const doc of docs) {
    lines.push(`### ${doc.docName} (${doc.documentType.replace(/_/g, " ")}, ${doc.totalPages} pages)`, "");
    if (doc.fields.length === 0) lines.push("- Nothing relevant found.");
    for (const f of doc.fields) {
      const check = f.verified ? "quote verified" : `⚠️ ${f.issues.join(" ")}`;
      lines.push(`- **${f.name}**: ${JSON.stringify(f.value)} · p.${f.page}: "${f.quote}" · ${check}`);
    }
    lines.push("");
  }
  if (failures.length > 0) lines.push("### Couldn't read", ...failures.map((f) => `- ${f}`), "");
  if (result.unverifiedFields.length > 0) {
    lines.push(`**Check these first, their quotes didn't verify:** ${result.unverifiedFields.map((f) => FIELDS[f].label).join(", ")}.`, "");
  }
  if (result.conflicts.length > 0) lines.push("**Conflicts:**", ...result.conflicts.map((c) => `- ${c}`), "");
  if (result.notes.length > 0) lines.push("**Notes:**", ...result.notes.map((n) => `- ${n}`), "");
  if (result.founderHints.length > 0) {
    lines.push(
      `**Founders in these documents:** ${result.founderHints.map((h) => `${h.name} (${h.shares.toLocaleString("en-US")} shares, ${h.pctOfExtractedShares}% of shares in these agreements)`).join("; ")}. Ask whether each is a US tax resident; residency never comes from documents.`,
      "",
    );
  }
  lines.push(
    "## Next",
    "",
    `Every extracted value needs the founder's confirmation. Show them each value and quote, then call \`set_company_facts\` with \`confirm\` for the ones they accept and \`facts\` for corrections.`,
    "",
    ...openQuestions(result.record).map((q) => `- ${q}`),
    "",
    `_Record saved locally at ${deps.store.path}. The PDFs were processed in memory and not stored._`,
  );
  return { text: lines.join("\n") };
}

export async function getCompanyRecord(deps: ToolDeps): Promise<ToolResult> {
  const record = await deps.store.load();
  const exists = await deps.store.exists();
  const intro = exists
    ? ""
    : "_No record yet. Use `ingest_documents` with the founder's Certificate of Incorporation and stock purchase agreement, or `load_demo_company` to try the fictional demo company._\n\n";
  return { text: `${intro}${renderRecord(record, { storePath: deps.store.path })}\n\n${readiness(record, ctxFor(deps).taxYear)}` };
}

export async function setCompanyFacts(deps: ToolDeps, input: z.infer<typeof inputSchemas.setCompanyFacts>): Promise<ToolResult> {
  const record = await deps.store.load();
  const answeredAt = deps.now();
  const changed: string[] = [];
  const problems: string[] = [];
  const facts = input.facts ?? {};

  for (const [key, value] of Object.entries(facts) as Array<[CompanyRecordField, unknown]>) {
    if (value === undefined) continue;
    (record[key] as Fact<unknown>) = { value, status: "confirmed", provenance: { kind: "user", answeredAt } };
    changed.push(`${FIELDS[key].label}: set to ${displayValue(key, record)} (founder answer)`);
  }

  for (const key of input.confirm ?? []) {
    if (key in facts) continue;
    const fact = record[key];
    if (fact.status === "missing" || fact.value === null) {
      problems.push(`${FIELDS[key].label} has no value to confirm. Provide it in \`facts\`.`);
    } else if (fact.status === "confirmed") {
      changed.push(`${FIELDS[key].label}: already confirmed`);
    } else {
      (record[key] as Fact<unknown>) = { ...fact, status: "confirmed" };
      changed.push(`${FIELDS[key].label}: confirmed ${displayValue(key, record)} (keeps its document citation)`);
    }
  }

  // Foreign ownership is always derived from founders, never entered directly.
  if (facts.founders || (input.confirm ?? []).includes("founders")) {
    const founders = record.founders.value ?? [];
    const { pct } = deriveForeignOwnership(founders);
    record.foreignOwnershipPct = { value: pct, status: record.founders.status, provenance: { kind: "user", answeredAt } };
    const total = founders.reduce((sum, f) => sum + f.ownershipPct, 0);
    if (Math.abs(total - 100) > 0.01) problems.push(`Founder ownership adds up to ${total}%, not 100%. That's fine if others own shares; otherwise correct it.`);
  }

  if (changed.length === 0 && problems.length === 0) {
    return { isError: true, text: "Nothing to update. Pass `facts` with values or `confirm` with field names." };
  }
  await deps.store.save(record);

  const year = ctxFor(deps).taxYear;
  const questions = openQuestions(record);
  return {
    text: [
      "## Record updated",
      "",
      ...changed.map((c) => `- ${c}`),
      ...(problems.length > 0 ? ["", "**Check:**", ...problems.map((p) => `- ${p}`)] : []),
      "",
      readiness(record, year),
      ...(questions.length > 0 ? ["", "**Still open:**", ...questions.map((q) => `- ${q}`)] : []),
    ].join("\n"),
  };
}

export async function loadDemoCompany(deps: ToolDeps, input: z.infer<typeof inputSchemas.loadDemoCompany>): Promise<ToolResult> {
  if ((await deps.store.exists()) && !input.overwrite) {
    return {
      isError: true,
      text: `A record already exists at ${deps.store.path}. Call again with \`overwrite: true\` to replace it with the demo company.`,
    };
  }
  await deps.store.save(lumenLabsRecord);
  return {
    text: [
      "Loaded **Lumen Labs, Inc.**, a fictional Delaware C-corp (SAMPLE data, not a real company), with every fact already confirmed.",
      "",
      `Try: "What does my company owe this year?"`,
      "",
      renderRecord(lumenLabsRecord, { storePath: deps.store.path }),
    ].join("\n"),
  };
}

export async function complianceCalendar(deps: ToolDeps, input: z.infer<typeof inputSchemas.taxYearOnly>): Promise<ToolResult> {
  const record = await deps.store.load();
  const ctx = ctxFor(deps, input.taxYear);
  const summary = summarizeObligations(record, ctx);
  return { text: renderCalendar(summary, { defaulted: ctx.defaulted }) };
}

export async function franchiseTaxEstimate(deps: ToolDeps, input: z.infer<typeof inputSchemas.taxYearOnly>): Promise<ToolResult> {
  const record = await deps.store.load();
  const ctx = ctxFor(deps, input.taxYear);
  return { text: renderEstimate(estimateFranchiseTax(record, { taxYear: ctx.taxYear })) };
}

export async function prepareFilingPacket(deps: ToolDeps, input: z.infer<typeof inputSchemas.taxYearOnly>): Promise<ToolResult> {
  const record = await deps.store.load();
  const ctx = ctxFor(deps, input.taxYear);
  const packet = buildFilingPacket(record, ctx);
  if (packet.status === "not_applicable") return { text: packet.message };
  if (packet.status === "needs_confirmation") {
    return { text: `## Packet not ready\n\n${packet.message}\n\nConfirm these with \`set_company_facts\`, then ask again.` };
  }
  let savedNote = "";
  if (deps.packetDir && deps.writeFile) {
    const file = path.join(deps.packetDir, packet.fileName);
    await deps.writeFile(file, packet.markdown);
    savedNote = `_Saved a copy to ${file}._\n\n`;
  }
  return { text: `${savedNote}${packet.markdown}` };
}

export async function firstThirtyDays(deps: ToolDeps): Promise<ToolResult> {
  const record = await deps.store.load();
  const check = firstThirtyDaysCheck(record, deps.today());
  const icon = { done: "✅", todo: "⬜", confirm: "❓", urgent: "⚠️" } as const;
  const age =
    check.daysSinceIncorporation === null
      ? "Add your incorporation date to see how far along you are."
      : check.daysSinceIncorporation <= 30
        ? `Your company is ${check.daysSinceIncorporation} days old.`
        : `Your company is ${check.daysSinceIncorporation} days old, past the first 30 days, but every item still matters.`;
  return {
    text: [
      "## First 30 days check",
      "",
      age,
      "",
      ...check.items.map((i) => `- ${icon[i.status]} **${i.title}** (${i.status}): ${i.detail}`),
      "",
      "❓ means Good Standing can't know from your record; ask the founder.",
    ].join("\n"),
  };
}

export async function explain(deps: ToolDeps, input: z.infer<typeof inputSchemas.explain>): Promise<ToolResult> {
  const record = await deps.store.load();
  const ctx = ctxFor(deps);
  return { text: explainGrounding(input.question, record, { taxYear: ctx.taxYear, today: ctx.today }) };
}


export async function fetchStripeHintsTool(deps: ToolDeps): Promise<ToolResult> {
  const check = checkAgentKey(deps.stripeKey);
  if (!check.ok) return { isError: true, text: check.reason };
  if (!deps.stripeReader) return { isError: true, text: "Stripe hints aren't available in this build." };
  const key = deps.stripeKey as string;
  const hints = await fetchStripeHints(deps.stripeReader(key), {
    now: deps.now(),
    mode: key.startsWith("rk_test_") ? "test" : "live",
  });
  return { text: renderStripeHints(hints) };
}
