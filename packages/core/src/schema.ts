import { z } from "zod";

/**
 * The company record. Every field is a Fact: a value plus how sure we are and where it came from.
 * Nothing in the engine reads a value without also being able to say where it came from.
 */

const MAX_QUOTE_WORDS = 25;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

export const ProvenanceSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("document"),
    docName: z.string().min(1),
    page: z.number().int().positive(),
    quote: z
      .string()
      .min(1)
      .refine((q) => q.trim().split(/\s+/).length <= MAX_QUOTE_WORDS, {
        message: `quote must be ${MAX_QUOTE_WORDS} words or fewer`,
      }),
  }),
  z.object({ kind: z.literal("user"), answeredAt: z.string().min(1), detail: z.string().max(500).optional() }),
  z.object({
    kind: z.literal("stripe"),
    object: z.string().min(1),
    field: z.string().min(1),
    fetchedAt: z.string().min(1),
  }),
]);
export type Provenance = z.infer<typeof ProvenanceSchema>;

export const FactStatusSchema = z.enum(["confirmed", "needs_confirmation", "missing"]);
export type FactStatus = z.infer<typeof FactStatusSchema>;

export type Fact<T> = {
  value: T | null;
  status: FactStatus;
  confidence?: "high" | "medium" | "low";
  provenance?: Provenance;
};

export function factSchema<T extends z.ZodType>(value: T) {
  return z.object({
    value: value.nullable(),
    status: FactStatusSchema,
    confidence: z.enum(["high", "medium", "low"]).optional(),
    provenance: ProvenanceSchema.optional(),
  });
}

export const ShareClassSchema = z.object({
  name: z.string().min(1),
  authorizedShares: z.number().int().positive(),
  /** null means no-par stock. */
  parValue: z.number().nonnegative().nullable(),
});
export type ShareClass = z.infer<typeof ShareClassSchema>;

export const FounderSchema = z.object({
  name: z.string().min(1),
  ownershipPct: z.number().min(0).max(100),
  usTaxResident: z.boolean(),
});
export type Founder = z.infer<typeof FounderSchema>;

export const SafeSchema = z.object({
  investor: z.string().min(1),
  amount: z.number().positive(),
  type: z.enum(["post_money_cap", "discount"]),
  date: isoDate,
});
export type Safe = z.infer<typeof SafeSchema>;

export const ContractorPaymentSchema = z.object({
  payee: z.string().min(1),
  totalPaidThisYear: z.number().nonnegative(),
});

export const RegisteredAgentSchema = z.object({
  provider: z.enum(["atlas", "other"]),
  renewalDate: isoDate.nullable(),
});

export const EntityTypeSchema = z.enum(["c_corp", "llc"]);
export type EntityType = z.infer<typeof EntityTypeSchema>;

export const CompanyRecordSchema = z.object({
  entityType: factSchema(EntityTypeSchema),
  legalName: factSchema(z.string()),
  delawareFileNumber: factSchema(z.string()),
  incorporationDate: factSchema(isoDate),
  /** MM-DD. Defaults to 12-31 (calendar year). */
  fiscalYearEnd: factSchema(z.string().regex(/^\d{2}-\d{2}$/, "expected MM-DD")),
  shareClasses: factSchema(z.array(ShareClassSchema).min(1)),
  /** Issued shares, including treasury shares (Delaware's definition for the APV method). */
  issuedShares: factSchema(z.number().int().nonnegative()),
  /**
   * Total assets for the fiscal year, as reported on Form 1120 Schedule L.
   * Not the Stripe balance: Stripe balances are only a pre-fill hint the founder must confirm.
   */
  grossAssets: factSchema(z.number().nonnegative()),
  founders: factSchema(z.array(FounderSchema)),
  /** Derived from founders. Kept on the record so the derivation can be shown alongside it. */
  foreignOwnershipPct: factSchema(z.number().min(0).max(100)),
  safes: factSchema(z.array(SafeSchema)),
  /** State codes beyond Delaware where the founder reports employees, an office, or other nexus. */
  statesWithOperations: factSchema(z.array(z.string().regex(/^[A-Z]{2}$/))),
  contractorPaymentsByPayee: factSchema(z.array(ContractorPaymentSchema)),
  registeredAgent: factSchema(RegisteredAgentSchema),
  has83bConfirmation: factSchema(z.boolean()),
  atlasCompany: factSchema(z.boolean()),

  // Additions beyond BRIEF §4, needed to evaluate the rules without guessing:
  /** Date founder stock was issued; starts the 30-day 83(b) clock. */
  founderStockIssueDate: factSchema(isoDate),
  /** Form 5472: founder-confirmed reportable related-party transactions (capital contributions, loans, ...). */
  hasReportableRelatedPartyTransactions: factSchema(z.boolean()),
  /** Franchise tax: a mid-year amendment to authorized shares means prorating (out of scope, flagged). */
  amendedAuthorizedSharesThisYear: factSchema(z.boolean()),
  /** Franchise tax: listed companies may be Large Corporate Filers (out of scope, flagged). */
  listedOnNationalExchange: factSchema(z.boolean()),
});
export type CompanyRecord = z.infer<typeof CompanyRecordSchema>;
export type CompanyRecordField = keyof CompanyRecord;

export function missing<T>(): Fact<T> {
  return { value: null, status: "missing" };
}

export function emptyRecord(): CompanyRecord {
  return {
    entityType: missing(),
    legalName: missing(),
    delawareFileNumber: missing(),
    incorporationDate: missing(),
    fiscalYearEnd: missing(),
    shareClasses: missing(),
    issuedShares: missing(),
    grossAssets: missing(),
    founders: missing(),
    foreignOwnershipPct: missing(),
    safes: missing(),
    statesWithOperations: missing(),
    contractorPaymentsByPayee: missing(),
    registeredAgent: missing(),
    has83bConfirmation: missing(),
    atlasCompany: missing(),
    founderStockIssueDate: missing(),
    hasReportableRelatedPartyTransactions: missing(),
    amendedAuthorizedSharesThisYear: missing(),
    listedOnNationalExchange: missing(),
  };
}

/** The value if the founder has confirmed it, otherwise null. Use this for anything that produces a number. */
export function confirmedValue<T>(fact: Fact<T>): T | null {
  return fact.status === "confirmed" ? fact.value : null;
}

/** The value if we have one at all (confirmed or awaiting confirmation). Use for applicability, with a citation. */
export function knownValue<T>(fact: Fact<T>): T | null {
  return fact.status === "missing" ? null : fact.value;
}

export function deriveForeignOwnership(founders: Founder[]): { pct: number; workings: string[] } {
  const foreign = founders.filter((f) => !f.usTaxResident);
  // Round to 2dp so 33.33 + 33.33 + 33.34 doesn't print as 99.99999999.
  const pct = Math.round(foreign.reduce((sum, f) => sum + f.ownershipPct, 0) * 100) / 100;
  const workings =
    foreign.length === 0
      ? ["No founders are non-US tax residents → foreign ownership 0%"]
      : [
          ...foreign.map((f) => `${f.name}: ${f.ownershipPct}% (non-US tax resident)`),
          foreign.length > 1
            ? `Foreign ownership = ${foreign.map((f) => `${f.ownershipPct}%`).join(" + ")} = ${pct}%`
            : `Foreign ownership = ${pct}%`,
        ];
  return { pct, workings };
}
