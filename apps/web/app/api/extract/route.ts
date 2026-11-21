import {
  anthropicExtractionModel,
  buildRecord,
  type DocumentExtraction,
  extractDocument,
  InvalidDocumentError,
} from "@good-standing/extract";
import { clientIp, rateLimit } from "../../../lib/rateLimit";

/**
 * Extracts facts from uploaded formation PDFs. Files are read into memory, sent to the Anthropic
 * API, and dropped when the request ends: nothing is written to disk or a database, and no file
 * contents or keys are logged.
 */
export const maxDuration = 60;

// Vercel Functions accept request bodies up to 4.5 MB, so the deployed limit is 4 MB per request.
const MAX_REQUEST_BYTES = 4 * 1024 * 1024;
const MAX_FILES = 4;

function error(status: number, message: string, headers?: HeadersInit) {
  return Response.json({ error: message }, { status, headers });
}

export async function POST(request: Request) {
  const limit = rateLimit(clientIp(request.headers));
  if (!limit.ok) {
    return error(429, `Too many uploads. Try again in ${Math.ceil(limit.retryAfterSeconds / 60)} minutes, or use the demo company.`, {
      "Retry-After": String(limit.retryAfterSeconds),
    });
  }
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_REQUEST_BYTES) return error(413, "Uploads are limited to 4 MB in total on this demo.");
  if (!process.env.ANTHROPIC_API_KEY) return error(503, "Document reading isn't configured on this deployment. Try the demo company.");

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return error(400, "Send the PDFs as multipart form data.");
  }
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) return error(400, "Choose at least one PDF.");
  if (files.length > MAX_FILES) return error(400, `Upload up to ${MAX_FILES} PDFs at a time.`);
  if (files.reduce((sum, f) => sum + f.size, 0) > MAX_REQUEST_BYTES) return error(413, "Uploads are limited to 4 MB in total on this demo.");

  const model = anthropicExtractionModel();
  const results = await Promise.allSettled(
    files.map(async (file) => extractDocument({ docName: file.name, bytes: new Uint8Array(await file.arrayBuffer()) }, { model })),
  );

  const docs: DocumentExtraction[] = [];
  const failures: string[] = [];
  results.forEach((result, i) => {
    const name = files[i]?.name ?? "file";
    if (result.status === "fulfilled") docs.push(result.value);
    else failures.push(`${name}: ${result.reason instanceof InvalidDocumentError ? result.reason.message : "couldn't be read. Try again or use another file."}`);
  });
  if (docs.length === 0) return error(422, failures.join(" "));

  const built = buildRecord(docs);
  return Response.json(
    {
      record: built.record,
      documents: docs.map((d) => ({
        docName: d.docName,
        documentType: d.documentType,
        totalPages: d.totalPages,
        fields: d.fields.map((f) => ({ name: f.name, page: f.page, verified: f.verified, issues: f.issues })),
      })),
      unverifiedFields: built.unverifiedFields,
      conflicts: built.conflicts,
      notes: built.notes,
      founderHints: built.founderHints,
      failures,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
