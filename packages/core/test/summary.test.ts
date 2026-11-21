import { describe, expect, it } from "vitest";
import { lumenLabsRecord, LUMEN_LABS_TODAY } from "../src/fixtures/lumenLabs.ts";
import { missing } from "../src/schema.ts";
import { defaultTaxYear, summarizeObligations } from "../src/summary.ts";

const ctx = { taxYear: 2026, today: LUMEN_LABS_TODAY };

describe("summarizeObligations: the demo moment (BRIEF §1)", () => {
  const summary = summarizeObligations(lumenLabsRecord, ctx);
  const text = summary.headline.join(" ");

  it("leads with the Delaware notice vs what you actually owe", () => {
    expect(summary.headline[0]).toBe(
      "Delaware's default math says $85,165. Under the Assumed Par Value method you owe $450 ($400 tax + $50 annual report fee). File by Mar 1, 2027.",
    );
  });

  it("calls out Form 5472 for a non-US founder owning 25%+", () => {
    expect(text).toContain(
      "Since you're a non-US founder owning 100% (25% or more), Form 5472 likely applies too; missing it costs $25,000 per form, per year.",
    );
  });

  it("adds up the known amounts itself, so the model never has to", () => {
    expect(summary.totalKnownUsd).toBe(550);
    expect(text).toContain(
      "Known amounts for tax year 2026: $550 in total ($100 Registered agent renewal + $450 Delaware franchise tax + annual report).",
    );
  });

  it("lists the other dated obligations in order", () => {
    expect(summary.alsoDue.map((d) => d.ruleId)).toEqual(["form-1099-nec", "registered-agent-renewal", "form-1120"]);
  });
});

describe("summarizeObligations: guardrails", () => {
  it("says what to confirm instead of guessing a franchise tax number", () => {
    const summary = summarizeObligations({ ...lumenLabsRecord, grossAssets: missing<number>() }, ctx);
    expect(summary.headline[0]).toMatch(/can't estimate Delaware franchise tax yet/);
    expect(summary.headline.join(" ")).not.toMatch(/\$450/);
  });

  it("puts urgent items first", () => {
    const record = {
      ...lumenLabsRecord,
      has83bConfirmation: { value: false, status: "confirmed" as const, provenance: { kind: "user" as const, answeredAt: "x" } },
    };
    expect(summarizeObligations(record, ctx).headline[0]).toMatch(/^Urgent: /);
  });
});

describe("defaultTaxYear", () => {
  it("uses last year during filing season (Jan–Apr) and this year after", () => {
    expect(defaultTaxYear("2027-02-01")).toBe(2026);
    expect(defaultTaxYear("2027-04-30")).toBe(2026);
    expect(defaultTaxYear("2026-11-21")).toBe(2026);
    expect(defaultTaxYear("2027-05-01")).toBe(2027);
  });
});
