import { describe, expect, it } from "vitest";
import {
  assumedParValueMethod,
  authorizedSharesMethod,
  calculateFranchiseTax,
  estimateFranchiseTax,
} from "../src/franchiseTax.js";
import { lumenLabsRecord } from "../src/fixtures/lumenLabs.js";
import { missing } from "../src/schema.js";

describe("Authorized Shares method", () => {
  it("Delaware example A: 10,005 authorized → $335", () => {
    expect(authorizedSharesMethod(10_005).taxUsd).toBe(335);
  });

  it("Delaware example B: 100,000 authorized → $1,015", () => {
    expect(authorizedSharesMethod(100_000).taxUsd).toBe(1_015);
  });

  it("minimum: 5,000 authorized → $175", () => {
    expect(authorizedSharesMethod(5_000).taxUsd).toBe(175);
  });

  it("5,001–10,000 authorized → $250", () => {
    expect(authorizedSharesMethod(5_001).taxUsd).toBe(250);
    expect(authorizedSharesMethod(10_000).taxUsd).toBe(250);
  });

  it("cap: 1,000,000,000 authorized → $200,000", () => {
    const result = authorizedSharesMethod(1_000_000_000);
    expect(result.taxUsd).toBe(200_000);
    expect(result.workings.join("\n")).toMatch(/maximum/i);
  });

  it("shows its workings", () => {
    const result = authorizedSharesMethod(10_000_000);
    expect(result.taxUsd).toBe(85_165);
    expect(result.workings.join("\n")).toContain("999");
  });
});

describe("Assumed Par Value Capital method", () => {
  it("bigger company: assumed par $10, capital $100,000,000 → $40,000", () => {
    const result = assumedParValueMethod({
      shareClasses: [{ name: "Common", authorizedShares: 10_000_000, parValue: 0.0001 }],
      issuedShares: 1_000_000,
      grossAssets: 10_000_000,
    });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.assumedPar).toBe("10.000000");
    expect(result.capitalUsd).toBe(100_000_000);
    expect(result.taxUsd).toBe(40_000);
  });

  it("uses a class's own par value when it exceeds the assumed par", () => {
    // assumed par = 50,000 / 8,000,000 = 0.006250; Preferred par $0.01 is higher.
    const result = assumedParValueMethod({
      shareClasses: [
        { name: "Common", authorizedShares: 10_000_000, parValue: 0.00001 },
        { name: "Preferred", authorizedShares: 1_000_000, parValue: 0.01 },
      ],
      issuedShares: 8_000_000,
      grossAssets: 50_000,
    });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.classes[0]).toMatchObject({ name: "Common", rateUsed: "assumed_par", capitalUsd: 62_500 });
    expect(result.classes[1]).toMatchObject({ name: "Preferred", rateUsed: "par_value", capitalUsd: 10_000 });
    expect(result.capitalUsd).toBe(72_500);
    expect(result.taxUsd).toBe(400);
  });

  it("enforces the $400 minimum and $200,000 maximum", () => {
    const tiny = assumedParValueMethod({
      shareClasses: [{ name: "Common", authorizedShares: 1_000, parValue: 0.0001 }],
      issuedShares: 1_000,
      grossAssets: 0,
    });
    expect(tiny.status === "ok" && tiny.taxUsd).toBe(400);

    const huge = assumedParValueMethod({
      shareClasses: [{ name: "Common", authorizedShares: 100_000_000, parValue: 0.0001 }],
      issuedShares: 1_000_000,
      grossAssets: 10_000_000_000,
    });
    expect(huge.status === "ok" && huge.taxUsd).toBe(200_000);
  });

  it("does not attempt APV for no-par stock and says why", () => {
    const result = assumedParValueMethod({
      shareClasses: [{ name: "Common", authorizedShares: 10_000_000, parValue: null }],
      issuedShares: 8_000_000,
      grossAssets: 50_000,
    });
    expect(result.status).toBe("not_applicable");
    if (result.status !== "not_applicable") return;
    expect(result.reason).toMatch(/no-par/i);
    expect(result.reason).toMatch(/Authorized Shares method always gives the lower result/i);
  });
});

describe("calculateFranchiseTax", () => {
  it("demo company: Delaware's default says $85,165, you owe $400 + $50 = $450", () => {
    const result = calculateFranchiseTax(
      {
        shareClasses: [{ name: "Common", authorizedShares: 10_000_000, parValue: 0.00001 }],
        issuedShares: 8_000_000,
        grossAssets: 50_000,
      },
      { taxYear: 2026 },
    );
    expect(result.authorizedShares.taxUsd).toBe(85_165);
    expect(result.assumedParValue.status).toBe("ok");
    if (result.assumedParValue.status === "ok") {
      expect(result.assumedParValue.assumedPar).toBe("0.006250");
      expect(result.assumedParValue.capitalUsd).toBe(62_500);
      expect(result.assumedParValue.taxUsd).toBe(400);
    }
    expect(result.method).toBe("assumed_par_value");
    expect(result.taxUsd).toBe(400);
    expect(result.annualReportFeeUsd).toBe(50);
    expect(result.totalDueUsd).toBe(450);
    expect(result.delawareNotice).toMatchObject({ totalUsd: 85_215, gapUsd: 84_765 });
    expect(result.dueDate).toBe("2027-03-01");
    expect(result.installments).toBeNull();
  });

  it("bigger company: chooses APV ($40,000) over Authorized Shares ($85,165)", () => {
    const result = calculateFranchiseTax(
      {
        shareClasses: [{ name: "Common", authorizedShares: 10_000_000, parValue: 0.0001 }],
        issuedShares: 1_000_000,
        grossAssets: 10_000_000,
      },
      { taxYear: 2026 },
    );
    expect(result.authorizedShares.taxUsd).toBe(85_165);
    expect(result.method).toBe("assumed_par_value");
    expect(result.taxUsd).toBe(40_000);
    expect(result.totalDueUsd).toBe(40_050);
  });

  it("shows Delaware's installment schedule when tax is $5,000 or more", () => {
    const result = calculateFranchiseTax(
      {
        shareClasses: [{ name: "Common", authorizedShares: 10_000_000, parValue: 0.0001 }],
        issuedShares: 1_000_000,
        grossAssets: 10_000_000,
      },
      { taxYear: 2026 },
    );
    expect(result.installments).toEqual([
      { date: "2026-06-01", percent: 40, usd: 16_000 },
      { date: "2026-09-01", percent: 20, usd: 8_000 },
      { date: "2026-12-01", percent: 20, usd: 8_000 },
      { date: "2027-03-01", percent: 20, usd: 8_000, note: "balance" },
    ]);
  });

  it("picks Authorized Shares when it is lower", () => {
    const result = calculateFranchiseTax(
      {
        shareClasses: [{ name: "Common", authorizedShares: 5_000, parValue: 0.0001 }],
        issuedShares: 5_000,
        grossAssets: 1_000_000,
      },
      { taxYear: 2026 },
    );
    expect(result.method).toBe("authorized_shares");
    expect(result.taxUsd).toBe(175);
    expect(result.totalDueUsd).toBe(225);
    expect(result.delawareNotice.gapUsd).toBe(0);
  });

  it("flags Large Corporate Filer territory at $750M+ gross assets", () => {
    const result = calculateFranchiseTax(
      {
        shareClasses: [{ name: "Common", authorizedShares: 10_000_000, parValue: 0.0001 }],
        issuedShares: 1_000_000,
        grossAssets: 750_000_000,
      },
      { taxYear: 2026 },
    );
    expect(result.flags.map((f) => f.id)).toContain("large_corporate_filer");
  });
});

describe("estimateFranchiseTax (record-level guardrails)", () => {
  it("runs on the confirmed demo record", () => {
    const result = estimateFranchiseTax(lumenLabsRecord, { taxYear: 2026 });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.totalDueUsd).toBe(450);
    expect(result.inputs.grossAssets.provenance?.kind).toBe("user");
  });

  it("refuses when gross assets are missing: needs_confirmation, no number", () => {
    const record = { ...lumenLabsRecord, grossAssets: missing<number>() };
    const result = estimateFranchiseTax(record, { taxYear: 2026 });
    expect(result.status).toBe("needs_confirmation");
    if (result.status !== "needs_confirmation") return;
    expect(result.missing.map((m) => m.field)).toEqual(["grossAssets"]);
    expect(result).not.toHaveProperty("totalDueUsd");
    expect(result).not.toHaveProperty("taxUsd");
  });

  it("refuses when a required fact is extracted but not yet confirmed", () => {
    const record = {
      ...lumenLabsRecord,
      issuedShares: { ...lumenLabsRecord.issuedShares, status: "needs_confirmation" as const },
    };
    const result = estimateFranchiseTax(record, { taxYear: 2026 });
    expect(result.status).toBe("needs_confirmation");
    if (result.status !== "needs_confirmation") return;
    expect(result.missing.map((m) => m.field)).toEqual(["issuedShares"]);
  });

  it("asks about mid-year share amendments when unknown, and flags them when true", () => {
    const unknown = estimateFranchiseTax(
      { ...lumenLabsRecord, amendedAuthorizedSharesThisYear: missing<boolean>() },
      { taxYear: 2026 },
    );
    expect(unknown.status === "ok" && unknown.flags.map((f) => f.id)).toContain("amendment_unknown");

    const amended = estimateFranchiseTax(
      {
        ...lumenLabsRecord,
        amendedAuthorizedSharesThisYear: {
          value: true,
          status: "confirmed",
          provenance: { kind: "user", answeredAt: "2026-11-21T00:00:00Z" },
        },
      },
      { taxYear: 2026 },
    );
    expect(amended.status === "ok" && amended.flags.map((f) => f.id)).toContain("amended_shares_prorating");
  });

  it("is only for C-corps", () => {
    const result = estimateFranchiseTax(
      {
        ...lumenLabsRecord,
        entityType: { value: "llc", status: "confirmed", provenance: { kind: "user", answeredAt: "2026-11-21T00:00:00Z" } },
      },
      { taxYear: 2026 },
    );
    expect(result.status).toBe("not_applicable");
  });
});
