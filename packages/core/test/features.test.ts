import { describe, expect, it } from "vitest";
import { buildAccountantSummary } from "../src/accountant.ts";
import { buildCalendar } from "../src/calendar.ts";
import { calculateFranchiseTax } from "../src/franchiseTax.ts";
import { LUMEN_LABS_TODAY, lumenLabsRecord } from "../src/fixtures/lumenLabs.ts";
import { sumGrossAssets } from "../src/grossAssets.ts";
import { buildCalendarIcs, escapeIcsText, foldIcsLine } from "../src/ics.ts";
import { compareNotice, type NoticeFacts } from "../src/notice.ts";
import { type CompanyRecord, missing } from "../src/schema.ts";

const ctx = { taxYear: 2026, today: LUMEN_LABS_TODAY };
const utf8Bytes = (text: string) => [...text].reduce((n, c) => n + (c.codePointAt(0)! < 0x80 ? 1 : c.codePointAt(0)! < 0x800 ? 2 : c.codePointAt(0)! < 0x10000 ? 3 : 4), 0);

describe("buildCalendarIcs", () => {
  const calendar = buildCalendar(lumenLabsRecord, ctx);
  const { ics, fileName, eventCount } = buildCalendarIcs(calendar, { companyName: "Lumen Labs, Inc.", generatedAt: "2026-11-21T10:00:00Z" });
  const unfolded = ics.replace(/\r\n /g, "");

  it("creates one all-day event per dated obligation that applies or may apply", () => {
    const dated = [...calendar.applies, ...calendar.maybe].filter((e) => e.due).length;
    expect(eventCount).toBe(dated);
    expect(unfolded.match(/BEGIN:VEVENT/g)).toHaveLength(dated);
    expect(fileName).toBe("lumen-labs-inc-compliance-calendar-2026.ics");
  });

  it("uses the engine's dates, with reminders 30 and 7 days before", () => {
    expect(unfolded).toContain("DTSTART;VALUE=DATE:20270301");
    expect(unfolded).toContain("DTEND;VALUE=DATE:20270302");
    expect(unfolded).toContain("SUMMARY:Delaware franchise tax + annual report ($450)");
    expect(unfolded).toContain("TRIGGER:-P30D");
    expect(unfolded).toContain("TRIGGER:-P7D");
    expect(unfolded).toContain("DTSTAMP:20261121T100000Z");
  });

  it("marks maybe items and includes the disclaimer", () => {
    expect(unfolded).toMatch(/SUMMARY:Maybe: Form 5472/);
    expect(unfolded).toContain("Information\\, not tax or legal advice");
  });

  it("is valid RFC 5545 framing: CRLF line endings and lines of 75 octets or fewer", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    for (const line of ics.split("\r\n")) expect(utf8Bytes(line)).toBeLessThanOrEqual(75);
  });

  it("escapes text and folds long lines on character boundaries", () => {
    expect(escapeIcsText("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne");
    const folded = foldIcsLine(`DESCRIPTION:${"é".repeat(60)}`);
    expect(folded.length).toBeGreaterThan(1);
    expect(folded.slice(1).every((l) => l.startsWith(" "))).toBe(true);
    expect(folded.map((l, i) => (i === 0 ? l : l.slice(1))).join("")).toBe(`DESCRIPTION:${"é".repeat(60)}`);
  });
});

describe("sumGrossAssets", () => {
  it("adds the lines exactly and shows the working", () => {
    const result = sumGrossAssets([
      { label: "Cash", amountUsd: "$41,234.10" },
      { label: "Receivables", amountUsd: "8,765.90" },
      { label: "Equipment", amountUsd: "" },
      { label: "Other", amountUsd: 0.1 },
    ]);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.totalUsd).toBe(50000.1);
    expect(result.workings.at(-1)).toBe("Total gross assets: $41,234.10 + $8,765.90 + $0.10 = $50,000.10");
    expect(result.detail).toContain("Check against Form 1120, Schedule L");
  });

  it("avoids floating point drift", () => {
    const result = sumGrossAssets([
      { label: "A", amountUsd: 0.1 },
      { label: "B", amountUsd: 0.2 },
    ]);
    expect(result.status === "ok" && result.totalUsd).toBe(0.3);
  });

  it("rejects negative and non-numeric amounts", () => {
    const result = sumGrossAssets([
      { label: "Cash", amountUsd: "-5" },
      { label: "Other", amountUsd: "lots" },
    ]);
    expect(result.status).toBe("invalid");
    if (result.status === "invalid") expect(result.errors).toHaveLength(2);
  });
});

describe("what-if scenarios use the same engine", () => {
  it("reducing authorized shares lowers the default-method tax", () => {
    const base = { shareClasses: [{ name: "Common", authorizedShares: 10_000_000, parValue: 0.00001 }], issuedShares: 8_000_000, grossAssets: 50_000 };
    const fewer = { ...base, shareClasses: [{ name: "Common", authorizedShares: 5_000, parValue: 0.00001 }] };
    expect(calculateFranchiseTax(base, { taxYear: 2026 }).authorizedShares.taxUsd).toBe(85_165);
    expect(calculateFranchiseTax(fewer, { taxYear: 2026 }).authorizedShares.taxUsd).toBe(175);
  });
});

const notice = (franchiseTax: number | null, totalDue: number | null, verified = true): NoticeFacts => {
  const v = (value: number) => ({ value, docName: "Notice (SAMPLE).pdf", page: 1, quote: `$${value}`, verified });
  return { taxYear: v(2026), franchiseTax: franchiseTax === null ? null : v(franchiseTax), totalDue: totalDue === null ? null : v(totalDue) };
};

describe("compareNotice", () => {
  it("recognises the default Authorized Shares bill and explains the lower amount", () => {
    const result = compareNotice(notice(85_165, 85_215), lumenLabsRecord, { defaultTaxYear: 2026 });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.matchesAuthorizedShares).toBe(true);
    expect(result.comparedAs).toBe("total_due");
    expect(result.noticeAmountUsd).toBe(85_215);
    expect(result.yourAmountUsd).toBe(450);
    expect(result.yourTaxUsd).toBe(400);
    expect(result.savingsUsd).toBe(84_765);
    expect(result.lines.join(" ")).toContain("exactly the Authorized Shares method");
    expect(result.lines.join(" ")).toContain("file your annual report with your gross assets and issued shares");
  });

  it("compares totals when the notice only shows the total due", () => {
    const result = compareNotice(notice(null, 85_215), lumenLabsRecord, { defaultTaxYear: 2026 });
    expect(result.status === "ok" && result.matchesAuthorizedShares).toBe(true);
    expect(result.status === "ok" && result.savingsUsd).toBe(84_765);
  });

  it("compares tax to tax when the notice only shows the franchise tax", () => {
    const result = compareNotice(notice(85_165, null), lumenLabsRecord, { defaultTaxYear: 2026 });
    expect(result.status === "ok" && [result.comparedAs, result.yourAmountUsd, result.savingsUsd]).toEqual(["franchise_tax", 400, 84_765]);
  });

  it("flags a notice that doesn't match the default method", () => {
    const result = compareNotice(notice(90_000, null), lumenLabsRecord, { defaultTaxYear: 2026 });
    expect(result.status === "ok" && result.matchesAuthorizedShares).toBe(false);
    expect(result.lines.join(" ")).toContain("Check before paying");
  });

  it("refuses to compare until the record is confirmed", () => {
    const record: CompanyRecord = { ...lumenLabsRecord, grossAssets: missing() };
    const result = compareNotice(notice(85_165, null), record, { defaultTaxYear: 2026 });
    expect(result.status).toBe("needs_confirmation");
    if (result.status === "needs_confirmation") expect(result.missing.map((m) => m.field)).toEqual(["grossAssets"]);
  });

  it("warns about unverified quotes and handles documents with no amount", () => {
    expect(compareNotice(notice(85_165, null, false), lumenLabsRecord, { defaultTaxYear: 2026 }).warnings).toHaveLength(2);
    expect(compareNotice({ taxYear: null, franchiseTax: null, totalDue: null }, lumenLabsRecord, { defaultTaxYear: 2026 }).status).toBe("unreadable");
  });
});

describe("buildAccountantSummary", () => {
  it("lists facts with status and source, the tax workings and obligations", () => {
    const { markdown, fileName } = buildAccountantSummary(lumenLabsRecord, ctx);
    expect(fileName).toBe("lumen-labs-inc-accountant-summary-2026.md");
    expect(markdown).toMatch(/\| Issued shares \| 8,000,000 \| Confirmed \| .*Stock Purchase Agreement \(SAMPLE\)\.pdf, p\.1/);
    expect(markdown).toContain("Amount due: $450");
    expect(markdown).toContain("Authorized Shares method: $85,165");
    expect(markdown).toContain("Mar 1, 2027");
    expect(markdown).toContain("Information, not tax or legal advice");
  });

  it("works with an incomplete record and lists what's open", () => {
    const record: CompanyRecord = { ...lumenLabsRecord, grossAssets: missing(), issuedShares: { ...lumenLabsRecord.issuedShares, status: "needs_confirmation" } };
    const { markdown } = buildAccountantSummary(record, ctx);
    expect(markdown).toContain("Not calculated yet");
    expect(markdown).toContain("## Open questions");
    expect(markdown).toContain("Extracted but not yet confirmed by the founder: Issued shares");
  });

  it("escapes pipes so a value can't break the table", () => {
    const record: CompanyRecord = { ...lumenLabsRecord, legalName: { value: "Pipe | Co", status: "confirmed", provenance: { kind: "user", answeredAt: "2026-11-21T00:00:00Z" } } };
    expect(buildAccountantSummary(record, ctx).markdown).toContain("Pipe \\| Co");
  });
});
