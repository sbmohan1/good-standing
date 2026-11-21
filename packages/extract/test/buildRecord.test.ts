import { estimateFranchiseTax, lumenLabsRecord } from "@good-standing/core";
import { describe, expect, it } from "vitest";
import { buildRecord } from "../src/buildRecord.ts";
import { extractDocument, type DocumentExtraction } from "../src/extractDocument.ts";
import { CERT, fakeModel, GOLDEN, sample, SPA } from "./helpers.ts";

async function extractBoth(): Promise<DocumentExtraction[]> {
  const model = fakeModel((docName) => GOLDEN[docName]);
  return Promise.all([CERT, SPA].map(async (docName) => extractDocument({ docName, bytes: await sample(docName) }, { model })));
}

describe("buildRecord", () => {
  it("builds the demo company's document facts, all awaiting confirmation", async () => {
    const { record, extractedFields, unverifiedFields, conflicts, founderHints } = buildRecord(await extractBoth());
    expect(record.legalName.value).toBe("Lumen Labs, Inc.");
    expect(record.entityType.value).toBe("c_corp");
    expect(record.incorporationDate.value).toBe("2026-02-10");
    expect(record.shareClasses.value).toEqual([{ name: "Common Stock", authorizedShares: 10_000_000, parValue: 0.00001 }]);
    expect(record.issuedShares.value).toBe(8_000_000);
    expect(record.founderStockIssueDate.value).toBe("2026-02-12");
    expect(record.incorporationDate.provenance).toMatchObject({ kind: "document", docName: CERT, page: 2 });

    for (const field of extractedFields) expect(record[field].status).toBe("needs_confirmation");
    expect(unverifiedFields).toEqual([]);
    expect(conflicts).toEqual([]);
    expect(founderHints).toEqual([{ name: "Priya Raman", shares: 8_000_000, pctOfExtractedShares: 100 }]);

    // Residency, gross assets, states and contractors come from questions, never documents.
    expect(record.founders.status).toBe("missing");
    expect(record.grossAssets.status).toBe("missing");
  });

  it("can't produce a franchise tax number until the founder confirms", async () => {
    const { record } = buildRecord(await extractBoth());
    expect(estimateFranchiseTax(record, { taxYear: 2026 }).status).toBe("needs_confirmation");
  });

  it("never overwrites a fact the founder already confirmed", async () => {
    const base = { ...buildRecord([]).record, issuedShares: lumenLabsRecord.issuedShares };
    const confirmedEleven = { ...base, issuedShares: { ...base.issuedShares, value: 11_000_000, status: "confirmed" as const } };
    const { record, extractedFields } = buildRecord(await extractBoth(), confirmedEleven);
    expect(record.issuedShares.value).toBe(11_000_000);
    expect(extractedFields).not.toContain("issuedShares");
  });

  it("reports conflicting values between documents and prefers the certificate", async () => {
    const docs = await extractBoth();
    const spa = docs.find((d) => d.docName === SPA)!;
    spa.fields.find((f) => f.name === "legalName")!.value = "Lumen Labs Inc";
    const { record, conflicts } = buildRecord(docs);
    expect(record.legalName.value).toBe("Lumen Labs, Inc.");
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatch(/legalName/);
  });

  it("sums issued shares across stock purchase agreements", async () => {
    const docs = await extractBoth();
    const spa = docs.find((d) => d.docName === SPA)!;
    const second: DocumentExtraction = {
      ...spa,
      docName: "Second SPA.pdf",
      fields: spa.fields.map((f) =>
        f.name === "stockPurchaseShares" ? { ...f, value: { purchaser: "Sam Lee", shares: 2_000_000 } } : f,
      ),
    };
    const { record, notes, founderHints } = buildRecord([...docs, second]);
    expect(record.issuedShares.value).toBe(10_000_000);
    expect(notes.join(" ")).toContain("8,000,000 + 2,000,000 = 10,000,000");
    expect(founderHints.map((h) => h.pctOfExtractedShares)).toEqual([80, 20]);
  });
});
