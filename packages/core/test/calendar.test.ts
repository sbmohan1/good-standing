import { describe, expect, it } from "vitest";
import { buildCalendar, type CalendarEntry } from "../src/calendar.ts";
import { lumenLabsRecord, LUMEN_LABS_TODAY } from "../src/fixtures/lumenLabs.ts";
import { RULES } from "../src/rules/index.ts";

const ctx = { taxYear: 2026, today: LUMEN_LABS_TODAY };

function byId(entries: CalendarEntry[], id: string) {
  const entry = entries.find((e) => e.ruleId === id);
  if (!entry) throw new Error(`no entry ${id}`);
  return entry;
}

describe("Lumen Labs calendar for tax year 2026 (BRIEF §10)", () => {
  const calendar = buildCalendar(lumenLabsRecord, ctx);

  it("applies: 1099-NEC, registered agent, Delaware franchise tax, Form 1120, sorted by date", () => {
    expect(calendar.applies.map((e) => [e.ruleId, e.due?.date])).toEqual([
      ["form-1099-nec", "2027-01-31"],
      ["registered-agent-renewal", "2027-02-10"],
      ["de-franchise-tax", "2027-03-01"],
      ["form-1120", "2027-04-15"],
    ]);
  });

  it("Delaware franchise tax + annual report is $450", () => {
    const entry = byId(calendar.applies, "de-franchise-tax");
    expect(entry.amount?.usd).toBe(450);
  });

  it("registered agent renewal is $100, approximate, to be confirmed", () => {
    const entry = byId(calendar.applies, "registered-agent-renewal");
    expect(entry.amount?.usd).toBe(100);
    expect(entry.due?.approximate).toBe(true);
    expect(entry.due?.note).toMatch(/Atlas Dashboard/);
  });

  it("Form 5472 is 'likely applies', due with the return, $25,000 penalty", () => {
    const entry = byId(calendar.maybe, "form-5472");
    expect(entry.label).toBe("likely applies");
    expect(entry.due?.date).toBe("2027-04-15");
    expect(entry.penalty).toMatch(/\$25,000/);
    expect(entry.reason).toMatch(/100%/);
    expect(entry.reason).toMatch(/capital contributions and loans/);
  });

  it("BOI is shown as not required", () => {
    const entry = byId(calendar.notRequired, "boi-report");
    expect(entry.reason).toMatch(/not required for companies formed in the US/i);
  });

  it("nothing else is in the maybe group", () => {
    expect(calendar.maybe.map((e) => e.ruleId)).toEqual(["form-5472"]);
  });

  it("every entry cites sources and an as-of date", () => {
    for (const entry of [...calendar.applies, ...calendar.maybe, ...calendar.notRequired]) {
      expect(entry.sourceUrls.length).toBeGreaterThan(0);
      expect(entry.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(entry.reason.length).toBeGreaterThan(0);
    }
  });

  it("covers every rule exactly once", () => {
    const ids = [...calendar.applies, ...calendar.maybe, ...calendar.notRequired].map((e) => e.ruleId).sort();
    expect(ids).toEqual(RULES.map((r) => r.id).sort());
  });
});

describe("calendar edge cases", () => {
  it("marks every rule not required for a year before the company existed", () => {
    const calendar = buildCalendar(lumenLabsRecord, { taxYear: 2025, today: LUMEN_LABS_TODAY });
    expect(calendar.applies).toEqual([]);
    expect(calendar.maybe).toEqual([]);
    expect(byId(calendar.notRequired, "form-1120").reason).toMatch(/incorporated on 2026-02-10/);
  });

  it("shows the franchise tax as needing confirmation instead of a number", () => {
    const record = {
      ...lumenLabsRecord,
      grossAssets: { ...lumenLabsRecord.grossAssets, status: "needs_confirmation" as const },
    };
    const entry = byId(buildCalendar(record, ctx).applies, "de-franchise-tax");
    expect(entry.amount?.usd).toBeNull();
    expect(entry.amount?.needsConfirmation).toEqual(["grossAssets"]);
  });
});
