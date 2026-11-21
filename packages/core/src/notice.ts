import { authorizedSharesMethod } from "./franchiseTax.ts";
import { estimateFranchiseTax, type MissingInput } from "./franchiseTax.ts";
import { count, usd } from "./format.ts";
import { FIELDS } from "./fields.ts";
import type { CompanyRecord, ShareClass } from "./schema.ts";

/**
 * Explains a Delaware franchise tax notice. Delaware bills by the Authorized Shares method by
 * default, because it doesn't know a company's gross assets or issued shares. This compares the
 * amount printed on the notice with both methods, using only confirmed facts, and says how to pay
 * the lower amount. The model only transcribes the notice; every comparison here is code.
 */

export interface NoticeValue {
  value: number;
  docName: string;
  page: number;
  quote: string;
  verified: boolean;
}

export interface NoticeFacts {
  taxYear: NoticeValue | null;
  franchiseTax: NoticeValue | null;
  totalDue: NoticeValue | null;
}

export type NoticeComparison =
  | {
      status: "ok";
      taxYear: number;
      /** What the comparison shows: the notice's total when printed, otherwise its franchise tax line. */
      comparedAs: "franchise_tax" | "total_due";
      noticeAmountUsd: number;
      /** Good Standing's figure on the same basis (total due, or tax only). */
      yourAmountUsd: number;
      authorizedSharesUsd: number;
      matchesAuthorizedShares: boolean;
      yourTaxUsd: number;
      yourTotalUsd: number;
      savingsUsd: number;
      lines: string[];
      warnings: string[];
    }
  | { status: "needs_confirmation"; taxYear: number; noticeAmountUsd: number | null; missing: MissingInput[]; lines: string[]; warnings: string[] }
  | { status: "unreadable"; lines: string[]; warnings: string[] };

const cite = (v: NoticeValue) => `${v.docName.replace(/\.pdf$/i, "")}, p.${v.page}`;

export function compareNotice(notice: NoticeFacts, record: CompanyRecord, opts: { defaultTaxYear: number }): NoticeComparison {
  const warnings = [notice.taxYear, notice.franchiseTax, notice.totalDue]
    .filter((v): v is NoticeValue => v !== null && !v.verified)
    .map((v) => `The quote for ${usd(v.value)} ("${v.quote}") didn't match the PDF text exactly. Check it against the notice.`);

  // Recognise the method from the franchise tax line when there is one; compare totals when printed.
  const methodBasis = notice.franchiseTax ?? notice.totalDue;
  const amount = notice.totalDue ?? notice.franchiseTax;
  if (!amount || !methodBasis) {
    return {
      status: "unreadable",
      lines: ["I couldn't find a franchise tax amount on this document. Is it a Delaware franchise tax notice?"],
      warnings,
    };
  }
  const comparedAs = notice.totalDue ? "total_due" : "franchise_tax";
  const taxYear = notice.taxYear?.value ?? opts.defaultTaxYear;
  const opening =
    notice.totalDue && notice.franchiseTax
      ? `Your notice says ${usd(notice.totalDue.value)} total due, including ${usd(notice.franchiseTax.value)} franchise tax, for tax year ${taxYear} (${cite(notice.totalDue)}).`
      : `Your notice says ${usd(amount.value)} ${comparedAs === "total_due" ? "total due" : "franchise tax"} for tax year ${taxYear} (${cite(amount)}).`;

  const estimate = estimateFranchiseTax(record, { taxYear });
  if (estimate.status === "not_applicable") {
    return { status: "unreadable", lines: [opening, estimate.message], warnings };
  }
  if (estimate.status === "needs_confirmation") {
    return {
      status: "needs_confirmation",
      taxYear,
      noticeAmountUsd: amount.value,
      missing: estimate.missing,
      lines: [
        opening,
        `To check it, I need these confirmed: ${estimate.missing.map((m) => FIELDS[m.field].label.toLowerCase()).join(", ")}. Then I'll compare it with both Delaware methods.`,
      ],
      warnings,
    };
  }

  const authorizedTotal = (estimate.inputs.shareClasses.value as ShareClass[]).reduce((sum, c) => sum + c.authorizedShares, 0);
  const asTax = authorizedSharesMethod(authorizedTotal).taxUsd;
  const basisIsTax = notice.franchiseTax !== null;
  const asCompare = basisIsTax ? asTax : estimate.delawareNotice.totalUsd;
  const matches = asCompare === methodBasis.value;
  const yourCompare = comparedAs === "franchise_tax" ? estimate.taxUsd : estimate.totalDueUsd;
  const savings = Math.max(0, amount.value - yourCompare);

  const lines = [opening];
  if (matches) {
    lines.push(
      `That's exactly the Authorized Shares method: ${count(authorizedTotal)} authorized shares → ${usd(asTax)} tax${basisIsTax ? "" : ` + ${usd(estimate.annualReportFeeUsd)} annual report fee`}. Delaware bills this way by default because it doesn't know your gross assets or issued shares.`,
    );
  } else {
    lines.push(
      `That isn't what the Authorized Shares method gives for your confirmed ${count(authorizedTotal)} authorized shares (${usd(asCompare)}). The notice may include penalties, interest or an earlier balance, or your authorized shares may differ from Delaware's records. Check before paying.`,
    );
  }

  if (estimate.method === "assumed_par_value" && savings > 0) {
    lines.push(
      `Under the Assumed Par Value method, with ${usd(estimate.inputs.grossAssets.value as number)} in gross assets and ${count(estimate.inputs.issuedShares.value as number)} issued shares, the tax is ${usd(estimate.taxUsd)}. You owe ${usd(estimate.totalDueUsd)} including the ${usd(estimate.annualReportFeeUsd)} annual report fee: ${usd(savings)} less than the notice.`,
      "To pay the lower amount, file your annual report with your gross assets and issued shares filled in. Delaware recalculates the tax from them when you file. Don't just pay the notice.",
    );
  } else if (savings > 0) {
    lines.push(`Good Standing's estimate is ${usd(yourCompare)}, ${usd(savings)} less than the notice. File your annual report with your actual figures.`);
  } else {
    lines.push(`The Authorized Shares method is already the lower one for your company, so ${usd(estimate.totalDueUsd)} in total is what you owe.`);
  }

  return {
    status: "ok",
    taxYear,
    noticeAmountUsd: amount.value,
    yourAmountUsd: yourCompare,
    comparedAs,
    authorizedSharesUsd: asCompare,
    matchesAuthorizedShares: matches,
    yourTaxUsd: estimate.taxUsd,
    yourTotalUsd: estimate.totalDueUsd,
    savingsUsd: savings,
    lines,
    warnings,
  };
}
