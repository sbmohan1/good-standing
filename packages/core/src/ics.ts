import type { ComplianceCalendar } from "./calendar.ts";
import { addDays } from "./dates.ts";
import { DISCLAIMER, usd } from "./format.ts";

/**
 * iCalendar (RFC 5545) export of the compliance calendar: one all-day event per dated obligation
 * that applies or may apply, each with reminders 30 and 7 days before. Dates come straight from
 * the rules engine; nothing here computes a deadline.
 */

export interface IcsOptions {
  companyName: string;
  /** Timestamp for DTSTAMP, as an ISO date-time. Passed in so output is deterministic. */
  generatedAt: string;
  reminderDaysBefore?: number[];
}

/** RFC 5545 §3.3.11: escape backslash, semicolon, comma and newlines in TEXT values. */
export function escapeIcsText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** RFC 5545 §3.1: fold lines longer than 75 octets, continuing with a single space. */
export function foldIcsLine(line: string): string[] {
  const utf8Length = (char: string) => {
    const cp = char.codePointAt(0) ?? 0;
    return cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
  };
  const out: string[] = [];
  let current = "";
  let bytes = 0;
  let limit = 75;
  for (const char of line) {
    const size = utf8Length(char);
    if (bytes + size > limit) {
      out.push(current);
      current = char;
      bytes = size;
      limit = 74; // continuation lines start with a space
    } else {
      current += char;
      bytes += size;
    }
  }
  out.push(current);
  return out.map((l, i) => (i === 0 ? l : ` ${l}`));
}

const compactDate = (iso: string) => iso.replace(/-/g, "");

function compactTimestamp(isoDateTime: string): string {
  const d = new Date(isoDateTime);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid generatedAt timestamp: ${isoDateTime}`);
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export function buildCalendarIcs(calendar: ComplianceCalendar, options: IcsOptions): { fileName: string; ics: string; eventCount: number } {
  const stamp = compactTimestamp(options.generatedAt);
  const reminders = options.reminderDaysBefore ?? [30, 7];
  const entries = [...calendar.applies, ...calendar.maybe].filter((e) => e.due !== null);

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Good Standing//Compliance calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcsText(`${options.companyName}: compliance deadlines`)}`,
  ];

  for (const e of entries) {
    const due = e.due!;
    const prefix = e.status === "maybe" ? "Maybe: " : "";
    const amount = e.amount?.usd != null ? ` (${usd(e.amount.usd)})` : "";
    const description = [
      e.reason,
      e.label ? `Status: ${e.label}.` : "",
      due.approximate ? "This date is approximate. Confirm the exact date." : "",
      due.note ?? "",
      e.penalty ? `If missed: ${e.penalty}` : "",
      `Sources: ${e.sourceUrls.join(" ")} (checked ${e.asOf})`,
      DISCLAIMER,
    ]
      .filter(Boolean)
      .join("\n\n");

    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.ruleId}-${compactDate(due.date)}@good-standing`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${compactDate(due.date)}`,
      `DTEND;VALUE=DATE:${compactDate(addDays(due.date, 1))}`,
      `SUMMARY:${escapeIcsText(`${prefix}${e.title}${amount}`)}`,
      `DESCRIPTION:${escapeIcsText(description)}`,
      "TRANSP:TRANSPARENT",
    );
    if (e.sourceUrls[0]) lines.push(`URL:${e.sourceUrls[0]}`);
    for (const days of reminders) {
      lines.push(
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        `TRIGGER:-P${days}D`,
        `DESCRIPTION:${escapeIcsText(`${e.title} is due in ${days} days`)}`,
        "END:VALARM",
      );
    }
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");

  const slug = options.companyName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "company";
  return {
    fileName: `${slug}-compliance-calendar-${calendar.taxYear}.ics`,
    ics: `${lines.flatMap(foldIcsLine).join("\r\n")}\r\n`,
    eventCount: entries.length,
  };
}
