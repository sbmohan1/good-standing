/**
 * Exact fixed-point decimal math on BigInt, scaled by 10^18.
 *
 * Franchise tax multiplies millions of shares by par values like $0.00001. In floating point,
 * 10,000,000 × 0.00625 is not reliably 62,500, and a "portion thereof" ceiling turns a tiny error
 * into an extra $400. So every money calculation in the engine goes through these helpers.
 */

export const SCALE = 18;
export const SCALE_FACTOR = 10n ** BigInt(SCALE);

/** Parse a number or decimal string (plain or exponent notation) into a scaled BigInt, exactly. */
export function parseDecimal(input: number | string): bigint {
  if (typeof input === "number" && !Number.isFinite(input)) {
    throw new Error(`Not a finite number: ${input}`);
  }
  const text = String(input).trim().toLowerCase();
  const match = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/.exec(text);
  if (!match) throw new Error(`Not a decimal: ${input}`);
  const [, sign = "", intPart = "0", fracPart = "", expPart = "0"] = match;

  // Shift the decimal point by the exponent, then pad/check against the fixed scale.
  let digits = intPart + fracPart;
  let pointPos = intPart.length + Number(expPart);
  if (pointPos < 0) {
    digits = "0".repeat(-pointPos) + digits;
    pointPos = 0;
  }
  if (pointPos > digits.length) digits = digits + "0".repeat(pointPos - digits.length);

  const whole = digits.slice(0, pointPos) || "0";
  const frac = digits.slice(pointPos).replace(/0+$/, "");
  if (frac.length > SCALE) throw new Error(`More than ${SCALE} decimal places: ${input}`);

  const scaled = BigInt(whole) * SCALE_FACTOR + BigInt(frac.padEnd(SCALE, "0") || "0");
  return sign === "-" ? -scaled : scaled;
}

/** Ceiling division for non-negative BigInts. */
export function ceilDiv(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n || numerator < 0n) throw new Error("ceilDiv expects numerator >= 0 and denominator > 0");
  return (numerator + denominator - 1n) / denominator;
}

/** Round a non-negative scaled value to `places` decimal places, half up. */
export function roundToPlaces(scaled: bigint, places: number): bigint {
  if (scaled < 0n) throw new Error("roundToPlaces expects a non-negative value");
  const unit = 10n ** BigInt(SCALE - places);
  return ((scaled + unit / 2n) / unit) * unit;
}

/** Format a scaled value with exactly `places` decimal places (truncating any further digits). */
export function formatDecimal(scaled: bigint, places: number): string {
  const negative = scaled < 0n;
  const abs = negative ? -scaled : scaled;
  const whole = abs / SCALE_FACTOR;
  const frac = (abs % SCALE_FACTOR).toString().padStart(SCALE, "0").slice(0, places);
  return `${negative ? "-" : ""}${whole}${places > 0 ? `.${frac}` : ""}`;
}

/** Convert a scaled value to a JS number. Only for display-level values that are known to be safe. */
export function toNumber(scaled: bigint): number {
  return Number(formatDecimal(scaled, SCALE));
}
