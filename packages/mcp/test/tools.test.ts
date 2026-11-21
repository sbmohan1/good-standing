import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CERT, fakeModel, GOLDEN, SPA } from "../../extract/test/helpers.ts";
import { memoryRecordStore } from "../src/store.ts";
import {
  complianceCalendar,
  explain,
  firstThirtyDays,
  franchiseTaxEstimate,
  getCompanyRecord,
  ingestDocuments,
  loadDemoCompany,
  prepareFilingPacket,
  setCompanyFacts,
  type ToolDeps,
} from "../src/tools.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const samples = path.resolve(here, "../../extract/samples");

function deps(overrides: Partial<ToolDeps> = {}): ToolDeps & { written: Record<string, string> } {
  const written: Record<string, string> = {};
  return {
    store: memoryRecordStore(),
    extractionModel: () => fakeModel((docName) => GOLDEN[docName]),
    today: () => "2026-11-21",
    now: () => "2026-11-21T10:00:00.000Z",
    cwd: samples,
    packetDir: "/packets",
    writeFile: async (file, text) => {
      written[file] = text;
    },
    written,
    ...overrides,
  };
}

const DEMO_HEADLINE =
  "Delaware's default math says $85,165. Under the Assumed Par Value method you owe $450 ($400 tax + $50 annual report fee). File by Mar 1, 2027.";
const DEMO_5472 =
  "Since you're a non-US founder owning 100% (25% or more), Form 5472 likely applies too; missing it costs $25,000 per form, per year.";

describe("demo company", () => {
  it("answers 'what does my company owe this year?' with the demo moment", async () => {
    const d = deps();
    await loadDemoCompany(d, {});
    const { text } = await complianceCalendar(d, {});
    expect(text).toContain("What you owe for tax year 2026");
    expect(text).toContain(DEMO_HEADLINE);
    expect(text).toContain(DEMO_5472);
    expect(text).toMatch(/Jan 31, 2027: Form 1099-NEC/);
    expect(text).toMatch(/~Feb 10, 2027: Registered agent renewal.*\$100/);
    expect(text).toMatch(/Apr 15, 2027: Federal corporate income tax return/);
    expect(text).toMatch(/Beneficial ownership information \(BOI\) report\*\*: Not required/);
  });

  it("won't overwrite an existing record without being asked", async () => {
    const d = deps();
    await loadDemoCompany(d, {});
    const again = await loadDemoCompany(d, {});
    expect(again.isError).toBe(true);
    expect((await loadDemoCompany(d, { overwrite: true })).isError).toBeFalsy();
  });

  it("prepares the packet and saves a copy", async () => {
    const d = deps();
    await loadDemoCompany(d, {});
    const { text } = await prepareFilingPacket(d, {});
    expect(text).toContain("$450");
    expect(text).toMatch(/You file this yourself/);
    expect(Object.keys(d.written)).toEqual(["/packets/lumen-labs-inc-delaware-annual-report-2026.md"]);
  });

  it("runs the first 30 days check", async () => {
    const d = deps();
    await loadDemoCompany(d, {});
    const { text } = await firstThirtyDays(d);
    expect(text).toMatch(/284 days old/);
    expect(text).toMatch(/✅ \*\*83\(b\) election confirmation\*\*/);
    expect(text).toMatch(/not a card invoice/);
  });
});

describe("founder flow from real documents (fake model)", () => {
  it("ingest → refuse to estimate → confirm and answer → demo moment", async () => {
    const d = deps();

    const ingested = await ingestDocuments(d, { paths: [CERT, SPA] });
    expect(ingested.isError).toBeFalsy();
    expect(ingested.text).toMatch(/shareClasses.*p\.1: "authorized to issue is 10,000,000 shares/);
    expect(ingested.text).toMatch(/quote verified/);
    expect(ingested.text).toMatch(/Priya Raman \(8,000,000 shares, 100%/);
    expect(ingested.text).toMatch(/processed in memory and not stored/);

    const refused = await franchiseTaxEstimate(d, {});
    expect(refused.text).toMatch(/not estimated yet/);
    expect(refused.text).not.toMatch(/\$450/);

    const updated = await setCompanyFacts(d, {
      confirm: ["entityType", "legalName", "delawareFileNumber", "incorporationDate", "shareClasses", "issuedShares", "founderStockIssueDate"],
      facts: {
        grossAssets: 50_000,
        founders: [{ name: "Priya Raman", ownershipPct: 100, usTaxResident: false }],
        contractorPaymentsByPayee: [{ payee: "Design contractor", totalPaidThisYear: 3_500 }],
        statesWithOperations: [],
        atlasCompany: true,
        registeredAgent: { provider: "atlas", renewalDate: null },
        has83bConfirmation: true,
        amendedAuthorizedSharesThisYear: false,
      },
    });
    expect(updated.text).toMatch(/Ready: everything the franchise tax estimate needs is confirmed/);
    expect(updated.text).toMatch(/Authorized shares: confirmed .* \(keeps its document citation\)/);

    const record = await d.store.load();
    expect(record.issuedShares).toMatchObject({ status: "confirmed", provenance: { kind: "document", page: 1 } });
    expect(record.grossAssets).toMatchObject({ status: "confirmed", provenance: { kind: "user" } });
    expect(record.foreignOwnershipPct.value).toBe(100);

    const { text } = await complianceCalendar(d, {});
    expect(text).toContain(DEMO_HEADLINE);
    expect(text).toContain(DEMO_5472);

    const estimate = await franchiseTaxEstimate(d, {});
    expect(estimate.text).toMatch(/Issued shares \(incl\. treasury\): 8,000,000 \(Lumen Labs - Stock Purchase Agreement \(SAMPLE\)\.pdf, p\.1: "/);
    expect(estimate.text).toMatch(/Gross assets .*: \$50,000 \(founder answer\)/);
  });

  it("reports unreadable files without failing the others", async () => {
    const d = deps();
    const result = await ingestDocuments(d, { paths: [CERT, "missing.pdf"] });
    expect(result.isError).toBeFalsy();
    expect(result.text).toMatch(/Couldn't read[\s\S]*missing\.pdf/);
  });

  it("won't confirm a field that has no value", async () => {
    const result = await setCompanyFacts(deps(), { confirm: ["grossAssets"] });
    expect(result.text).toMatch(/Gross assets has no value to confirm/);
    expect(result.text).not.toMatch(/Ready:/);
  });

  it("points a new user at ingest or the demo", async () => {
    const { text } = await getCompanyRecord(deps());
    expect(text).toMatch(/ingest_documents/);
    expect(text).toMatch(/load_demo_company/);
    expect(text).toMatch(/Gross assets: What were total assets/);
  });
});

describe("explain", () => {
  it("grounds a franchise tax question in the rule and the record", async () => {
    const d = deps();
    await loadDemoCompany(d, {});
    const { text } = await explain(d, { question: "Why is my Delaware notice $85,165 when I only owe $450?" });
    expect(text).toMatch(/using \*\*only\*\* the material below/);
    expect(text).toMatch(/Delaware franchise tax \+ annual report/);
    expect(text).toMatch(/Assumed Par Value Capital method: \$400/);
    expect(text).toMatch(/https:\/\/corp\.delaware\.gov\/frtaxcalc\//);
  });

  it("says 'I don't know, ask a tax professional' when out of scope", async () => {
    const { text } = await explain(deps(), { question: "Can I deduct my home office?" });
    expect(text).toMatch(/I don't know\. Please ask a tax professional\./);
  });
});

describe("samples exist", () => {
  it("has the synthetic PDFs", async () => {
    expect((await readFile(path.join(samples, CERT))).byteLength).toBeGreaterThan(1000);
  });
});
