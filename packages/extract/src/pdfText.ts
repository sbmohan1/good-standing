import { extractText, getDocumentProxy } from "unpdf";

export const MAX_PDF_BYTES = 10 * 1024 * 1024;

export class InvalidDocumentError extends Error {
  override name = "InvalidDocumentError";
}

/** Rejects anything that isn't a PDF of at most 10 MB. Never echoes document content in errors. */
export function assertValidPdf(bytes: Uint8Array, docName: string): void {
  if (bytes.byteLength > MAX_PDF_BYTES) {
    throw new InvalidDocumentError(`${docName} is larger than 10 MB.`);
  }
  const header = new TextDecoder().decode(bytes.subarray(0, 5));
  if (header !== "%PDF-") {
    throw new InvalidDocumentError(`${docName} is not a PDF.`);
  }
}

/** Text of each page, 1-indexed by array position + 1. Used only to verify quotes, never sent anywhere. */
export async function readPdfPages(bytes: Uint8Array): Promise<string[]> {
  // unpdf/pdf.js may detach the buffer it is given, so hand it a copy.
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: false });
  return text;
}
