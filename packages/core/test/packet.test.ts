import { describe, expect, it } from "vitest";
import { lumenLabsRecord, LUMEN_LABS_TODAY } from "../src/fixtures/lumenLabs.ts";
import { firstThirtyDaysCheck } from "../src/firstThirtyDays.ts";
import { buildFilingPacket } from "../src/packet.ts";
import { missing } from "../src/schema.ts";

const ctx = { taxYear: 2026, today: LUMEN_LABS_TODAY };

describe("buildFilingPacket", () => {
  const packet = buildFilingPacket(lumenLabsRecord, ctx);

  it("pre-fills the Delaware annual report fields with their sources", () => {
    expect(packet.status).toBe("ok");
    if (packet.status !== "ok") return;
    const md = packet.markdown;
    expect(md).toContain("Lumen Labs, Inc.");
    expect(md).toContain("SAMPLE-7654321");
    expect(md).toMatch(/Gross assets.*\$50,000.*founder answer/);
    expect(md).toMatch(/Issued shares.*8,000,000.*Stock Purchase Agreement \(SAMPLE\)\.pdf, p\.1/);
    expect(md).toMatch(/Officers and directors/);
  });

  it("shows the amount, both methods and the due date", () => {
    if (packet.status !== "ok") throw new Error("expected ok");
    expect(packet.markdown).toContain("$450");
    expect(packet.markdown).toContain("$85,165");
    expect(packet.markdown).toContain("Mar 1, 2027");
  });

  it("links to Delaware's filing page and the Atlas Dashboard and says the founder files", () => {
    if (packet.status !== "ok") throw new Error("expected ok");
    expect(packet.markdown).toContain("https://icis.corp.delaware.gov/ecorp/logintax.aspx");
    expect(packet.markdown).toContain("https://corp.delaware.gov/paytaxes/");
    expect(packet.markdown).toContain("https://dashboard.stripe.com/atlas");
    expect(packet.markdown).toMatch(/You file this yourself/);
  });

  it("lists the year's other obligations", () => {
    if (packet.status !== "ok") throw new Error("expected ok");
    expect(packet.markdown).toMatch(/Form 1099-NEC/);
    expect(packet.markdown).toMatch(/Form 5472/);
  });

  it("refuses until the franchise tax inputs are confirmed", () => {
    const result = buildFilingPacket({ ...lumenLabsRecord, grossAssets: missing<number>() }, ctx);
    expect(result.status).toBe("needs_confirmation");
    expect(result).not.toHaveProperty("markdown");
  });
});

describe("firstThirtyDaysCheck", () => {
  const check = firstThirtyDaysCheck(lumenLabsRecord, LUMEN_LABS_TODAY);

  it("covers every item from BRIEF §8", () => {
    expect(check.items.map((i) => i.id)).toEqual([
      "ein",
      "83b",
      "bank-account",
      "investor-funds",
      "backup-payment",
      "registered-agent-date",
    ]);
  });

  it("marks the 83(b) done from the record and asks about what the record can't know", () => {
    const byId = Object.fromEntries(check.items.map((i) => [i.id, i]));
    expect(byId["83b"]!.status).toBe("done");
    expect(byId["ein"]!.status).toBe("confirm");
    expect(byId["investor-funds"]!.detail).toMatch(/wire/);
    expect(byId["investor-funds"]!.detail).toMatch(/not a card invoice/);
    expect(byId["registered-agent-date"]!.detail).toMatch(/Feb 10, 2027/);
  });

  it("knows how old the company is", () => {
    expect(check.daysSinceIncorporation).toBe(284);
  });
});
