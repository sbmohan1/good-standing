import { describe, expect, it } from "vitest";
import { ceilDiv, formatDecimal, parseDecimal, roundToPlaces, SCALE_FACTOR } from "../src/decimal.ts";

describe("parseDecimal", () => {
  it("parses plain and exponent notation exactly", () => {
    expect(parseDecimal(0.00001)).toBe(10n ** 13n); // 0.00001 * 10^18
    expect(parseDecimal(1e-7)).toBe(10n ** 11n);
    expect(parseDecimal("50000")).toBe(50_000n * SCALE_FACTOR);
    expect(parseDecimal(1234.5)).toBe(12345n * 10n ** 17n);
  });

  it("rejects values with more precision than the fixed scale", () => {
    expect(() => parseDecimal("0.0000000000000000001")).toThrow();
  });

  it("rejects non-finite numbers", () => {
    expect(() => parseDecimal(Number.NaN)).toThrow();
    expect(() => parseDecimal(Number.POSITIVE_INFINITY)).toThrow();
  });
});

describe("roundToPlaces", () => {
  it("rounds half up at the given decimal place", () => {
    expect(formatDecimal(roundToPlaces(parseDecimal("0.0062504"), 6), 6)).toBe("0.006250");
    expect(formatDecimal(roundToPlaces(parseDecimal("0.0062505"), 6), 6)).toBe("0.006251");
  });
});

describe("ceilDiv", () => {
  it("rounds up any remainder", () => {
    expect(ceilDiv(10n, 5n)).toBe(2n);
    expect(ceilDiv(11n, 5n)).toBe(3n);
    expect(ceilDiv(0n, 5n)).toBe(0n);
  });
});
