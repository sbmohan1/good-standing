import Stripe from "stripe";

/**
 * Optional, read-only Stripe data used only as a *hint* for gross assets. Franchise tax needs
 * total assets from Form 1120 Schedule L; a Stripe balance is at most one part of that, so the
 * founder always confirms the real number themselves.
 *
 * The reader exposes exactly two read calls. There is no code path here that writes to Stripe.
 */

export interface Money {
  currency: string;
  /** Minor units (cents), as Stripe returns them. */
  amountMinor: number;
}

export interface StripeReader {
  balance(): Promise<{ available: Money[]; pending: Money[] }>;
  /** Treasury financial accounts' cash balances. Throws StripePermissionError if the key can't read them. */
  financialAccounts(): Promise<Array<{ id: string; cash: Money[] }>>;
}

export type KeyCheck = { ok: true } | { ok: false; reason: string };

/** Stripe's MCP stops accepting full-access secret keys in December 2026, so we only accept restricted keys. */
export function checkAgentKey(key: string | undefined): KeyCheck {
  if (!key) {
    return {
      ok: false,
      reason:
        "No STRIPE_AGENT_KEY set. Create a restricted key in the Stripe Dashboard with the Agent tag and read-only permissions (Balance: Read; Treasury financial accounts: Read if you use Treasury), then add it to .env.",
    };
  }
  if (key.startsWith("sk_")) {
    return {
      ok: false,
      reason:
        "That's a full-access secret key. Good Standing only accepts a restricted, read-only agent key (rk_...). Please don't use secret keys here.",
    };
  }
  if (!key.startsWith("rk_")) {
    return { ok: false, reason: "STRIPE_AGENT_KEY should be a restricted key starting with rk_test_ or rk_live_." };
  }
  return { ok: true };
}

export function stripeReader(key: string): StripeReader {
  const stripe = new Stripe(key, { appInfo: { name: "good-standing" }, maxNetworkRetries: 1 });
  const money = (items: Array<{ amount: number; currency: string }>): Money[] =>
    items.map((i) => ({ currency: i.currency, amountMinor: i.amount }));
  return {
    async balance() {
      const b = await stripe.balance.retrieve();
      return { available: money(b.available), pending: money(b.pending) };
    },
    async financialAccounts() {
      const list = await stripe.treasury.financialAccounts.list({ limit: 100 });
      return list.data.map((fa) => ({
        id: fa.id,
        cash: Object.entries(fa.balance.cash).map(([currency, amount]) => ({ currency, amountMinor: amount })),
      }));
    },
  };
}

export interface StripeHints {
  fetchedAt: string;
  mode: "test" | "live";
  balanceUsd: { availableMinor: number; pendingMinor: number; totalMinor: number } | null;
  otherCurrencies: Money[];
  treasury: { accounts: number; cashUsdMinor: number } | { unavailable: string };
}

function sumUsd(items: Money[]): number {
  return items.filter((m) => m.currency === "usd").reduce((sum, m) => sum + m.amountMinor, 0);
}

export async function fetchStripeHints(
  reader: StripeReader,
  opts: { now: string; mode: "test" | "live" },
): Promise<StripeHints> {
  const balance = await reader.balance();
  const availableMinor = sumUsd(balance.available);
  const pendingMinor = sumUsd(balance.pending);
  const hasUsd = [...balance.available, ...balance.pending].some((m) => m.currency === "usd");

  let treasury: StripeHints["treasury"];
  try {
    const accounts = await reader.financialAccounts();
    treasury = { accounts: accounts.length, cashUsdMinor: accounts.reduce((sum, a) => sum + sumUsd(a.cash), 0) };
  } catch (error) {
    if (error instanceof Stripe.errors.StripePermissionError || error instanceof Stripe.errors.StripeInvalidRequestError) {
      treasury = { unavailable: "This key can't read Treasury financial accounts, or Treasury isn't enabled on this account." };
    } else {
      throw error;
    }
  }

  return {
    fetchedAt: opts.now,
    mode: opts.mode,
    balanceUsd: hasUsd ? { availableMinor, pendingMinor, totalMinor: availableMinor + pendingMinor } : null,
    otherCurrencies: [...balance.available, ...balance.pending].filter((m) => m.currency !== "usd" && m.amountMinor !== 0),
    treasury,
  };
}

/** Cents → "$1,234.56", without floating-point division. */
export function formatMinorUsd(minor: number): string {
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(minor);
  const dollars = Math.floor(abs / 100).toLocaleString("en-US");
  return `${sign}$${dollars}.${String(abs % 100).padStart(2, "0")}`;
}

function formatMinorOther(m: Money): string {
  const abs = Math.abs(m.amountMinor);
  return `${m.amountMinor < 0 ? "-" : ""}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")} ${m.currency.toUpperCase()}`;
}

export function renderStripeHints(h: StripeHints): string {
  const lines = [
    "## Stripe hint for gross assets",
    "",
    "**This is a hint. Confirm against your balance sheet.** Delaware's gross assets means *total assets on Form 1120 Schedule L* for the tax year, not your Stripe balance.",
    "",
  ];
  if (h.mode === "test") lines.push("_Test mode: these are test balances, not real money._", "");
  if (h.balanceUsd) {
    lines.push(
      `- Stripe balance (USD): available ${formatMinorUsd(h.balanceUsd.availableMinor)} + pending ${formatMinorUsd(h.balanceUsd.pendingMinor)} = **${formatMinorUsd(h.balanceUsd.totalMinor)}** (source: Stripe \`balance.available[usd]\` + \`balance.pending[usd]\`, fetched ${h.fetchedAt})`,
    );
  } else {
    lines.push("- No USD Stripe balance on this account.");
  }
  if (h.otherCurrencies.length > 0) {
    lines.push(`- Other currencies (not converted): ${h.otherCurrencies.map(formatMinorOther).join(", ")}`);
  }
  if ("unavailable" in h.treasury) {
    lines.push(`- Treasury: ${h.treasury.unavailable}`);
  } else {
    lines.push(
      `- Treasury financial accounts: ${h.treasury.accounts}, cash (USD) **${formatMinorUsd(h.treasury.cashUsdMinor)}** (source: Stripe \`treasury.financial_account.balance.cash.usd\`, fetched ${h.fetchedAt})`,
    );
  }
  lines.push(
    "",
    "Nothing was written to your record. Once the founder knows their Schedule L total assets, record it with `set_company_facts` (`grossAssets`).",
    "",
    "_Read-only: Good Standing only reads balances. It never moves money or writes to Stripe._",
  );
  return lines.join("\n");
}
