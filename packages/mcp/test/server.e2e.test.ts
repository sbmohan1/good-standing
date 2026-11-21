import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const entry = path.resolve(here, "../src/index.ts");

function textOf(result: Awaited<ReturnType<Client["callTool"]>>): string {
  const content = (result as { content: Array<{ type: string; text?: string }> }).content;
  return content.map((c) => c.text ?? "").join("\n");
}

describe("MCP server over stdio", () => {
  let home: string;
  let client: Client;

  beforeAll(async () => {
    home = await mkdtemp(path.join(os.tmpdir(), "good-standing-"));
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [entry],
      env: { PATH: process.env.PATH ?? "", GOOD_STANDING_HOME: home, GOOD_STANDING_TODAY: "2026-11-21" },
      stderr: "pipe",
    });
    client = new Client({ name: "good-standing-test", version: "0.0.0" });
    await client.connect(transport);
  }, 30_000);

  afterAll(async () => {
    await client?.close();
    await rm(home, { recursive: true, force: true });
  });

  it("lists every tool with a description", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "compliance_calendar",
      "explain",
      "fetch_stripe_hints",
      "first_30_days_check",
      "franchise_tax_estimate",
      "get_company_record",
      "ingest_documents",
      "load_demo_company",
      "prepare_filing_packet",
      "set_company_facts",
    ]);
    for (const tool of tools) expect(tool.description?.length).toBeGreaterThan(40);
  });

  it("answers the demo question end to end and stores the record locally", async () => {
    await client.callTool({ name: "load_demo_company", arguments: {} });
    const text = textOf(await client.callTool({ name: "compliance_calendar", arguments: {} }));
    expect(text).toContain("Delaware's default math says $85,165. Under the Assumed Par Value method you owe $450");
    expect(text).toContain("Form 5472 likely applies too; missing it costs $25,000");
    expect(text).toMatch(/Information, not tax or legal advice\. Built for Stripe Atlas founders\. Not affiliated with Stripe\._$/);

    const stored = JSON.parse(await readFile(path.join(home, "record.json"), "utf8"));
    expect(stored.legalName.value).toBe("Lumen Labs, Inc.");
    expect(await readFile(path.join(home, ".gitignore"), "utf8")).toBe("*\n");
  });

  it("puts the disclaimer on errors too", async () => {
    const result = await client.callTool({ name: "load_demo_company", arguments: {} });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/Not affiliated with Stripe/);
  });
});
