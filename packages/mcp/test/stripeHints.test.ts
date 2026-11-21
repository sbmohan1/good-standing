import Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { memoryRecordStore } from "../src/store.ts";
import { checkAgentKey, fetchStripeHints, formatMinorUsd, renderStripeHints, type StripeReader } from "../src/stripeHints.ts";
import { fetchStripeHintsTool, type ToolDeps } from "../src/tools.ts";

function reader(overrides: Partial<StripeReader> = {}): StripeReader {
  return {
    balance: async () => ({
      available: [
        { currency: "usd", amountMinor: 1_234_56 },
        { currency: "eur", amountMinor: 5_00 },
      ],
      pending: [{ currency: "usd", amountMinor: 100_00 }],
    }),
    financialAccounts: async () => [{ id: "fa_1", cash: [{ currency: "usd", amountMinor: 48_000_00 }] }],
    ...overrides,
  };
}

const NOW = "2026-11-21T10:00:00.000Z";

describe("checkAgentKey", () => {
  it("accepts restricted keys only", () => {
    expect(checkAgentKey("rk_test_abc")).toEqual({ ok: true });
    expect(checkAgentKey("rk_live_abc")).toEqual({ ok: true });
    expect(checkAgentKey("sk_test_abc")).toMatchObject({ ok: false, reason: expect.stringMatching(/full-access secret key/) });
    expect(checkAgentKey(undefined)).toMatchObject({ ok: false, reason: expect.stringMatching(/Agent tag/) });
    expect(checkAgentKey("pk_test_abc").ok).toBe(false);
  });
});

describe("fetchStripeHints", () => {
  it("sums USD balances in cents and reads Treasury cash", async () => {
    const hints = await fetchStripeHints(reader(), { now: NOW, mode: "test" });
    expect(hints.balanceUsd).toEqual({ availableMinor: 123_456, pendingMinor: 10_000, totalMinor: 133_456 });
    expect(hints.otherCurrencies).toEqual([{ currency: "eur", amountMinor: 500 }]);
    expect(hints.treasury).toEqual({ accounts: 1, cashUsdMinor: 4_800_000 });
  });

  it("keeps going when the key can't read Treasury", async () => {
    const denied = reader({
      financialAccounts: async () => {
        throw new Stripe.errors.StripePermissionError({ message: "denied", type: "invalid_request_error" });
      },
    });
    const hints = await fetchStripeHints(denied, { now: NOW, mode: "test" });
    expect(hints.treasury).toMatchObject({ unavailable: expect.stringMatching(/can't read Treasury/) });
  });

  it("labels the result as a hint with its Stripe source fields", async () => {
    const text = renderStripeHints(await fetchStripeHints(reader(), { now: NOW, mode: "test" }));
    expect(text).toMatch(/This is a hint\. Confirm against your balance sheet\./);
    expect(text).toMatch(/Form 1120 Schedule L/);
    expect(text).toContain("available $1,234.56 + pending $100.00 = **$1,334.56**");
    expect(text).toContain("`balance.available[usd]`");
    expect(text).toMatch(/Test mode/);
    expect(text).toMatch(/Nothing was written to your record/);
    expect(text).toContain("5.00 EUR");
  });

  it("formats cents without floating point", () => {
    expect(formatMinorUsd(0)).toBe("$0.00");
    expect(formatMinorUsd(5)).toBe("$0.05");
    expect(formatMinorUsd(123_456_789)).toBe("$1,234,567.89");
    expect(formatMinorUsd(-250)).toBe("-$2.50");
  });
});

describe("fetch_stripe_hints tool", () => {
  const base: ToolDeps = {
    store: memoryRecordStore(),
    extractionModel: () => async () => null,
    today: () => "2026-11-21",
    now: () => NOW,
    cwd: "/",
    packetDir: null,
  };

  it("refuses without a restricted key, and never echoes the key", async () => {
    const result = await fetchStripeHintsTool({ ...base, stripeKey: "sk_test_SECRETVALUE", stripeReader: () => reader() });
    expect(result.isError).toBe(true);
    expect(result.text).not.toContain("SECRETVALUE");
  });

  it("doesn't change the record", async () => {
    const store = memoryRecordStore();
    await fetchStripeHintsTool({ ...base, store, stripeKey: "rk_test_x", stripeReader: () => reader() });
    expect(store.saved).toBe(0);
  });
});
