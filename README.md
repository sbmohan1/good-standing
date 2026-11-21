# Good Standing

> Built for Stripe Atlas founders. Not affiliated with Stripe.
> **Information, not tax or legal advice.**

Atlas forms your company in a day. Staying in good standing is on you.

Good Standing is an AI agent that reads your formation documents, builds a structured
record of your company, and tells you what you owe, when it's due, and why it applies, with
every number traced back to its source. It prepares filings, and you file them yourself.

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
| `packages/mcp` | MCP server for Claude Code, Claude Desktop and Cursor. _(Phase 3)_ |
| `apps/web` | One-page demo (Next.js). _(Phase 5)_ |

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

## How extraction stays honest

1. **Claude transcribes.** Each PDF goes to Claude (`ANTHROPIC_MODEL`, default `claude-sonnet-5-5`) as a document block. The answer is constrained by a structured-output schema and must give a page number and a verbatim quote of 25 words or fewer for every field.
2. **Zod validates.** A stricter schema checks real dates, quote length and page range. One retry is allowed, and it's sent only the validation errors.
3. **The PDF checks the quote.** `unpdf` pulls the PDF's own text. The quote must appear on the cited page, and the extracted number or date must appear inside the quote. Anything that fails is set to low confidence and listed for the founder.
4. **The founder confirms.** Extracted facts are always `needs_confirmation`, so the franchise tax engine refuses to run until the founder confirms them. Residency, gross assets, states of operation and contractor payments come from questions, never documents.
5. **Code does the math.** Sums such as issued shares across several stock purchase agreements, and percentages such as founder ownership hints, are computed in TypeScript, never by the model.

Documents are processed in memory. Their contents are never written to disk or logged. Requests use the API's server-side refusal fallback (`fallbacks: "default"`).

## Install the MCP server

_TODO (Phase 3)._

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
- **Weekend due dates.** Dates are shown as stated (e.g. 1099-NEC on Jan 31, 2027, a Sunday) with a note that the IRS accepts the next business day. Delaware dates aren't adjusted.
- **As-of dates** record when each value was encoded from the sources listed in BRIEF §6. They aren't independent legal review.
- **Out of scope:** prorated franchise tax after mid-year share amendments, Large Corporate Filer math, and state taxes outside Delaware. These are detected and flagged, not calculated.
