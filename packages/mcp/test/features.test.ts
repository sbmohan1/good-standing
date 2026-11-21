import path from "node:path";
import { fileURLToPath } from "node:url";
import { lumenLabsRecord, missing } from "@good-standing/core";
import { describe, expect, it } from "vitest";
import { fakeModel, goldenAnswer, NOTICE } from "../../extract/test/helpers.ts";
import { memoryRecordStore } from "../src/store.ts";
import {
  exportCalendarIcs,
  franchiseTaxScenario,
  grossAssetsWorksheet,
  ingestDocuments,
  loadDemoCompany,
  prepareAccountantSummary,
  type ToolDeps,
} from "../src/tools.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

function deps(): ToolDeps & { written: Record<string, string> } {
  const written: Record<string, string> = {};
  return {
    store: memoryRecordStore(),
    extractionModel: () => fakeModel(goldenAnswer),
    today: () => "2026-11-21",
    now: () => "2026-11-21T10:00:00.000Z",
    cwd: path.resolve(here, "../../extract/samples"),
    packetDir: "/packets",
    writeFile: async (file, text) => {
      written[file] = text;
    },
    written,
  };
}

describe("export_calendar_ics", () => {
  it("writes an .ics file with the demo company's deadlines", async () => {
    const d = deps();
    await loadDemoCompany(d, {});
    const result = await exportCalendarIcs(d, {});
    const file = "/packets/lumen-labs-inc-compliance-calendar-2026.ics";
    expect(result.text).toContain(`to ${file}`);
    expect(d.written[file]).toContain("DTSTART;VALUE=DATE:20270301");
  });
});

describe("gross_assets_worksheet", () => {
  it("lists the questions when called with no amounts", async () => {
    const result = await grossAssetsWorksheet(deps(), {});
    expect(result.text).toContain("Cash in bank accounts");
  });

  it("adds up the lines and saves only when asked", async () => {
    const d = deps();
    const preview = await grossAssetsWorksheet(d, { cash: "42,000", equipment: 8000 });
    expect(preview.text).toContain("$42,000 + $8,000 = $50,000");
    expect((await d.store.load()).grossAssets.status).toBe("missing");

    const saved = await grossAssetsWorksheet(d, { cash: "42,000", equipment: 8000, save: true });
    expect(saved.text).toContain("Saved gross assets = $50,000");
    const record = await d.store.load();
    expect(record.grossAssets).toMatchObject({ value: 50_000, status: "confirmed", provenance: { kind: "user", detail: expect.stringContaining("Cash in bank accounts $42,000") } });
  });

  it("rejects bad amounts", async () => {
    expect((await grossAssetsWorksheet(deps(), { cash: "lots" })).isError).toBe(true);
  });
});

describe("franchise_tax_scenario", () => {
  it("defaults to the record and recalculates with overrides", async () => {
    const d = deps();
    await loadDemoCompany(d, {});
    const base = await franchiseTaxScenario(d, {});
    expect(base.text).toContain("Authorized Shares method: $85,165");
    const fewer = await franchiseTaxScenario(d, { authorizedShares: 5000 });
    expect(fewer.text).toContain("Authorized Shares method: $175");
    expect(fewer.text).toContain("hypothetical");
    expect((await d.store.load()).shareClasses.value).toEqual(lumenLabsRecord.shareClasses.value);
  });

  it("asks for values the record doesn't have", async () => {
    const result = await franchiseTaxScenario(deps(), {});
    expect(result.isError).toBe(true);
    expect(result.text).toContain("authorizedShares");
  });
});

describe("prepare_accountant_summary", () => {
  it("writes the summary even for an incomplete record", async () => {
    const d = deps();
    await d.store.save({ ...lumenLabsRecord, grossAssets: missing() });
    const result = await prepareAccountantSummary(d, {});
    expect(result.text).toContain("Not calculated yet");
    expect(d.written["/packets/lumen-labs-inc-accountant-summary-2026.md"]).toContain("## Company facts");
  });
});

describe("ingesting a Delaware notice", () => {
  it("explains the notice against the confirmed record", async () => {
    const d = deps();
    await loadDemoCompany(d, {});
    const result = await ingestDocuments(d, { paths: [NOTICE] });
    expect(result.text).toContain("## Delaware franchise tax notice");
    expect(result.text).toContain("Your notice says $85,215 total due, including $85,165 franchise tax, for tax year 2026");
    expect(result.text).toContain("$84,765 less than the notice");
  });
});
