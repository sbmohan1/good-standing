import { z } from "zod";

/**
 * What we ask Claude to return for one document. Every field carries the page it came from and a
 * verbatim quote, so each value can be checked against the PDF's own text.
 *
 * Two schemas: a loose one sent as the structured-output format (kept to JSON-schema features the
 * API supports), and a strict one we validate against ourselves (dates, quote length, page range).
 */

const confidence = z.enum(["high", "medium", "low"]);

function cited<T extends z.ZodType>(value: T) {
  return z
    .object({ value, page: z.number().int(), quote: z.string(), confidence })
    .nullable();
}

const shareClass = z.object({
  name: z.string(),
  authorizedShares: z.number().int(),
  parValue: z.number().nullable(),
});

const stockPurchaseShares = z.object({
  purchaser: z.string(),
  shares: z.number().int(),
});

const safe = z.object({
  investor: z.string(),
  amount: z.number(),
  type: z.enum(["post_money_cap", "discount"]),
  date: z.string(),
});

const election83b = z.object({
  taxpayer: z.string(),
  irsStamped: z.boolean(),
});

export const DOCUMENT_TYPES = [
  "certificate_of_incorporation",
  "certificate_of_formation",
  "stock_purchase_agreement",
  "83b_confirmation",
  "safe",
  "delaware_franchise_tax_notice",
  "other",
] as const;

export const ModelExtractionSchema = z.object({
  documentType: z.enum(DOCUMENT_TYPES),
  legalName: cited(z.string()),
  entityType: cited(z.enum(["c_corp", "llc"])),
  delawareFileNumber: cited(z.string()),
  incorporationDate: cited(z.string()),
  shareClasses: cited(z.array(shareClass)),
  stockPurchaseShares: cited(stockPurchaseShares),
  stockPurchaseDate: cited(z.string()),
  safe: cited(safe),
  election83b: cited(election83b),
});
export type ModelExtraction = z.infer<typeof ModelExtractionSchema>;
export type DocumentFieldName = Exclude<keyof ModelExtraction, "documentType">;
export const EXTRACTED_FIELDS = Object.keys(ModelExtractionSchema.shape).filter(
  (k): k is DocumentFieldName => k !== "documentType",
);

/**
 * Delaware franchise tax notices get a second, small request with their own schema. Keeping these
 * fields out of the main schema keeps its structured-output grammar within the API's size limit.
 */
export const NoticeExtractionSchema = z.object({
  noticeTaxYear: cited(z.number().int()),
  noticeFranchiseTax: cited(z.number()),
  noticeTotalDue: cited(z.number()),
});
export type NoticeExtraction = z.infer<typeof NoticeExtractionSchema>;
export type NoticeFieldName = keyof NoticeExtraction;
export const NOTICE_FIELDS = Object.keys(NoticeExtractionSchema.shape) as NoticeFieldName[];

export type ExtractedFieldName = DocumentFieldName | NoticeFieldName;

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "dates must be YYYY-MM-DD")
  .refine((d) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().startsWith(d), "not a real calendar date");

const MAX_QUOTE_WORDS = 25;

/** Strict validation of the model's answer, given the document's page count. */
export function strictExtractionSchema(totalPages: number) {
  function strictCited<T extends z.ZodType>(value: T) {
    return z
      .object({
        value,
        page: z.number().int().min(1).max(totalPages, `page must be between 1 and ${totalPages}`),
        quote: z
          .string()
          .min(1)
          .refine((q) => q.trim().split(/\s+/).length <= MAX_QUOTE_WORDS, `quotes must be ${MAX_QUOTE_WORDS} words or fewer`),
        confidence,
      })
      .nullable();
  }
  return z.object({
    documentType: z.enum(DOCUMENT_TYPES),
    legalName: strictCited(z.string().min(1)),
    entityType: strictCited(z.enum(["c_corp", "llc"])),
    delawareFileNumber: strictCited(z.string().min(1)),
    incorporationDate: strictCited(isoDate),
    shareClasses: strictCited(
      z
        .array(
          z.object({
            name: z.string().min(1),
            authorizedShares: z.number().int().positive(),
            parValue: z.number().nonnegative().nullable(),
          }),
        )
        .min(1),
    ),
    stockPurchaseShares: strictCited(z.object({ purchaser: z.string().min(1), shares: z.number().int().positive() })),
    stockPurchaseDate: strictCited(isoDate),
    safe: strictCited(
      z.object({
        investor: z.string().min(1),
        amount: z.number().positive(),
        type: z.enum(["post_money_cap", "discount"]),
        date: isoDate,
      }),
    ),
    election83b: strictCited(z.object({ taxpayer: z.string().min(1), irsStamped: z.boolean() })),
  });
}

/** Strict validation of the notice answer. */
export function strictNoticeSchema(totalPages: number) {
  const strictCited = <T extends z.ZodType>(value: T) =>
    z
      .object({
        value,
        page: z.number().int().min(1).max(totalPages, `page must be between 1 and ${totalPages}`),
        quote: z
          .string()
          .min(1)
          .refine((q) => q.trim().split(/\s+/).length <= MAX_QUOTE_WORDS, `quotes must be ${MAX_QUOTE_WORDS} words or fewer`),
        confidence,
      })
      .nullable();
  return z.object({
    noticeTaxYear: strictCited(z.number().int().min(2000).max(2100)),
    noticeFranchiseTax: strictCited(z.number().nonnegative()),
    noticeTotalDue: strictCited(z.number().nonnegative()),
  });
}
