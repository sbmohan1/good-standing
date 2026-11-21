# Build brief: Good Standing

> **How to use this:** start Claude Code in an empty folder and paste everything below the line. Or save this file as `BRIEF.md` in the folder and tell Claude Code: "Read BRIEF.md, propose a plan for Phase 0–1, then build phase by phase."

---

## 1. Your role and the goal

You are building **Good Standing**, an AI agent that keeps a Stripe Atlas–formed company legally and financially healthy after incorporation. It reads a founder's formation documents (plus optional read-only Stripe data), builds a structured company record, and gives:

1. a personalized **compliance calendar** (what applies, when it's due, what it costs, what happens if missed, and why it applies),
2. a correct **Delaware franchise tax estimate** with both methods' math shown,
3. a **ready-to-file packet** the founder reviews and files themselves,
4. a **"first 30 days" check** for new companies.

It ships as an **MCP server** (so founders can use it from Claude Code, Claude Desktop or Cursor) plus a **one-page web demo**. Build it over one weekend (~26 hours) as a portfolio piece for a PM application to Stripe's Startup Products team (the Atlas team). The code, README and demo all need to look like a strong product-builder made them.

**The demo moment to optimize for:** a founder asks their agent "what does my company owe this year?" and gets back: *"Delaware's default math says $85,165. Under the Assumed Par Value method you owe $450. File by March 1. Since you're a non-US founder owning more than 25%, Form 5472 likely applies too; missing it costs $25,000. Here's your packet."*

## 2. Non-negotiable principles

1. **The LLM never does arithmetic or sets dates.** Claude extracts facts from documents, decides which rules apply, and explains. All money and date math lives in deterministic, unit-tested TypeScript.
2. **Every number shows where it came from.** Each output value links to its source: a page and quote in the founder's document, a user answer, a Stripe API field, or a rule's official source URL plus an as-of date.
3. **Read-only.** No money movement, no automatic filing, no writes to Stripe. The agent prepares and the human files, the same pattern as Stripe's own Atlas MCP tool and Treasury for agents.
4. **Never guess.** A missing or low-confidence field is marked `needs_confirmation`. The founder must confirm the record before any estimate runs. Refuse to estimate franchise tax without confirmed authorized shares, par value, issued shares and gross assets.
5. **Privacy.** The web demo processes uploads in memory and never stores them. The MCP server keeps the record in a local file the user controls. Never log document contents or API keys.
6. **Unofficial.** No Stripe logos, wordmarks or styling that implies affiliation. Use "Built for Stripe Atlas founders. Not affiliated with Stripe." Show "Information, not tax or legal advice" in every tool response footer and on the web page.
7. **Don't invent rule values.** Use only the values in section 6. If something is unclear, leave a `// TODO(verify):` comment and surface it in the README's "Known gaps" section rather than guessing.

## 3. Stack (use these unless you hit a blocker; ask before adding other dependencies)

- **Language:** TypeScript, Node 20+, pnpm workspaces.
- **Packages:**
  - `packages/core`: schema (Zod), rules registry, franchise tax engine, calendar builder, packet builder. Pure functions, no I/O, 100% unit-tested with Vitest.
  - `packages/extract`: PDF → `CompanyRecord` extraction using the Anthropic TypeScript SDK (`@anthropic-ai/sdk`) with PDF document input. Model set by env `ANTHROPIC_MODEL` (default `claude-sonnet-5-5`).
  - `packages/mcp`: MCP server using the official MCP TypeScript SDK (`@modelcontextprotocol/sdk`; check the current version and API before writing code). Stdio transport first.
  - `apps/web`: Next.js (App Router) single page, deployable to Vercel.
- **Optional Stripe read:** `stripe` (Node SDK) with a **Stripe agent API key**: a restricted key with the Agent tag and read-only permissions (balance read; Treasury financial account read if present). Stripe's MCP server stops accepting untagged restricted keys and full-access secret keys in December 2026, so design around agent keys from the start.
- **Secrets:** `.env` (gitignored) + `.env.example`. Never commit keys.

## 4. Data model: `CompanyRecord`

Each field is a `Fact<T>`:

```ts
type Provenance =
  | { kind: "document"; docName: string; page: number; quote: string }   // quote ≤ 25 words
  | { kind: "user"; answeredAt: string }
  | { kind: "stripe"; object: string; field: string; fetchedAt: string };

type Fact<T> = {
  value: T | null;
  status: "confirmed" | "needs_confirmation" | "missing";
  confidence?: "high" | "medium" | "low";
  provenance?: Provenance;
};
```

Fields:

- `entityType`: `"c_corp" | "llc"`
- `legalName`, `delawareFileNumber`, `incorporationDate` (ISO), `fiscalYearEnd` (default `12-31`)
- `shareClasses`: array of `{ name, authorizedShares, parValue | null }`
- `issuedShares` (include treasury shares)
- `grossAssets` for the relevant fiscal year (**this is "total assets" from Form 1120, Schedule L**, not the Stripe balance; Stripe balances are only a pre-fill hint the founder must confirm)
- `founders`: array of `{ name, ownershipPct, usTaxResident: boolean }`
- `foreignOwnershipPct` (derived from founders; show the derivation)
- `safes`: array of `{ investor, amount, type: "post_money_cap" | "discount", date }`
- `statesWithOperations`: array of state codes beyond Delaware (employees, office, or other nexus as the founder reports it)
- `contractorPaymentsByPayee`: array of `{ payee, totalPaidThisYear }`
- `registeredAgent`: `{ provider: "atlas" | "other", renewalDate }`
- `has83bConfirmation`: boolean
- `atlasCompany`: boolean

## 5. Franchise tax engine (`packages/core/franchiseTax.ts`)

Implement exactly as Delaware's calculator page describes (source: https://corp.delaware.gov/frtaxcalc/). Return both methods with step-by-step workings, the lower amount, and the total including the annual report fee.

**Authorized Shares method**

- ≤ 5,000 shares: $175
- 5,001–10,000 shares: $250
- More than 10,000: $250 + $85 for each additional 10,000 shares or portion thereof → `250 + 85 * ceil((shares - 10000) / 10000)`
- Maximum $200,000

**Assumed Par Value Capital method**

1. `assumedPar = grossAssets / issuedShares`, rounded to 6 decimal places (issued shares include treasury shares).
2. For each share class: if `parValue < assumedPar`, add `authorizedShares × assumedPar`; otherwise add `authorizedShares × parValue`. The sum is the assumed par value capital.
3. Tax = $400 per $1,000,000 or portion thereof → `400 * ceil(capital / 1_000_000)`, minimum $400, maximum $200,000.
4. If there's no-par stock, note in the output that Delaware says the Authorized Shares method always gives the lower result for no-par stock. Don't attempt APV for no-par classes; flag it.

**Also**

- Annual report filing fee: $50 (rule value; mark `TODO(verify)` against Delaware HB 400's fee schedule, which raised several fees from Aug 1, 2026).
- Late penalty: $200 + 1.5% per month interest on the unpaid tax (source: Atlas business taxes doc).
- If the tax due is ≥ $5,000, show Delaware's installment schedule: 40% by June 1, 20% by Sept 1, 20% by Dec 1, balance by March 1.
- Prorating for mid-year share amendments: out of scope, but detect it ("did you amend authorized shares this year?") and flag it.
- Large Corporate Filer rules: out of scope; flag if gross assets ≥ $750M or the founder says they're listed.

**Required unit tests (Vitest)**

| Case | Input | Expected |
| --- | --- | --- |
| Demo company | 10,000,000 authorized @ $0.00001; 8,000,000 issued; gross assets $50,000 | Authorized Shares $85,165; assumed par 0.006250; capital $62,500; APV $400; **owe $400 + $50 = $450** |
| Delaware example A | 10,005 authorized | Authorized Shares $335 |
| Delaware example B | 100,000 authorized | Authorized Shares $1,015 |
| Minimum | 5,000 authorized | Authorized Shares $175 |
| Bigger company | 10,000,000 authorized @ $0.0001; 1,000,000 issued; gross assets $10,000,000 | assumed par $10; capital $100,000,000; APV $40,000; chooses APV over $85,165 |
| Cap | 1,000,000,000 authorized | Authorized Shares capped at $200,000 |
| Par above assumed par | one class whose par exceeds the assumed par | uses that class's par value for that class |
| Refusal | gross assets missing | returns `needs_confirmation`, no number |

## 6. Rules registry (`packages/core/rules/`)

One file per rule. Each rule exports:

```ts
{
  id: string;
  title: string;
  jurisdiction: "DE" | "US-federal" | "state";
  appliesTo(record): { applies: boolean | "maybe"; reason: string };   // reason cites record fields
  due(record, taxYear): { date: string; note?: string } | null;
  amount?(record): { usd: number; workings: string[] } | null;
  penalty?: string;
  sourceUrls: string[];
  asOf: string;            // date the value was last checked
  verifyNote?: string;     // for TODO(verify) items
}
```

Implement these rules with exactly these values:

1. **Delaware franchise tax + annual report (C-corp).** Due March 1 for the prior calendar year. Amount from the engine above. Sources: https://corp.delaware.gov/frtaxcalc/, https://docs.stripe.com/atlas/business-taxes, https://stripe.com/atlas/guides/tax-season
2. **Delaware LLC annual tax.** $400 starting with tax year 2026 (payable by June 1, 2027) under HB 400; $300 before. Sources: https://www.delawareinc.com/blog/delaware-franchise-tax-update-hb-400/, https://maples.com/knowledge/delaware-house-bill-400-introduces-new-fee-changes. (Note in the README that Atlas's tax-season guide still says $300; this is the "rules drift" example.)
3. **Federal Form 1120 (C-corp).** Due the 15th day of the 4th month after fiscal year end (April 15 for calendar year). Form 7004 gives a 6-month extension to file, not to pay. Required even with zero revenue. Source: https://docs.stripe.com/atlas/business-taxes?business-type=ccorp
4. **Form 5472.** Applies (`"maybe"` until the founder confirms reportable transactions) when a C-corp is ≥ 25% foreign-owned, or a single-member LLC is foreign-owned (filed with a pro forma 1120). Filed with the return. Penalty $25,000 per form per year. Founder capital contributions and loans count as reportable transactions; say so in the reason. Source: https://plane.com/blog/international-founders-us-taxes
5. **Form 1099-NEC.** Applies when any single contractor was paid ≥ $2,000 in calendar 2026 (OBBBA raised the threshold from $600; payments in 2025 use $600). Due January 31 of the following year. Source: https://support.stripe.com/express/questions/whats-new-for-the-2026-tax-season
6. **Registered agent renewal.** Atlas includes year one, then $100/year. Assume renewal around the incorporation anniversary and ask the founder to confirm the exact date in their Atlas Dashboard (`TODO(verify)`). A lapsed agent puts the company out of good standing. Source: https://stripe.com/atlas
7. **Out-of-state operations.** If `statesWithOperations` isn't empty: `applies: "maybe"`. "You may need to register as a foreign corporation and file state taxes in [states]; Atlas refers this to partners." No amounts. Source: https://docs.stripe.com/atlas/business-taxes?business-type=ccorp
8. **BOI report: not required.** Always show as "not required for companies formed in the US" so founders stop worrying. Source: https://www.americanbar.org/groups/business_law/resources/business-law-today/2026-august/in-brief-corporations-llcs-partnerships
9. **83(b) election.** Due within 30 days of founder stock issuance. If `atlasCompany`, note that Atlas files it automatically; ask the founder to confirm they have the IRS-stamped confirmation. If the 30 days have passed with no confirmation, flag it urgently and recommend a tax professional.

The calendar builder runs every rule against the record and returns `applies`, `maybe` and `not_required` groups, sorted by due date, each with amount, penalty, reason and sources.

## 7. Document extraction (`packages/extract`)

- Inputs: Certificate of Incorporation, stock purchase agreement(s), 83(b) confirmation, SAFEs. PDF only, ≤ 10 MB each.
- Send each PDF to Claude as a document block, asking for JSON that matches a Zod schema. For **every** field, require `page` and a verbatim `quote` (≤ 25 words). Validate with Zod and retry once on a schema failure.
- Post-check: verify each quote actually appears in the PDF's extracted text (use a PDF text library). If it doesn't, downgrade the field to `needs_confirmation`.
- Never infer a value that isn't in the document. Founder residency, states of operation, contractor payments and gross assets come from **questions**, not documents.
- Write a small eval: run extraction against the synthetic demo documents and assert the expected values.

## 8. MCP server (`packages/mcp`)

Tools (clear descriptions; every response ends with the disclaimer footer):

| Tool | Input | Output |
| --- | --- | --- |
| `ingest_documents` | file paths | Extracted record with provenance; list of fields needing confirmation |
| `get_company_record` | none | Current record, with each field's status and source |
| `set_company_facts` | partial record (user answers or corrections) | Updated record; marks fields `confirmed` with user provenance |
| `compliance_calendar` | `taxYear` | Applies / maybe / not-required groups with dates, amounts, penalties, reasons, sources |
| `franchise_tax_estimate` | `taxYear` | Both methods with step-by-step workings, the lower amount, total due, "Delaware notice vs. actual" gap, installment schedule if needed |
| `prepare_filing_packet` | `taxYear` | Markdown packet: pre-filled Delaware annual report fields (gross assets, issued shares, officers/directors to confirm), checklist, links to the Delaware filing page and the Atlas Dashboard, a reminder that the founder files |
| `first_30_days_check` | none | Checklist: EIN received, 83(b) confirmation, bank account open, investor money should arrive by wire into the company bank account (or Stripe Treasury via Stripe Fundraising), not a card invoice; backup payment method; registered agent renewal date on the calendar |
| `explain` | question | Plain-language answer grounded **only** in the rules registry and the record, citing rule sources; says "I don't know, ask a tax professional" when out of scope |
| `fetch_stripe_hints` (optional) | none | Read-only balances as a gross-assets hint, labeled "hint, confirm against your balance sheet" |

- Store the record at `./.good-standing/record.json` (create a `.gitignore` entry).
- Provide copy-paste config for Claude Code (`.mcp.json`) and Claude Desktop in the README.

## 9. Web demo (`apps/web`)

One page, calm and legible, no Stripe styling:

1. Hero: "Atlas forms your company in a day. Staying in good standing is on you."
2. Two buttons: **Try the demo company** (preloaded synthetic data) or **Upload your Certificate of Incorporation**.
3. Record review: each extracted field with its page citation and a confirm/edit control; questions for residency, gross assets, states and contractors.
4. **"Delaware says / you owe"** card with expandable workings for both methods.
5. Compliance calendar (applies / maybe / not required).
6. Download packet (Markdown, and PDF if cheap).
7. Footer: disclaimer, "Not affiliated with Stripe", link to the GitHub repo, and "Processed in memory, never stored."

Server routes process files in memory, cap size at 10 MB, rate-limit by IP, and never log file contents.

## 10. Synthetic demo company (never use real company documents in the repo)

**Lumen Labs, Inc.**, a fictional Delaware C-corp:

- Incorporated 2026-02-10 via Atlas; calendar fiscal year
- 10,000,000 authorized common shares, par $0.00001; 8,000,000 issued to one founder, Priya Raman (fictional), non-US tax resident, 100% ownership
- One $250,000 post-money SAFE (valuation cap), 2026-06-15
- Gross assets at 2026-12-31: $50,000 (founder-confirmed)
- One contractor paid $3,500 in 2026
- No other states of operation; 83(b) confirmation on file

Generate simple synthetic PDFs (certificate of incorporation, stock purchase agreement) with a visible "SAMPLE: fictional company" watermark. Write the text yourself; don't copy Stripe or Atlas templates verbatim.

Expected calendar for tax year 2026: 1099-NEC (Jan 31, 2027), Delaware franchise tax + annual report ($450, Mar 1, 2027), Form 1120 + Form 5472 (Apr 15, 2027; 5472 marked "likely applies"), registered agent renewal ($100, ~Feb 10, 2027, to be confirmed), BOI (not required).

## 11. Build phases and acceptance criteria

Work phase by phase. At the start, show me a short plan. Commit at the end of each phase, run the tests, and give me a two-line status.

- **Phase 0 – Setup:** monorepo, lint, Vitest, `.env.example`, README skeleton. ✅ `pnpm test` runs.
- **Phase 1 – Core engine:** schema, franchise tax engine, all rules, calendar builder. ✅ Every test in section 5 passes; the demo company's calendar matches section 10.
- **Phase 2 – Extraction:** synthetic PDFs, extraction, quote verification, eval. ✅ The eval extracts the demo values with page citations.
- **Phase 3 – MCP server:** all tools except the optional Stripe one. ✅ In Claude Code, "what does my company owe this year?" returns the demo moment from section 1.
- **— CUT LINE: if only this ships, it's a complete demo. —**
- **Phase 4 – Packet, first-30-days check, Stripe hints.** ✅ Packet downloads; the Stripe hint works in test mode with an agent key.
- **Phase 5 – Web demo.** ✅ Deployed to Vercel; demo company flow works end to end in under 60 seconds.
- **Phase 6 – Polish:** README (problem in one paragraph, 90-second demo GIF placeholder, install, architecture diagram in Mermaid, guardrails, rules table with sources and as-of dates, "Known gaps"), `BUILD_LOG.md` (how coding agents were used, decisions, what was cut), `DEMO_SCRIPT.md` (90-second video script). ✅ A stranger can install and run the MCP server in under 5 minutes.

## 12. Out of scope (don't build)

Filing anything with Delaware or the IRS; payments; state tax calculations; payroll; prorated franchise tax; Large Corporate Filer math; legal document drafting (board consents and so on; that's Clerky's territory); user accounts; storing documents.

## 13. How I want you to work

- Plan before coding; keep the plan short.
- Write tests first for `packages/core`.
- Prefer boring, readable code over clever code; this repo will be read by Stripe engineers and PMs.
- If a rule value or legal interpretation seems wrong or ambiguous, stop and flag it. Don't guess.
- Keep responses brief: what you did, what's next, anything you need from me.
