import { describe, expect, it } from "vitest";
import { checkQuote, datesIn, normalizeText, numbersIn } from "../src/verify.ts";
import { quoteContainsNumber } from "../src/verify.ts";

describe("normalizeText", () => {
  it("collapses whitespace and unifies quotes and dashes", () => {
    expect(normalizeText("The “Company”\n  shall—purchase")).toBe('the "company" shall-purchase');
  });
});

describe("checkQuote", () => {
  const pages = ["Intro page.", "The total number of shares is 10,000,000\nshares of Common Stock."];

  it("verifies a quote on its cited page, across line breaks", () => {
    expect(checkQuote("10,000,000 shares of Common Stock", pages, 2)).toEqual({ status: "verified" });
  });

  it("reports when the quote is on a different page", () => {
    expect(checkQuote("10,000,000 shares of Common Stock", pages, 1)).toEqual({ status: "wrong_page", foundOnPage: 2 });
  });

  it("reports a quote that isn't in the document", () => {
    expect(checkQuote("20,000,000 shares of Preferred Stock", pages, 2)).toEqual({ status: "not_found" });
  });
});

describe("value checks", () => {
  it("finds numbers exactly, with commas and currency", () => {
    expect(numbersIn("10,000,000 shares, par value $0.00001")).toEqual(numbersIn("10000000 0.00001"));
    expect(quoteContainsNumber("par value $0.00001 per share", 0.00001)).toBe(true);
    expect(quoteContainsNumber("par value $0.0001 per share", 0.00001)).toBe(false);
  });

  it("parses common date formats", () => {
    expect(datesIn("on February 10, 2026.")).toEqual(["2026-02-10"]);
    expect(datesIn("dated 12 Feb 2026")).toEqual(["2026-02-12"]);
    expect(datesIn("2026-06-15 and 6/15/2026")).toEqual(["2026-06-15", "2026-06-15"]);
    expect(datesIn("as of 10 shares 2026")).toEqual([]);
  });
});
