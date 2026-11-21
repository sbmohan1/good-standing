import {
  type CompanyRecord,
  type CompanyRecordField,
  emptyRecord,
  type Fact,
  type Safe,
} from "@good-standing/core";
import type { DocumentExtraction, ExtractedField } from "./extractDocument.ts";

export interface FounderHint {
  name: string;
  shares: number;
  /** Share of the shares found in the stock purchase agreements provided (computed here, not by the model). */
  pctOfExtractedShares: number;
}

export interface BuildResult {
  record: CompanyRecord;
  /** Record fields set from documents in this run. All need the founder's confirmation. */
  extractedFields: CompanyRecordField[];
  /** Fields whose quote or value check failed. Shown first when asking the founder to confirm. */
  unverifiedFields: CompanyRecordField[];
  conflicts: string[];
  notes: string[];
  founderHints: FounderHint[];
}

type Sourced = { doc: DocumentExtraction; field: ExtractedField };

function toFact<T>(value: T, { doc, field }: Sourced): Fact<T> {
  return {
    value,
    // Extracted facts are never auto-confirmed: the founder confirms the record before any estimate runs.
    status: "needs_confirmation",
    confidence: field.confidence,
    provenance: { kind: "document", docName: doc.docName, page: field.page, quote: field.quote },
  };
}

function collect(docs: DocumentExtraction[], name: ExtractedField["name"]): Sourced[] {
  // Certificates first, so a certificate wins over a mention in another document.
  const ordered = [...docs].sort((a, b) => rank(a) - rank(b));
  return ordered.flatMap((doc) => doc.fields.filter((f) => f.name === name).map((field) => ({ doc, field })));
}

function rank(doc: DocumentExtraction): number {
  return doc.documentType.startsWith("certificate_") ? 0 : 1;
}

/**
 * Merge per-document extractions into a CompanyRecord. Fields the founder already confirmed in
 * `base` are never overwritten. All derived values (sums, percentages) are computed here.
 */
export function buildRecord(docs: DocumentExtraction[], base: CompanyRecord = emptyRecord()): BuildResult {
  const record: CompanyRecord = { ...base };
  const extractedFields: CompanyRecordField[] = [];
  const unverifiedFields: CompanyRecordField[] = [];
  const conflicts: string[] = [];
  const notes: string[] = [];

  function set<K extends CompanyRecordField>(key: K, fact: CompanyRecord[K], sources: Sourced[]): void {
    if (base[key].status === "confirmed") {
      notes.push(`Kept your confirmed ${key}; the documents weren't used for it.`);
      return;
    }
    record[key] = fact;
    extractedFields.push(key);
    if (sources.some((s) => !s.field.verified)) unverifiedFields.push(key);
  }

  function single<K extends CompanyRecordField>(key: K, name: ExtractedField["name"]): void {
    const sources = collect(docs, name);
    const [first] = sources;
    if (!first) return;
    for (const other of sources.slice(1)) {
      if (JSON.stringify(other.field.value) !== JSON.stringify(first.field.value)) {
        conflicts.push(
          `${key}: ${first.doc.docName} p.${first.field.page} says ${JSON.stringify(first.field.value)}, but ${other.doc.docName} p.${other.field.page} says ${JSON.stringify(other.field.value)}. Using the first; please confirm.`,
        );
      }
    }
    set(key, toFact(first.field.value, first) as CompanyRecord[K], [first]);
  }

  single("legalName", "legalName");
  single("entityType", "entityType");
  single("delawareFileNumber", "delawareFileNumber");
  single("incorporationDate", "incorporationDate");
  single("shareClasses", "shareClasses");

  // Issued shares: the sum of every stock purchase agreement provided.
  const purchases = collect(docs, "stockPurchaseShares");
  const purchaseValues = purchases.map((p) => p.field.value as { purchaser: string; shares: number });
  const totalPurchased = purchaseValues.reduce((sum, v) => sum + v.shares, 0);
  const [firstPurchase] = purchases;
  if (firstPurchase) {
    set("issuedShares", toFact(totalPurchased, firstPurchase), purchases);
    notes.push(
      purchases.length > 1
        ? `Issued shares = ${purchaseValues.map((v) => v.shares.toLocaleString("en-US")).join(" + ")} = ${totalPurchased.toLocaleString("en-US")} (sum of the stock purchase agreements provided). Add any other issued or treasury shares.`
        : "Issued shares are taken from one stock purchase agreement. If other shares were issued (including treasury shares), correct this.",
    );
  }
  const founderHints: FounderHint[] = purchaseValues.map((v) => ({
    name: v.purchaser,
    shares: v.shares,
    pctOfExtractedShares: Math.round((v.shares / totalPurchased) * 10_000) / 100,
  }));

  // Founder stock issue date: earliest stock purchase agreement date (starts the 83(b) clock).
  const dates = collect(docs, "stockPurchaseDate").sort((a, b) =>
    String(a.field.value).localeCompare(String(b.field.value)),
  );
  const [earliest] = dates;
  if (earliest) {
    set("founderStockIssueDate", toFact(earliest.field.value as string, earliest), [earliest]);
    notes.push("Founder stock issue date is the stock purchase agreement date. Confirm the shares were issued that day.");
  }

  const safes = collect(docs, "safe");
  const [firstSafe] = safes;
  if (firstSafe) {
    set("safes", toFact(safes.map((s) => s.field.value as Safe), firstSafe), safes);
  }

  const elections = collect(docs, "election83b");
  const stamped = elections.find((e) => (e.field.value as { irsStamped: boolean }).irsStamped);
  if (stamped) set("has83bConfirmation", toFact(true, stamped), [stamped]);

  return { record, extractedFields, unverifiedFields, conflicts, notes, founderHints };
}

