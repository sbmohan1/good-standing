/**
 * Extraction eval: runs the real model against the synthetic Lumen Labs documents and checks the
 * values, page citations and quote verification. Calls the Anthropic API (costs a few cents).
 *
 * Run: pnpm --filter @good-standing/extract eval   (needs ANTHROPIC_API_KEY in .env)
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import type { CompanyRecordField } from "@good-standing/core";
import { buildRecord } from "../src/buildRecord.ts";
import { extractDocument } from "../src/extractDocument.ts";
import { anthropicExtractionModel, DEFAULT_MODEL } from "../src/model.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const CERT = "Lumen Labs - Certificate of Incorporation (SAMPLE).pdf";
const SPA = "Lumen Labs - Stock Purchase Agreement (SAMPLE).pdf";

interface Expectation {
  field: CompanyRecordField;
  value: unknown;
  doc: string;
  page: number;
}

const EXPECTED: Expectation[] = [
  { field: "legalName", value: "Lumen Labs, Inc.", doc: CERT, page: 1 },
  { field: "entityType", value: "c_corp", doc: CERT, page: 1 },
  { field: "delawareFileNumber", value: "SAMPLE-7654321", doc: CERT, page: 1 },
  { field: "incorporationDate", value: "2026-02-10", doc: CERT, page: 2 },
  { field: "issuedShares", value: 8_000_000, doc: SPA, page: 1 },
  { field: "founderStockIssueDate", value: "2026-02-12", doc: SPA, page: 1 },
];

async function main(): Promise<number> {
  const model = anthropicExtractionModel();
  const started = Date.now();
  const docs = await Promise.all(
    [CERT, SPA].map(async (docName) => {
      const bytes = new Uint8Array(await readFile(path.join(here, "../samples", docName)));
      return extractDocument({ docName, bytes }, { model });
    }),
  );
  const { record, unverifiedFields, conflicts } = buildRecord(docs);

  const failures: string[] = [];
  const check = (ok: boolean, label: string) => {
    process.stdout.write(`${ok ? "PASS" : "FAIL"}  ${label}\n`);
    if (!ok) failures.push(label);
  };

  process.stdout.write(`Model: ${process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL}\n\n`);
  for (const e of EXPECTED) {
    const fact = record[e.field];
    const p = fact.provenance;
    const cited = p?.kind === "document" ? `${p.docName === CERT ? "certificate" : "SPA"} p.${p.page}: "${p.quote}"` : "no citation";
    check(isDeepStrictEqual(fact.value, e.value), `${e.field} = ${JSON.stringify(fact.value)}  (${cited})`);
    check(p?.kind === "document" && p.docName === e.doc && p.page === e.page, `${e.field} cites ${e.doc === CERT ? "certificate" : "SPA"} p.${e.page}`);
  }

  const classes = record.shareClasses.value ?? [];
  check(
    classes.length === 1 && classes[0]?.authorizedShares === 10_000_000 && classes[0]?.parValue === 0.00001,
    `shareClasses = ${JSON.stringify(classes)}`,
  );
  const cp = record.shareClasses.provenance;
  check(cp?.kind === "document" && cp.docName === CERT && cp.page === 1, "shareClasses cites certificate p.1");

  check(unverifiedFields.length === 0, `every quote verified against the PDF text${unverifiedFields.length ? ` (unverified: ${unverifiedFields.join(", ")})` : ""}`);
  check(conflicts.length === 0, `no conflicts between documents${conflicts.length ? `: ${conflicts.join("; ")}` : ""}`);
  check(record.grossAssets.status === "missing" && record.founders.status === "missing", "gross assets and founder residency left for questions");

  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  process.stdout.write(`\n${failures.length === 0 ? "All checks passed" : `${failures.length} check(s) failed`} in ${seconds}s.\n`);
  return failures.length === 0 ? 0 : 1;
}

process.exitCode = await main();
