import type { Fact, Provenance } from "./schema.js";

export const DISCLAIMER =
  "Information, not tax or legal advice. Built for Stripe Atlas founders. Not affiliated with Stripe.";

const usdFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

/** 85165 → "$85,165"; 12.5 → "$12.50" */
export function usd(amount: number): string {
  const text = usdFormatter.format(amount);
  return `$${/\.\d$/.test(text) ? `${text}0` : text}`;
}

/** 10000000 → "10,000,000" */
export function count(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

/** Add thousands separators to a plain decimal string without going through floating point. */
export function groupDecimalString(text: string): string {
  const [whole = "0", frac] = text.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return frac === undefined ? grouped : `${grouped}.${frac}`;
}

export function describeProvenance(p: Provenance | undefined): string {
  if (!p) return "no source";
  switch (p.kind) {
    case "document":
      return `${p.docName}, p.${p.page}`;
    case "user":
      return "founder answer";
    case "stripe":
      return `Stripe ${p.object}.${p.field}`;
  }
}

/**
 * A short citation for a fact, used in rule reasons so every "why" points at the record:
 * `entity type: C-corp [Certificate of Incorporation, p.1]` or `... [founder answer, unconfirmed]`.
 */
export function cite<T>(label: string, fact: Fact<T>, display?: (v: T) => string): string {
  if (fact.status === "missing" || fact.value === null) return `${label}: unknown`;
  const shown = display ? display(fact.value) : String(fact.value);
  const source = describeProvenance(fact.provenance);
  return `${label}: ${shown} [${source}${fact.status === "needs_confirmation" ? ", unconfirmed" : ""}]`;
}
