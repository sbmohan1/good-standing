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

_TODO: collected from `TODO(verify)` markers in `packages/core/src/rules`._
