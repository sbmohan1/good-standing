import type { CompanyRecord, Fact, Provenance } from "../schema.js";
import { deriveForeignOwnership } from "../schema.js";

/**
 * Lumen Labs, Inc.: the fictional demo company from BRIEF §10. Not a real company.
 * Quotes match the synthetic SAMPLE PDFs generated in Phase 2.
 */

export const LUMEN_LABS_TODAY = "2026-11-21";

const CERT = "Lumen Labs - Certificate of Incorporation (SAMPLE).pdf";
const SPA = "Lumen Labs - Stock Purchase Agreement (SAMPLE).pdf";
const ANSWERED_AT = "2026-11-21T09:00:00Z";

function fromDoc<T>(value: T, docName: string, page: number, quote: string): Fact<T> {
  const provenance: Provenance = { kind: "document", docName, page, quote };
  return { value, status: "confirmed", confidence: "high", provenance };
}

function fromUser<T>(value: T): Fact<T> {
  return { value, status: "confirmed", provenance: { kind: "user", answeredAt: ANSWERED_AT } };
}

const founders = [{ name: "Priya Raman", ownershipPct: 100, usTaxResident: false }];

export const lumenLabsRecord: CompanyRecord = {
  entityType: fromDoc("c_corp", CERT, 1, "The name of the corporation is Lumen Labs, Inc."),
  legalName: fromDoc("Lumen Labs, Inc.", CERT, 1, "The name of the corporation is Lumen Labs, Inc."),
  delawareFileNumber: fromDoc("7654321", CERT, 1, "Delaware File Number: 7654321"),
  incorporationDate: fromDoc("2026-02-10", CERT, 2, "Filed with the Delaware Secretary of State on February 10, 2026."),
  fiscalYearEnd: fromUser("12-31"),
  shareClasses: fromDoc(
    [{ name: "Common Stock", authorizedShares: 10_000_000, parValue: 0.00001 }],
    CERT,
    1,
    "authorized to issue is 10,000,000 shares of Common Stock, par value $0.00001 per share.",
  ),
  issuedShares: fromDoc(8_000_000, SPA, 1, "the Purchaser shall purchase 8,000,000 shares of Common Stock"),
  grossAssets: fromUser(50_000),
  founders: fromUser(founders),
  foreignOwnershipPct: fromUser(deriveForeignOwnership(founders).pct),
  safes: fromUser([{ investor: "Northwind Ventures (fictional)", amount: 250_000, type: "post_money_cap" as const, date: "2026-06-15" }]),
  statesWithOperations: fromUser([]),
  contractorPaymentsByPayee: fromUser([{ payee: "Design contractor (fictional)", totalPaidThisYear: 3_500 }]),
  registeredAgent: fromUser({ provider: "atlas" as const, renewalDate: null }),
  has83bConfirmation: fromUser(true),
  atlasCompany: fromUser(true),
  founderStockIssueDate: fromDoc("2026-02-12", SPA, 1, "dated as of February 12, 2026"),
  hasReportableRelatedPartyTransactions: { value: null, status: "missing" },
  amendedAuthorizedSharesThisYear: fromUser(false),
  listedOnNationalExchange: fromUser(false),
};
