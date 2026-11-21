import { compareNotice, lumenLabsRecord } from "@good-standing/core";
import { describe, expect, it } from "vitest";
import { buildRecord } from "../src/buildRecord.ts";
import { extractDocument } from "../src/extractDocument.ts";
import { CERT, fakeModel, GOLDEN, GOLDEN_NOTICE, goldenAnswer, NOTICE, sample } from "./helpers.ts";

describe("Delaware franchise tax notice", () => {
  it("verifies the notice amounts against the PDF and reports them outside the record", async () => {
    const model = fakeModel(goldenAnswer);
    const doc = await extractDocument({ docName: NOTICE, bytes: await sample(NOTICE) }, { model });
    expect(doc.documentType).toBe("delaware_franchise_tax_notice");
    expect(doc.fields.every((f) => f.verified)).toBe(true);
    expect(model.calls.map((c) => c.kind)).toEqual(["document", "notice"]);

    const { notice, record, conflicts } = buildRecord([doc]);
    expect(notice?.franchiseTax).toMatchObject({ value: 85_165, page: 1, verified: true });
    expect(notice?.totalDue?.value).toBe(85_215);
    expect(notice?.taxYear?.value).toBe(2026);
    expect(record.delawareFileNumber.value).toBe("SAMPLE-7654321");
    expect(conflicts).toEqual([]);

    const comparison = compareNotice(notice!, lumenLabsRecord, { defaultTaxYear: 2026 });
    expect(comparison.status === "ok" && comparison.savingsUsd).toBe(84_765);
  });

  it("flags a notice amount that isn't in its quote", async () => {
    const wrong = { ...GOLDEN_NOTICE, noticeFranchiseTax: { value: 851_650, page: 1, quote: "Franchise Tax: $85,165.00", confidence: "high" as const } };
    const doc = await extractDocument({ docName: NOTICE, bytes: await sample(NOTICE) }, { model: fakeModel([GOLDEN[NOTICE], wrong]) });
    const { notice } = buildRecord([doc]);
    expect(notice?.franchiseTax?.verified).toBe(false);
  });

  it("makes no second request and has no notice for other documents", async () => {
    const model = fakeModel(goldenAnswer);
    const doc = await extractDocument({ docName: CERT, bytes: await sample(CERT) }, { model });
    expect(buildRecord([doc]).notice).toBeNull();
    expect(model.calls).toHaveLength(1);
  });

  it("doesn't flag a conflict when the notice prints the name in capitals", async () => {
    const model = fakeModel((docName, kind) => {
      if (kind === "notice") return GOLDEN_NOTICE;
      if (docName === NOTICE) return { ...GOLDEN[NOTICE]!, legalName: { value: "LUMEN LABS, INC.", page: 1, quote: "Corporation: LUMEN LABS, INC.", confidence: "high" } };
      return GOLDEN[docName];
    });
    const docs = await Promise.all([CERT, NOTICE].map(async (docName) => extractDocument({ docName, bytes: await sample(docName) }, { model })));
    const { record, conflicts } = buildRecord(docs);
    expect(conflicts).toEqual([]);
    expect(record.legalName.value).toBe("Lumen Labs, Inc.");
  });
});
