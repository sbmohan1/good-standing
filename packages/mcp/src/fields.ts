import { type CompanyRecord, type CompanyRecordField, count, usd } from "@good-standing/core";

/** Human labels and the question to ask when a field is missing. */
export const FIELDS: Record<CompanyRecordField, { label: string; question?: string; fromDocuments?: boolean }> = {
  entityType: { label: "Entity type", question: "Is the company a C-corp or an LLC?", fromDocuments: true },
  legalName: { label: "Legal name", fromDocuments: true },
  delawareFileNumber: { label: "Delaware file number", fromDocuments: true },
  incorporationDate: { label: "Incorporation date", question: "When was the company incorporated?", fromDocuments: true },
  fiscalYearEnd: { label: "Fiscal year end", question: "What is your fiscal year end? Most startups use December 31 (12-31)." },
  shareClasses: { label: "Authorized shares", question: "How many shares are authorized, in which classes, at what par value?", fromDocuments: true },
  issuedShares: { label: "Issued shares", question: "How many shares are issued in total, including treasury shares?", fromDocuments: true },
  grossAssets: {
    label: "Gross assets",
    question: "What were total assets at the end of the tax year, as on Form 1120 Schedule L? (Not your bank balance.)",
  },
  founders: { label: "Founders", question: "For each founder: name, ownership %, and whether they're a US tax resident." },
  foreignOwnershipPct: { label: "Foreign ownership" },
  safes: { label: "SAFEs", question: "Any SAFEs? For each: investor, amount, post-money cap or discount, date." },
  statesWithOperations: {
    label: "Other states",
    question: "Any employees, office or other operations in states besides Delaware? Which ones (or none)?",
  },
  contractorPaymentsByPayee: { label: "Contractor payments", question: "What did you pay each contractor this year (or none)?" },
  registeredAgent: { label: "Registered agent", question: "Is your registered agent through Atlas or another provider? Do you know the renewal date?" },
  has83bConfirmation: { label: "83(b) confirmation", question: "Do you have the IRS-stamped 83(b) confirmation?" },
  atlasCompany: { label: "Formed with Atlas", question: "Was the company formed with Stripe Atlas?" },
  founderStockIssueDate: { label: "Founder stock issued", question: "When was founder stock issued?", fromDocuments: true },
  hasReportableRelatedPartyTransactions: {
    label: "Transactions with foreign owners",
    question: "Did the company have any transactions with its foreign owners this year (capital contributions, loans, payments)?",
  },
  amendedAuthorizedSharesThisYear: { label: "Amended authorized shares this year", question: "Did you amend authorized shares this year?" },
  listedOnNationalExchange: { label: "Listed on an exchange", question: "Is the company listed on a national stock exchange?" },
};

export function displayValue(field: CompanyRecordField, record: CompanyRecord): string {
  const value = record[field].value as unknown;
  if (value === null || value === undefined) return "—";
  switch (field) {
    case "entityType":
      return value === "c_corp" ? "C-corp" : "LLC";
    case "grossAssets":
      return usd(value as number);
    case "issuedShares":
      return count(value as number);
    case "foreignOwnershipPct":
      return `${value}%`;
    case "shareClasses":
      return (value as CompanyRecord["shareClasses"]["value"] & object)
        .map((c) => `${count(c.authorizedShares)} ${c.name} @ ${c.parValue === null ? "no par" : `$${c.parValue}`}`)
        .join("; ");
    case "founders":
      return (value as CompanyRecord["founders"]["value"] & object)
        .map((f) => `${f.name} ${f.ownershipPct}% (${f.usTaxResident ? "US" : "non-US"} tax resident)`)
        .join("; ");
    case "safes": {
      const safes = value as CompanyRecord["safes"]["value"] & object;
      return safes.length === 0 ? "none" : safes.map((s) => `${s.investor} ${usd(s.amount)} (${s.type === "post_money_cap" ? "post-money cap" : "discount"}, ${s.date})`).join("; ");
    }
    case "statesWithOperations": {
      const states = value as string[];
      return states.length === 0 ? "none" : states.join(", ");
    }
    case "contractorPaymentsByPayee": {
      const payments = value as CompanyRecord["contractorPaymentsByPayee"]["value"] & object;
      return payments.length === 0 ? "none" : payments.map((p) => `${p.payee} ${usd(p.totalPaidThisYear)}`).join("; ");
    }
    case "registeredAgent": {
      const agent = value as { provider: string; renewalDate: string | null };
      return `${agent.provider === "atlas" ? "Atlas" : "Other provider"}${agent.renewalDate ? `, renews ${agent.renewalDate}` : ""}`;
    }
    default:
      return typeof value === "boolean" ? (value ? "yes" : "no") : String(value);
  }
}
