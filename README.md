# Good Standing

> Built for Stripe Atlas founders. Not affiliated with Stripe.
> **Information, not tax or legal advice.**

Atlas forms your company in a day. Staying in good standing is on you.

Good Standing is an AI agent that reads your formation documents, builds a structured
record of your company, and tells you what you owe, when it's due, and why it applies, with
every number traced back to its source. It prepares filings, and you file them yourself.

**Live demo:** https://good-standing-delta.vercel.app ([open the demo company](https://good-standing-delta.vercel.app/?demo=1))

_Status: work in progress. See [BRIEF.md](./BRIEF.md) for the full spec._

## What it does

- **Compliance calendar:** which obligations apply, when they're due, what they cost, the penalty if missed, and why.
- **Delaware franchise tax estimate:** both methods with full workings, so a scary $85,165 notice becomes the $450 you actually owe.
- **Filing packet:** pre-filled fields and a checklist you review and file.
- **First 30 days check** for newly formed companies.

## Guardrails

1. The LLM never does arithmetic or sets dates. All money and date math is deterministic, unit-tested TypeScript.
2. Every number shows where it came from: a document page and quote, a founder answer, a Stripe API field, or a rule's official source and as-of date.
3. Read-only. No money movement, no filing, no writes to Stripe.
4. Never guess. Missing or low-confidence facts are `needs_confirmation`, and estimates refuse to run until the founder confirms them.
5. Privacy. Uploads are processed in memory and the MCP record stays in a local file you control.

## Repository layout

| Path | What |
| --- | --- |
| `packages/core` | Schema, rules registry, franchise tax engine, calendar builder. Pure functions, fully tested. |
| `packages/extract` | PDF → `CompanyRecord` extraction with Claude, with every quote verified against the PDF's own text. |
| `packages/mcp` | MCP server for Claude Code, Claude Desktop and Cursor (stdio). |
| `apps/web` | One-page demo (Next.js on Vercel). Core runs in the browser; only PDF extraction hits the server. |

## Develop

```bash
pnpm install
pnpm test        # Vitest across all packages
pnpm lint
pnpm typecheck
```

Requires Node 22.18+ (TypeScript runs natively, with no build step) and pnpm. Copy `.env.example` to `.env` for extraction and the optional Stripe hints.

```bash
pnpm --filter @good-standing/extract samples   # regenerate the synthetic Lumen Labs PDFs
pnpm --filter @good-standing/extract eval      # live extraction eval (calls the Anthropic API; a few cents)
```

## Web demo

```bash
pnpm --filter @good-standing/web dev     # http://localhost:3000, reads ANTHROPIC_API_KEY from the environment
```

- `/?demo=1` opens the fictional Lumen Labs company with its document facts awaiting confirmation. `/?demo=confirmed` skips the review.
- The demo company, review, estimate, calendar and packet all run in the browser with `@good-standing/core`. Nothing about them is sent anywhere.
- `POST /api/extract` takes up to 4 PDFs (4 MB in total), reads them in memory, sends them to the Anthropic API and returns the record. Nothing is written to disk, and file contents are never logged.
- Deploy: a Vercel project with root directory `apps/web` and `ANTHROPIC_API_KEY` set. Optional: `ANTHROPIC_MODEL`, and `NEXT_PUBLIC_REPO_URL` for the GitHub link.
- The liquid-chrome background is an original WebGL shader (`apps/web/components/LiquidChrome.tsx`). It renders at reduced resolution, pauses in hidden tabs and holds a still frame for `prefers-reduced-motion`.

## How extraction stays honest

1. **Claude transcribes.** Each PDF goes to Claude (`ANTHROPIC_MODEL`, default `claude-sonnet-5-5`) as a document block. The answer is constrained by a structured-output schema and must give a page number and a verbatim quote of 25 words or fewer for every field.
2. **Zod validates.** A stricter schema checks real dates, quote length and page range. One retry is allowed, and it's sent only the validation errors.
3. **The PDF checks the quote.** `unpdf` pulls the PDF's own text. The quote must appear on the cited page, and the extracted number or date must appear inside the quote. Anything that fails is set to low confidence and listed for the founder.
4. **The founder confirms.** Extracted facts are always `needs_confirmation`, so the franchise tax engine refuses to run until the founder confirms them. Residency, gross assets, states of operation and contractor payments come from questions, never documents.
5. **Code does the math.** Sums such as issued shares across several stock purchase agreements, and percentages such as founder ownership hints, are computed in TypeScript, never by the model.

Documents are processed in memory. Their contents are never written to disk or logged. Requests use the API's server-side refusal fallback (`fallbacks: "default"`).

## Install the MCP server

You need Node 22.18+ and pnpm. The server runs straight from TypeScript source, with no build step.

```bash
git clone <this repo> good-standing && cd good-standing
pnpm install
cp .env.example .env    # add ANTHROPIC_API_KEY; only needed for ingest_documents
```

### Claude Code

This repo ships a project `.mcp.json`, so open Claude Code in the repo and approve the `good-standing` server. To use it from another project, add this to that project's `.mcp.json`:

```json
{
  "mcpServers": {
    "good-standing": {
      "command": "node",
      "args": ["--env-file-if-exists=/ABSOLUTE/PATH/good-standing/.env", "/ABSOLUTE/PATH/good-standing/packages/mcp/src/index.ts"]
    }
  }
}
```

The record is written to `./.good-standing/record.json` in the directory Claude Code runs from.

### Claude Desktop

Add this to `claude_desktop_config.json` (Settings → Developer → Edit Config). Use absolute paths, including the output of `which node`, because Desktop doesn't start in your project folder:

```json
{
  "mcpServers": {
    "good-standing": {
      "command": "/ABSOLUTE/PATH/TO/node",
      "args": ["--env-file-if-exists=/ABSOLUTE/PATH/good-standing/.env", "/ABSOLUTE/PATH/good-standing/packages/mcp/src/index.ts"],
      "env": { "GOOD_STANDING_HOME": "/ABSOLUTE/PATH/where/you/keep/the/record" }
    }
  }
}
```

### Try it

1. "Load the demo company", or "Ingest my Certificate of Incorporation at ~/Documents/coi.pdf".
2. Answer the questions it asks, and confirm the extracted values.
3. "What does my company owe this year?"

### Tools

| Tool | What it does |
| --- | --- |
| `ingest_documents` | Extract facts from formation PDFs, each with a page, a verified quote and a needs-confirmation status. |
| `get_company_record` | The record, with each field's status and source, plus open questions. |
| `set_company_facts` | Record founder answers and corrections, or confirm extracted values as-is (the document citation is kept). |
| `load_demo_company` | Load the fictional Lumen Labs record so you can try it without documents. |
| `compliance_calendar` | "What do I owe?": a headline, then applies / may apply / not required, with dates, amounts, penalties, reasons and sources. |
| `franchise_tax_estimate` | Both Delaware methods with full workings, the notice-vs-actual gap and installments. Refuses until its inputs are confirmed. |
| `prepare_filing_packet` | A Markdown packet for the Delaware annual report, saved to `.good-standing/packets/`. |
| `first_30_days_check` | EIN, 83(b), bank account, how investor money should arrive, backup payment method, registered agent date. |
| `explain` | Grounds an answer in the rules registry and the record, or says "I don't know, ask a tax professional." |
| `fetch_stripe_hints` | Optional. Reads your Stripe balance (and Treasury cash) with a read-only agent key, as a gross-assets hint to confirm against your balance sheet. Never writes to the record or to Stripe. |

### Optional: Stripe hints

Create a **restricted key with the Agent tag** in the Stripe Dashboard. Give it read-only permissions: Balance: Read, plus Treasury financial accounts: Read if you use Treasury. Then set `STRIPE_AGENT_KEY=rk_...` in `.env`. Full-access secret keys (`sk_...`) are refused, because Stripe's MCP stops accepting them, along with untagged restricted keys, in December 2026. `pnpm --filter @good-standing/mcp stripe:check` runs the live check.

`GOOD_STANDING_TODAY=YYYY-MM-DD` pins the date, which is useful when recording a demo.

## Rules and sources

_TODO (Phase 6): table of every rule with its source URL and as-of date._

## Known gaps

Collected from `TODO(verify)` markers in `packages/core/src`. Each one is also surfaced to users as the rule's `verifyNote`.

- **Delaware annual report fee.** The engine uses $50, but HB 400 changed several Delaware fees from Aug 1, 2026. Re-check the current corporate annual report fee.
- **Rules drift: Delaware LLC tax.** HB 400 raised it from $300 to $400 starting with tax year 2026, but Atlas's tax-season guide still says $300. Good Standing uses $400.
- **Registered agent renewal date.** Assumed to be the incorporation anniversary. Founders confirm the exact date in the Atlas Dashboard.
- **Form 1120 for non-calendar fiscal years.** The 15th-day-of-the-4th-month rule is applied to every fiscal year end. June 30 year ends historically differed.
- **No-par stock.** The Assumed Par Value method isn't attempted when any class is no-par, including mixed par/no-par structures.
- **83(b) source.** No primary IRS source is cited yet for the 30-day window.
- **Composite fields are partly verified.** Only the key number is checked inside the quote: authorized shares and par for share classes, the amount for SAFEs. A SAFE's date and investor name, and the purchaser's name, are checked only through the quote match.
- **Founder stock issue date** is taken from the stock purchase agreement's date. The founder confirms that the shares were issued that day.
- **Agent tag can't be checked locally.** Good Standing refuses `sk_` keys and requires `rk_` keys, but it can't see whether a restricted key carries the Agent tag or is limited to read permissions. Stripe enforces that.
- **Stripe hints are USD only.** Other currencies are listed but not converted.
- **Atlas Dashboard link.** `https://dashboard.stripe.com/atlas` couldn't be confirmed because it sits behind a Stripe login.
- **Weekend due dates.** Dates are shown as stated (e.g. 1099-NEC on Jan 31, 2027, a Sunday) with a note that the IRS accepts the next business day. Delaware dates aren't adjusted.
- **As-of dates** record when each value was encoded from the sources listed in BRIEF §6. They aren't independent legal review.
- **Web upload limit is 4 MB, not 10 MB.** Vercel Functions cap request bodies at 4.5 MB. The MCP server still accepts 10 MB files. Larger uploads would need direct-to-storage uploads, which would break the "never stored" promise.
- **Web rate limit is best effort.** 6 extractions per IP per 10 minutes, counted in each function instance's memory. It isn't a global quota.
- **Web demo record lives in the page.** Refreshing the page loses edits. Nothing is saved server-side by design.
- **Out of scope:** prorated franchise tax after mid-year share amendments, Large Corporate Filer math, and state taxes outside Delaware. These are detected and flagged, not calculated.
