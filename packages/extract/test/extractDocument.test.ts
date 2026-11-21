import { describe, expect, it } from "vitest";
import { extractDocument, ExtractionFailedError } from "../src/extractDocument.ts";
import { InvalidDocumentError } from "../src/pdfText.ts";
import { CERT, fakeModel, GOLDEN, sample, SPA } from "./helpers.ts";

describe("extractDocument", () => {
  it("verifies every quote and value in a correct answer", async () => {
    const result = await extractDocument({ docName: CERT, bytes: await sample(CERT) }, { model: fakeModel([GOLDEN[CERT]]) });
    expect(result.totalPages).toBe(2);
    expect(result.documentType).toBe("certificate_of_incorporation");
    expect(result.fields.map((f) => f.name)).toEqual([
      "legalName",
      "entityType",
      "delawareFileNumber",
      "incorporationDate",
      "shareClasses",
    ]);
    for (const field of result.fields) {
      expect(field.issues).toEqual([]);
      expect(field.verified).toBe(true);
    }
  });

  it("downgrades a field whose quote isn't in the PDF", async () => {
    const answer = structuredClone(GOLDEN[CERT]!);
    answer.shareClasses = { ...answer.shareClasses!, quote: "authorized to issue 20,000,000 shares of Common Stock" };
    const result = await extractDocument({ docName: CERT, bytes: await sample(CERT) }, { model: fakeModel([answer]) });
    const field = result.fields.find((f) => f.name === "shareClasses")!;
    expect(field.verified).toBe(false);
    expect(field.confidence).toBe("low");
    expect(field.issues.join(" ")).toMatch(/could not be found/);
  });

  it("catches a value that doesn't match its (real) quote", async () => {
    const answer = structuredClone(GOLDEN[SPA]!);
    answer.stockPurchaseShares = { ...answer.stockPurchaseShares!, value: { purchaser: "Priya Raman", shares: 800_000 } };
    const result = await extractDocument({ docName: SPA, bytes: await sample(SPA) }, { model: fakeModel([answer]) });
    const field = result.fields.find((f) => f.name === "stockPurchaseShares")!;
    expect(field.quoteCheck.status).toBe("verified");
    expect(field.valueCheck).toBe("mismatch");
    expect(field.verified).toBe(false);
  });

  it("flags a quote cited on the wrong page", async () => {
    const answer = structuredClone(GOLDEN[CERT]!);
    answer.incorporationDate = { ...answer.incorporationDate!, page: 1 };
    const result = await extractDocument({ docName: CERT, bytes: await sample(CERT) }, { model: fakeModel([answer]) });
    const field = result.fields.find((f) => f.name === "incorporationDate")!;
    expect(field.quoteCheck).toEqual({ status: "wrong_page", foundOnPage: 2 });
    expect(field.verified).toBe(false);
  });

  it("retries once with the validation errors after a schema failure", async () => {
    const bad = { ...GOLDEN[CERT]!, incorporationDate: { ...GOLDEN[CERT]!.incorporationDate!, value: "Feb 10 2026" } };
    const model = fakeModel([bad, GOLDEN[CERT]]);
    const result = await extractDocument({ docName: CERT, bytes: await sample(CERT) }, { model });
    expect(model.calls).toHaveLength(2);
    expect(model.calls[1]!.retryFeedback).toMatch(/incorporationDate\.value: dates must be YYYY-MM-DD/);
    expect(result.fields.find((f) => f.name === "incorporationDate")!.value).toBe("2026-02-10");
  });

  it("rejects quotes over 25 words and pages past the end of the document", async () => {
    const long = Array.from({ length: 26 }, () => "word").join(" ");
    const bad = { ...GOLDEN[CERT]!, legalName: { ...GOLDEN[CERT]!.legalName!, quote: long, page: 9 } };
    const model = fakeModel([bad, bad]);
    const error = await extractDocument({ docName: CERT, bytes: await sample(CERT) }, { model }).catch((e) => e);
    expect(error).toBeInstanceOf(ExtractionFailedError);
    expect(error.message).toMatch(/25 words or fewer/);
    expect(error.message).toMatch(/page must be between 1 and 2/);
    expect(model.calls).toHaveLength(2);
  });

  it("rejects files that aren't PDFs or are over 10 MB, before calling the model", async () => {
    const model = fakeModel([]);
    await expect(
      extractDocument({ docName: "notes.txt", bytes: new TextEncoder().encode("hello") }, { model }),
    ).rejects.toBeInstanceOf(InvalidDocumentError);
    const big = new Uint8Array(10 * 1024 * 1024 + 1);
    big.set(new TextEncoder().encode("%PDF-"));
    await expect(extractDocument({ docName: "big.pdf", bytes: big }, { model })).rejects.toThrow(/larger than 10 MB/);
    expect(model.calls).toHaveLength(0);
  });
});
