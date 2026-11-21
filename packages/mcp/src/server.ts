import { McpServer } from "@modelcontextprotocol/server";
import type { z } from "zod";
import { withFooter } from "./render.ts";
import {
  complianceCalendar,
  explain,
  fetchStripeHintsTool,
  firstThirtyDays,
  franchiseTaxEstimate,
  getCompanyRecord,
  ingestDocuments,
  inputSchemas,
  loadDemoCompany,
  prepareFilingPacket,
  setCompanyFacts,
  type ToolDeps,
  type ToolResult,
} from "./tools.ts";

export const SERVER_INSTRUCTIONS = `Good Standing keeps a Stripe Atlas–formed company in good standing: compliance calendar, Delaware franchise tax, filing packets. Built for Stripe Atlas founders; not affiliated with Stripe. Information, not tax or legal advice.

How to use it:
1. Start with get_company_record. If there's no record, ask for the founder's Certificate of Incorporation and stock purchase agreement PDFs and call ingest_documents, or call load_demo_company to try the fictional demo.
2. Show the founder each extracted value with its page and quote. Record what they accept or correct with set_company_facts, and ask the listed questions (gross assets, founder residency, contractors, other states).
3. If the founder doesn't know gross assets, fetch_stripe_hints can show their Stripe balance as a starting hint; they must still give the Schedule L total assets.
4. For "what does my company owe?", call compliance_calendar and lead with its headline. Use franchise_tax_estimate for the full math and prepare_filing_packet for the filing packet.
5. Never compute amounts or dates yourself; use the numbers and dates the tools return, with their sources. For questions, call explain and answer only from what it returns.
6. Read-only: nothing here files, pays, or writes to Stripe. The founder files.
7. Keep the "Information, not tax or legal advice" footer in your answer.`;

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;
const LOCAL_WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

function respond(run: () => Promise<ToolResult>) {
  return async () => {
    try {
      const result = await run();
      return { content: [{ type: "text" as const, text: withFooter(result.text) }], isError: result.isError ?? false };
    } catch (error) {
      // Never include document contents or keys; messages come from our own errors or the SDKs.
      const message = error instanceof Error ? error.message : "Unexpected error";
      return { content: [{ type: "text" as const, text: withFooter(`Error: ${message}`) }], isError: true };
    }
  };
}

export function createServer(deps: ToolDeps): McpServer {
  const server = new McpServer({ name: "good-standing", version: "0.1.0" }, { instructions: SERVER_INSTRUCTIONS });

  server.registerTool(
    "ingest_documents",
    {
      title: "Ingest formation documents",
      description:
        "Read the founder's formation PDFs (Certificate of Incorporation, stock purchase agreements, 83(b) confirmation, SAFEs; ≤10 MB each) and add the facts to the company record. Every value comes back with its page, a verbatim quote, and whether the quote was verified against the PDF. Extracted values start as needs-confirmation. Sends the PDFs to the Anthropic API; they're processed in memory and not stored.",
      inputSchema: inputSchemas.ingestDocuments,
      annotations: { ...LOCAL_WRITE, openWorldHint: true },
    },
    async (input: z.infer<typeof inputSchemas.ingestDocuments>) => respond(() => ingestDocuments(deps, input))(),
  );

  server.registerTool(
    "get_company_record",
    {
      title: "Get company record",
      description: "Show the current company record: each field's value, status (confirmed / needs confirmation / missing) and source, plus the questions still open.",
      annotations: READ_ONLY,
    },
    async () => respond(() => getCompanyRecord(deps))(),
  );

  server.registerTool(
    "set_company_facts",
    {
      title: "Set or confirm company facts",
      description:
        "Record the founder's answers and corrections (`facts`), or confirm extracted values as-is (`confirm`). Only pass what the founder actually said; never guess a value. Facts become confirmed with the founder as the source.",
      inputSchema: inputSchemas.setCompanyFacts,
      annotations: LOCAL_WRITE,
    },
    async (input: z.infer<typeof inputSchemas.setCompanyFacts>) => respond(() => setCompanyFacts(deps, input))(),
  );

  server.registerTool(
    "load_demo_company",
    {
      title: "Load the demo company",
      description: "Load Lumen Labs, Inc., a fictional, fully confirmed demo company, so the founder can try Good Standing without uploading documents.",
      inputSchema: inputSchemas.loadDemoCompany,
      annotations: { ...LOCAL_WRITE, destructiveHint: true },
    },
    async (input: z.infer<typeof inputSchemas.loadDemoCompany>) => respond(() => loadDemoCompany(deps, input))(),
  );

  server.registerTool(
    "compliance_calendar",
    {
      title: "Compliance calendar: what do I owe?",
      description:
        "Answer \"what does my company owe this year?\". Returns a headline summary (Delaware franchise tax with both methods, Form 5472 risk, other deadlines), then what applies, what may apply and what's not required, each with due date, amount, penalty, the reason it applies and sources.",
      inputSchema: inputSchemas.taxYearOnly,
      annotations: READ_ONLY,
    },
    async (input: z.infer<typeof inputSchemas.taxYearOnly>) => respond(() => complianceCalendar(deps, input))(),
  );

  server.registerTool(
    "franchise_tax_estimate",
    {
      title: "Delaware franchise tax estimate",
      description:
        "Delaware franchise tax with both methods' step-by-step math (Authorized Shares and Assumed Par Value Capital), the lower amount, total with the annual report fee, the gap versus Delaware's default notice, and installments if due. Refuses until authorized shares, par value, issued shares and gross assets are confirmed.",
      inputSchema: inputSchemas.taxYearOnly,
      annotations: READ_ONLY,
    },
    async (input: z.infer<typeof inputSchemas.taxYearOnly>) => respond(() => franchiseTaxEstimate(deps, input))(),
  );

  server.registerTool(
    "prepare_filing_packet",
    {
      title: "Prepare the Delaware filing packet",
      description:
        "A Markdown packet for the Delaware annual report: pre-filled fields with sources, the tax calculation, a checklist, and links to Delaware's filing site and the Atlas Dashboard. Saves a copy next to the local record. The founder reviews and files it themselves.",
      inputSchema: inputSchemas.taxYearOnly,
      annotations: LOCAL_WRITE,
    },
    async (input: z.infer<typeof inputSchemas.taxYearOnly>) => respond(() => prepareFilingPacket(deps, input))(),
  );

  server.registerTool(
    "first_30_days_check",
    {
      title: "First 30 days check",
      description:
        "Checklist for a newly formed company: EIN, 83(b) confirmation, bank account, investor money by wire (not card invoice), backup payment method, registered agent renewal date.",
      annotations: READ_ONLY,
    },
    async () => respond(() => firstThirtyDays(deps))(),
  );

  server.registerTool(
    "explain",
    {
      title: "Explain a rule",
      description:
        "Ground an answer to the founder's compliance question in Good Standing's rules and their record. Returns only what the rules registry and record say, with sources; if nothing covers the question, tells you to say \"I don't know, ask a tax professional\".",
      inputSchema: inputSchemas.explain,
      annotations: READ_ONLY,
    },
    async (input: z.infer<typeof inputSchemas.explain>) => respond(() => explain(deps, input))(),
  );

  server.registerTool(
    "fetch_stripe_hints",
    {
      title: "Stripe balance hint (read-only)",
      description:
        "Optional. Read the Stripe balance (and Treasury cash, if the key allows) with a read-only Stripe agent key, as a hint for gross assets. Labeled as a hint to confirm against the balance sheet; never writes to the record or to Stripe.",
      annotations: { ...READ_ONLY, idempotentHint: false, openWorldHint: true },
    },
    async () => respond(() => fetchStripeHintsTool(deps))(),
  );

  return server;
}
