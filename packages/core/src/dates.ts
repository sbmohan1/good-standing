/**
 * Calendar-date helpers on ISO strings (YYYY-MM-DD). Dates are civil dates, not instants,
 * so all math is done in UTC to avoid time-zone drift.
 */

function parts(iso: string): [number, number, number] {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) throw new Error(`Not an ISO date: ${iso}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function toIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function isoDate(year: number, month: number, day: number): string {
  return toIso(new Date(Date.UTC(year, month - 1, day)));
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = parts(iso);
  return toIso(new Date(Date.UTC(y, m - 1, d + days)));
}

/** Same month/day in another year, clamping Feb 29 to Feb 28 in non-leap years. */
export function anniversaryInYear(iso: string, year: number): string {
  const [, m, d] = parts(iso);
  return isoDate(year, m, Math.min(d, daysInMonth(year, m)));
}

export function compareIso(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function yearOf(iso: string): number {
  return parts(iso)[0];
}

export function isWeekend(iso: string): boolean {
  const [y, m, d] = parts(iso);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return day === 0 || day === 6;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2027-03-01" → "Mar 1, 2027" */
export function formatDate(iso: string): string {
  const [y, m, d] = parts(iso);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

/**
 * The fiscal year end that falls in `taxYear`, given a fiscal year end of "MM-DD".
 * Calendar-year companies (12-31) get December 31 of the tax year.
 */
export function fiscalYearEndDate(fiscalYearEnd: string, taxYear: number): string {
  const [mm, dd] = fiscalYearEnd.split("-").map(Number) as [number, number];
  return isoDate(taxYear, mm, Math.min(dd, daysInMonth(taxYear, mm)));
}

/** The 15th day of the Nth month after the month containing `iso`. */
export function fifteenthOfNthMonthAfter(iso: string, n: number): string {
  const [y, m] = parts(iso);
  return isoDate(y, m + n, 15);
}
