import { describe, expect, it } from "vitest";
import { lumenLabsRecord } from "../src/fixtures/lumenLabs.js";
import { CompanyRecordSchema, deriveForeignOwnership, emptyRecord, ProvenanceSchema } from "../src/schema.js";

describe("CompanyRecord schema", () => {
  it("accepts the demo record and an empty record", () => {
    expect(CompanyRecordSchema.parse(lumenLabsRecord)).toEqual(lumenLabsRecord);
    expect(() => CompanyRecordSchema.parse(emptyRecord())).not.toThrow();
  });

  it("rejects document quotes longer than 25 words", () => {
    const quote = Array.from({ length: 26 }, () => "word").join(" ");
    expect(() => ProvenanceSchema.parse({ kind: "document", docName: "x.pdf", page: 1, quote })).toThrow();
  });
});

describe("deriveForeignOwnership", () => {
  it("sums non-US-resident founders and shows the derivation", () => {
    const result = deriveForeignOwnership([
      { name: "Priya Raman", ownershipPct: 60, usTaxResident: false },
      { name: "Sam Lee", ownershipPct: 40, usTaxResident: true },
    ]);
    expect(result.pct).toBe(60);
    expect(result.workings.join("\n")).toContain("Priya Raman");
  });
});
