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
| `packages/extract` | PDF → `CompanyRecord` extraction with Claude, plus quote verification. _(Phase 2)_ |
| `packages/mcp` | MCP server for Claude Code, Claude Desktop and Cursor. _(Phase 3)_ |
| `apps/web` | One-page demo (Next.js). _(Phase 5)_ |

## Develop

```bash
pnpm install
pnpm test        # Vitest across all packages
pnpm lint
pnpm typecheck
```

Requires Node 22+ and pnpm. Copy `.env.example` to `.env` for extraction and the optional Stripe hints.

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
- **Weekend due dates.** Dates are shown as stated (e.g. 1099-NEC on Jan 31, 2027, a Sunday) with a note that the IRS accepts the next business day. Delaware dates aren't adjusted.
- **As-of dates** record when each value was encoded from the sources listed in BRIEF §6. They aren't independent legal review.
- **Out of scope:** prorated franchise tax after mid-year share amendments, Large Corporate Filer math, and state taxes outside Delaware. These are detected and flagged, not calculated.
