#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { anthropicExtractionModel, type ExtractionModel } from "@good-standing/extract";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { createServer } from "./server.ts";
import { defaultStoreDir, fileRecordStore } from "./store.ts";

/** Local calendar date, or GOOD_STANDING_TODAY (YYYY-MM-DD) to pin it for demos. */
function today(): string {
  const pinned = process.env.GOOD_STANDING_TODAY;
  if (pinned && /^\d{4}-\d{2}-\d{2}$/.test(pinned)) return pinned;
  return new Date().toLocaleDateString("en-CA");
}

async function main(): Promise<void> {
  const storeDir = defaultStoreDir();
  let model: ExtractionModel | undefined;

  const server = createServer({
    store: fileRecordStore(storeDir),
    extractionModel: () => (model ??= anthropicExtractionModel()),
    today,
    now: () => new Date().toISOString(),
    cwd: process.cwd(),
    packetDir: path.join(storeDir, "packets"),
    writeFile: async (file, text) => {
      await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
      await writeFile(file, text, { mode: 0o600 });
    },
  });

  // stdout carries the MCP protocol; anything else goes to stderr.
  await server.connect(new StdioServerTransport());
}

main().catch((error: unknown) => {
  console.error("good-standing: failed to start:", error instanceof Error ? error.message : error);
  process.exit(1);
});
