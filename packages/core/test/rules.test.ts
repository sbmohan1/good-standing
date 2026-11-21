import { describe, expect, it } from "vitest";
import { lumenLabsRecord } from "../src/fixtures/lumenLabs.ts";
import { RULES, getRule } from "../src/rules/index.ts";
import type { CompanyRecord, Fact } from "../src/schema.ts";
import { missing } from "../src/schema.ts";

const ctx = { taxYear: 2026, today: "2026-11-21" };
const user = { kind: "user" as const, answeredAt: "2026-11-21T00:00:00Z" };
function confirmed<T>(value: T): Fact<T> {
  return { value, status: "confirmed", provenance: user };
}
function withFacts(patch: Partial<CompanyRecord>): CompanyRecord {
  return { ...lumenLabsRecord, ...patch };
}
const llc = confirmed<"c_corp" | "llc">("llc");

describe("registry hygiene", () => {
  it("has the nine rules from BRIEF §6 with unique ids", () => {
    expect(RULES).toHaveLength(9);
    expect(new Set(RULES.map((r) => r.id)).size).toBe(9);
  });

  it("every rule has https sources and an ISO as-of date", () => {
    for (const rule of RULES) {
      expect(rule.sourceUrls.length).toBeGreaterThan(0);
      for (const url of rule.sourceUrls) expect(url).toMatch(/^https:\/\//);
      expect(rule.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

describe("Delaware LLC annual tax", () => {
  const rule = getRule("de-llc-annual-tax");

  it("is $400 from tax year 2026 (HB 400), due June 1 of the next year", () => {
    const record = withFacts({ entityType: llc });
    expect(rule.appliesTo(record, ctx).applies).toBe(true);
    expect(rule.amount?.(record, ctx)?.usd).toBe(400);
    expect(rule.due(record, ctx)?.date).toBe("2027-06-01");
  });

  it("is $300 before tax year 2026", () => {
    const record = withFacts({ entityType: llc, incorporationDate: confirmed("2024-01-05") });
    expect(rule.amount?.(record, { taxYear: 2025, today: ctx.today })?.usd).toBe(300);
  });

  it("does not apply to C-corps", () => {
    expect(rule.appliesTo(lumenLabsRecord, ctx).applies).toBe(false);
  });
});

describe("Form 1120", () => {
  const rule = getRule("form-1120");

  it("is due the 15th day of the 4th month after fiscal year end", () => {
    expect(rule.due(lumenLabsRecord, ctx)?.date).toBe("2027-04-15");
    expect(rule.due(withFacts({ fiscalYearEnd: confirmed("06-30") }), ctx)?.date).toBe("2026-10-15");
  });

  it("says it is required even with zero revenue and 7004 extends filing, not paying", () => {
    expect(rule.appliesTo(lumenLabsRecord, ctx).reason).toMatch(/zero revenue/);
    expect(rule.due(lumenLabsRecord, ctx)?.note).toMatch(/7004.*not.*pay/);
  });
});

describe("Form 5472", () => {
  const rule = getRule("form-5472");

  it("applies once the founder confirms reportable transactions", () => {
    const record = withFacts({ hasReportableRelatedPartyTransactions: confirmed(true) });
    expect(rule.appliesTo(record, ctx).applies).toBe(true);
  });

  it("does not apply when the founder confirms no reportable transactions", () => {
    const record = withFacts({ hasReportableRelatedPartyTransactions: confirmed(false) });
    expect(rule.appliesTo(record, ctx).applies).toBe(false);
  });

  it("does not apply to a C-corp under 25% foreign-owned", () => {
    const record = withFacts({
      founders: confirmed([
        { name: "A", ownershipPct: 80, usTaxResident: true },
        { name: "B", ownershipPct: 20, usTaxResident: false },
      ]),
    });
    expect(rule.appliesTo(record, ctx).applies).toBe(false);
  });

  it("treats exactly 25% foreign ownership as in scope", () => {
    const record = withFacts({
      founders: confirmed([
        { name: "A", ownershipPct: 75, usTaxResident: true },
        { name: "B", ownershipPct: 25, usTaxResident: false },
      ]),
    });
    expect(rule.appliesTo(record, ctx).applies).toBe("maybe");
  });

  it("covers a foreign-owned single-member LLC (pro forma 1120)", () => {
    const record = withFacts({ entityType: llc });
    const result = rule.appliesTo(record, ctx);
    expect(result.applies).toBe("maybe");
    expect(result.reason).toMatch(/pro forma 1120/);
  });

  it("is a question, not a guess, when founder residency is unknown", () => {
    const result = rule.appliesTo(withFacts({ founders: missing() }), ctx);
    expect(result.applies).toBe("maybe");
    expect(result.label).toBeUndefined();
  });
});

describe("Form 1099-NEC", () => {
  const rule = getRule("form-1099-nec");
  const paid = (amount: number) => withFacts({ contractorPaymentsByPayee: confirmed([{ payee: "X", totalPaidThisYear: amount }]) });

  it("uses the $2,000 threshold for 2026", () => {
    expect(rule.appliesTo(paid(2_000), ctx).applies).toBe(true);
    expect(rule.appliesTo(paid(1_999), ctx).applies).toBe(false);
  });

  it("uses the $600 threshold for 2025", () => {
    const ctx2025 = { taxYear: 2025, today: ctx.today };
    const record = { ...paid(600), incorporationDate: confirmed("2024-03-01") };
    expect(rule.appliesTo(record, ctx2025).applies).toBe(true);
  });

  it("is due January 31 of the following year", () => {
    expect(rule.due(paid(3_500), ctx)?.date).toBe("2027-01-31");
  });

  it("asks when contractor payments are unknown", () => {
    expect(rule.appliesTo(withFacts({ contractorPaymentsByPayee: missing() }), ctx).applies).toBe("maybe");
  });
});

describe("Registered agent renewal", () => {
  const rule = getRule("registered-agent-renewal");

  it("uses a confirmed renewal date when the founder has one", () => {
    const record = withFacts({ registeredAgent: confirmed({ provider: "atlas" as const, renewalDate: "2027-02-14" }) });
    const due = rule.due(record, ctx);
    expect(due?.date).toBe("2027-02-14");
    expect(due?.approximate).toBeFalsy();
  });

  it("has no amount for a non-Atlas provider", () => {
    const record = withFacts({ registeredAgent: confirmed({ provider: "other" as const, renewalDate: null }) });
    expect(rule.amount?.(record, ctx)).toBeNull();
  });
});

describe("Out-of-state operations", () => {
  const rule = getRule("out-of-state-operations");

  it("is a maybe that names the states", () => {
    const result = rule.appliesTo(withFacts({ statesWithOperations: confirmed(["CA", "NY"]) }), ctx);
    expect(result.applies).toBe("maybe");
    expect(result.reason).toMatch(/CA, NY/);
    expect(result.reason).toMatch(/foreign corporation/);
  });
});

describe("83(b) election", () => {
  const rule = getRule("83b-election");
  const issued = (date: string, has83b: Fact<boolean>) =>
    withFacts({ founderStockIssueDate: confirmed(date), has83bConfirmation: has83b });

  it("is done when the stamped confirmation is on file", () => {
    expect(rule.appliesTo(lumenLabsRecord, ctx).applies).toBe(false);
    expect(rule.appliesTo(lumenLabsRecord, ctx).reason).toMatch(/on file/);
  });

  it("is due 30 days after founder stock issuance", () => {
    expect(rule.due(issued("2026-11-10", missing()), ctx)?.date).toBe("2026-12-10");
  });

  it("notes that Atlas files it automatically while the window is open", () => {
    const result = rule.appliesTo(issued("2026-11-10", missing()), ctx);
    expect(result.applies).toBe(true);
    expect(result.urgent).toBeFalsy();
    expect(result.reason).toMatch(/Atlas files/);
  });

  it("flags urgently when 30 days have passed with no confirmation", () => {
    const result = rule.appliesTo(issued("2026-02-12", confirmed(false)), ctx);
    expect(result.applies).toBe(true);
    expect(result.urgent).toBe(true);
    expect(result.reason).toMatch(/tax professional/);
  });
});
