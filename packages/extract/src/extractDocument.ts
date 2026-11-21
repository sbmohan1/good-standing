import type { z } from "zod";
import type { ExtractionModel } from "./model.ts";
import { assertValidPdf, readPdfPages } from "./pdfText.ts";
import { EXTRACTED_FIELDS, type ExtractedFieldName, NOTICE_FIELDS, strictExtractionSchema, strictNoticeSchema } from "./schema.ts";
import { checkQuote, type QuoteCheck, quoteContainsDate, quoteContainsNumber } from "./verify.ts";

export interface ExtractedField {
  name: ExtractedFieldName;
  value: unknown;
  page: number;
  quote: string;
  confidence: "high" | "medium" | "low";
  quoteCheck: QuoteCheck;
  /** Whether the number/date we extracted appears in the quote. "not_checked" for text fields. */
  valueCheck: "ok" | "mismatch" | "not_checked";
  verified: boolean;
  issues: string[];
}

export interface DocumentExtraction {
  docName: string;
  documentType: string;
  totalPages: number;
  fields: ExtractedField[];
}

export class ExtractionFailedError extends Error {
  override name = "ExtractionFailedError";
}

function formatIssues(error: z.ZodError): string {
  return error.issues.map((i) => `- ${i.path.join(".") || "(root)"}: ${i.message}`).join("\n");
}

/** Which numbers/dates in a field must appear in its quote. */
function valueCheck(name: ExtractedFieldName, value: unknown, quote: string): ExtractedField["valueCheck"] {
  switch (name) {
    case "incorporationDate":
    case "stockPurchaseDate":
      return quoteContainsDate(quote, value as string) ? "ok" : "mismatch";
    case "shareClasses": {
      const classes = value as Array<{ authorizedShares: number; parValue: number | null }>;
      const ok = classes.every(
        (c) => quoteContainsNumber(quote, c.authorizedShares) && (c.parValue === null || quoteContainsNumber(quote, c.parValue)),
      );
      return ok ? "ok" : "mismatch";
    }
    case "stockPurchaseShares":
      return quoteContainsNumber(quote, (value as { shares: number }).shares) ? "ok" : "mismatch";
    case "safe":
      return quoteContainsNumber(quote, (value as { amount: number }).amount) ? "ok" : "mismatch";
    case "noticeTaxYear":
    case "noticeFranchiseTax":
    case "noticeTotalDue":
      return quoteContainsNumber(quote, value as number) ? "ok" : "mismatch";
    default:
      return "not_checked";
  }
}

type CitedRaw = { value: unknown; page: number; quote: string; confidence: "high" | "medium" | "low" };

function verifyField(name: ExtractedFieldName, raw: CitedRaw, pages: string[]): ExtractedField {
  const quoteCheck = checkQuote(raw.quote, pages, raw.page);
  const vCheck = valueCheck(name, raw.value, raw.quote);
  const issues: string[] = [];
  if (quoteCheck.status === "wrong_page") issues.push(`Quote is on page ${quoteCheck.foundOnPage}, not page ${raw.page}.`);
  if (quoteCheck.status === "not_found") issues.push("Quote could not be found in the document text.");
  if (vCheck === "mismatch") issues.push("The extracted value doesn't appear in the quote.");
  const verified = quoteCheck.status === "verified" && vCheck !== "mismatch";
  return {
    name,
    value: raw.value,
    page: raw.page,
    quote: raw.quote,
    confidence: verified ? raw.confidence : "low",
    quoteCheck,
    valueCheck: vCheck,
    verified,
    issues,
  };
}

/**
 * Extract one PDF: validate it, ask the model for cited facts, validate the answer with Zod
 * (retrying once on failure), then verify every quote against the PDF's own text.
 * The document is processed in memory and never written or logged.
 */
export async function extractDocument(
  input: { docName: string; bytes: Uint8Array },
  options: { model: ExtractionModel },
): Promise<DocumentExtraction> {
  assertValidPdf(input.bytes, input.docName);
  const pages = await readPdfPages(input.bytes);
  const pdfBase64 = Buffer.from(input.bytes).toString("base64");

  const ask = async <S extends z.ZodType>(kind: "document" | "notice", schema: S): Promise<z.infer<S>> => {
    let feedback: string | undefined;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const raw = await options.model({ docName: input.docName, pdfBase64, kind, retryFeedback: feedback });
      const result = raw === null ? null : schema.safeParse(raw);
      if (result?.success) return result.data;
      feedback = result ? formatIssues(result.error) : "- No valid JSON was returned.";
    }
    throw new ExtractionFailedError(`Couldn't extract ${input.docName} after a retry:\n${feedback}`);
  };

  const result = await ask("document", strictExtractionSchema(pages.length));
  const fields = EXTRACTED_FIELDS.flatMap((name) => {
    const raw = result[name];
    return raw ? [verifyField(name, raw, pages)] : [];
  });

  // Notices get a second, small request for the amounts (see NoticeExtractionSchema).
  if (result.documentType === "delaware_franchise_tax_notice") {
    const amounts = await ask("notice", strictNoticeSchema(pages.length));
    for (const name of NOTICE_FIELDS) {
      const raw = amounts[name];
      if (raw) fields.push(verifyField(name, raw, pages));
    }
  }

  return { docName: input.docName, documentType: result.documentType, totalPages: pages.length, fields };
}
