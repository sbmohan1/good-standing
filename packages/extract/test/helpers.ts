import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtractionModel } from "../src/model.ts";
import type { ModelExtraction, NoticeExtraction } from "../src/schema.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
export const CERT = "Lumen Labs - Certificate of Incorporation (SAMPLE).pdf";
export const SPA = "Lumen Labs - Stock Purchase Agreement (SAMPLE).pdf";
export const NOTICE = "Lumen Labs - Delaware Franchise Tax Notice (SAMPLE).pdf";

export async function sample(name: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(path.join(here, "../samples", name)));
}

const none = {
  legalName: null,
  entityType: null,
  delawareFileNumber: null,
  incorporationDate: null,
  shareClasses: null,
  stockPurchaseShares: null,
  stockPurchaseDate: null,
  safe: null,
  election83b: null,
} satisfies Omit<ModelExtraction, "documentType">;

/** What a correct model answer looks like for each sample document. */
export const GOLDEN: Record<string, ModelExtraction> = {
  [CERT]: {
    ...none,
    documentType: "certificate_of_incorporation",
    legalName: { value: "Lumen Labs, Inc.", page: 1, quote: "The name of the corporation is Lumen Labs, Inc.", confidence: "high" },
    entityType: { value: "c_corp", page: 1, quote: "CERTIFICATE OF INCORPORATION OF LUMEN LABS, INC.", confidence: "high" },
    delawareFileNumber: { value: "SAMPLE-7654321", page: 1, quote: "Delaware File Number: SAMPLE-7654321", confidence: "high" },
    incorporationDate: {
      value: "2026-02-10",
      page: 2,
      quote: "Filed with the Delaware Secretary of State on February 10, 2026.",
      confidence: "high",
    },
    shareClasses: {
      value: [{ name: "Common Stock", authorizedShares: 10_000_000, parValue: 0.00001 }],
      page: 1,
      // Spans a line break in the PDF text on purpose.
      quote: "authorized to issue is 10,000,000 shares of Common Stock, par value $0.00001 per share.",
      confidence: "high",
    },
  },
  [SPA]: {
    ...none,
    documentType: "stock_purchase_agreement",
    legalName: { value: "Lumen Labs, Inc.", page: 1, quote: "between Lumen Labs, Inc., a Delaware corporation", confidence: "high" },
    stockPurchaseShares: {
      value: { purchaser: "Priya Raman", shares: 8_000_000 },
      page: 1,
      quote: "the Purchaser shall purchase 8,000,000 shares of Common Stock of the Company",
      confidence: "high",
    },
    stockPurchaseDate: { value: "2026-02-12", page: 1, quote: "is dated as of February 12, 2026", confidence: "high" },
  },
  [NOTICE]: {
    ...none,
    documentType: "delaware_franchise_tax_notice",
    legalName: { value: "Lumen Labs, Inc.", page: 1, quote: "Corporation: LUMEN LABS, INC.", confidence: "high" },
    delawareFileNumber: { value: "SAMPLE-7654321", page: 1, quote: "Delaware File Number: SAMPLE-7654321", confidence: "high" },
  },
};

/** The second request for a notice: the amounts. */
export const GOLDEN_NOTICE: NoticeExtraction = {
  noticeTaxYear: { value: 2026, page: 1, quote: "Tax Year: 2026", confidence: "high" },
  noticeFranchiseTax: { value: 85_165, page: 1, quote: "Franchise Tax: $85,165.00", confidence: "high" },
  noticeTotalDue: { value: 85_215, page: 1, quote: "Total Due: $85,215.00", confidence: "high" },
};

/** Answers like a correct model: formation facts for "document" requests, amounts for "notice" requests. */
export function goldenAnswer(docName: string, kind: "document" | "notice"): unknown {
  return kind === "notice" ? GOLDEN_NOTICE : GOLDEN[docName];
}

export function fakeModel(
  answers: unknown[] | ((docName: string, kind: "document" | "notice") => unknown),
): ExtractionModel & { calls: Array<{ docName: string; kind: "document" | "notice"; retryFeedback?: string }> } {
  const calls: Array<{ docName: string; kind: "document" | "notice"; retryFeedback?: string }> = [];
  let i = 0;
  const model = (async ({ docName, kind, retryFeedback }) => {
    calls.push({ docName, kind, retryFeedback });
    return typeof answers === "function" ? answers(docName, kind) : answers[i++];
  }) as ExtractionModel & { calls: typeof calls };
  model.calls = calls;
  return model;
}
