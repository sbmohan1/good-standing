/**
 * Live check for the Stripe hint: starts the real MCP server over stdio and calls
 * fetch_stripe_hints with the STRIPE_AGENT_KEY from .env. Read-only; prints the tool's output.
 *
 * Run: pnpm --filter @good-standing/mcp stripe:check
 */
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const here = path.dirname(fileURLToPath(import.meta.url));
const home = await mkdtemp(path.join(os.tmpdir(), "good-standing-stripe-"));
const client = new Client({ name: "good-standing-stripe-check", version: "0.0.0" });

try {
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [path.resolve(here, "../src/index.ts")],
      env: { PATH: process.env.PATH ?? "", GOOD_STANDING_HOME: home, STRIPE_AGENT_KEY: process.env.STRIPE_AGENT_KEY ?? "" },
      stderr: "inherit",
    }),
  );
  const result = (await client.callTool({ name: "fetch_stripe_hints", arguments: {} })) as {
    isError?: boolean;
    content: Array<{ text?: string }>;
  };
  process.stdout.write(`${result.content.map((c) => c.text ?? "").join("\n")}\n`);
  process.exitCode = result.isError ? 1 : 0;
} finally {
  await client.close();
  await rm(home, { recursive: true, force: true });
}
