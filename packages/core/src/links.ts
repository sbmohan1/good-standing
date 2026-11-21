/** External links used in packets and checklists. */
export const LINKS = {
  delawareAnnualReportInstructions: "https://corp.delaware.gov/paytaxes/",
  delawareFileOnline: "https://icis.corp.delaware.gov/ecorp/logintax.aspx",
  delawareFranchiseTaxCalculator: "https://corp.delaware.gov/frtaxcalc/",
  // TODO(verify): behind Stripe login; couldn't confirm it lands on the Atlas Dashboard for an Atlas account.
  atlasDashboard: "https://dashboard.stripe.com/atlas",
} as const;
