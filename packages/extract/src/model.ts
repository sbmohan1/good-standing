import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { ModelExtractionSchema } from "./schema.ts";

/**
 * The only place Good Standing talks to an LLM. Claude reads the PDF and transcribes facts with
 * citations; it never computes amounts or deadlines (that's packages/core).
 */

export const DEFAULT_MODEL = "claude-sonnet-5-5";

export interface ModelRequest {
  docName: string;
  pdfBase64: string;
  /** Set on the single retry after a validation failure. Contains schema errors only, never document text. */
  retryFeedback?: string;
}

/** Returns the model's JSON answer (unvalidated), or null if it produced nothing parseable. */
export type ExtractionModel = (request: ModelRequest) => Promise<unknown>;

export class ExtractionRefusedError extends Error {
  override name = "ExtractionRefusedError";
}

export const SYSTEM_PROMPT = `You read US company formation documents (certificates of incorporation, stock purchase agreements, 83(b) election confirmations, SAFEs) and transcribe facts for a compliance tool. A founder will review everything you return.

Rules:
- Only report a value that is explicitly written in the document. Never infer, estimate, calculate or assume. If a field is not stated, return null for it.
- For every value, give the 1-indexed PDF page it appears on and a verbatim quote of 25 words or fewer, copied exactly from that page, that contains the value as written. Copy words, numbers and punctuation exactly; do not paraphrase or join text from different places.
- Numbers: transcribe exactly as written ("10,000,000" → 10000000, "$0.00001" → 0.00001). Never add, multiply or total anything.
- Dates: return the value as YYYY-MM-DD, transcribed from the date written in your quote.
- entityType: "c_corp" for a certificate of incorporation of a corporation; "llc" for a certificate of formation of a limited liability company. Use the quote that shows it (for example the clause naming the corporation).
- shareClasses: one entry per class of stock the document authorizes, with authorized shares and par value per share. parValue is null only if the document says the stock has no par value.
- incorporationDate: the date the certificate was filed with the State of Delaware, only if the document states it.
- stockPurchaseShares: only in a stock purchase agreement; the purchaser's name and the number of shares purchased. stockPurchaseDate: the date of that agreement.
- election83b: only in an IRS 83(b) election or its confirmation; irsStamped is true only if the document shows an IRS received or filed stamp.
- safe: only in a SAFE; the investor, the purchase amount, "post_money_cap" if it has a post-money valuation cap otherwise "discount", and its date.
- confidence: "high" when stated plainly, "medium" when the wording is ambiguous, "low" when unsure.
- Ignore watermarks, page headers and footers.`;

export function anthropicExtractionModel(options: { client?: Anthropic; model?: string } = {}): ExtractionModel {
  const client = options.client ?? new Anthropic();
  const model = options.model ?? process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL;

  return async ({ docName, pdfBase64, retryFeedback }) => {
    const instructions = retryFeedback
      ? `Extract the facts from "${docName}". Your previous answer failed validation:\n${retryFeedback}\nReturn a corrected answer.`
      : `Extract the facts from "${docName}".`;

    const response = await client.beta.messages.parse({
      model,
      max_tokens: 16000,
      // Server-side refusal fallback: if the model declines, the API re-runs on a fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } },
            { type: "text", text: instructions },
          ],
        },
      ],
      output_config: { effort: "medium", format: betaZodOutputFormat(ModelExtractionSchema) },
    });

    if (response.stop_reason === "refusal") {
      throw new ExtractionRefusedError(`The model declined to read ${docName}.`);
    }
    return response.parsed_output ?? null;
  };
}
