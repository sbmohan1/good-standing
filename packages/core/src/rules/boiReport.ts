import { RULES_AS_OF } from "./shared.js";
import type { Rule } from "./types.js";

export const boiReport: Rule = {
  id: "boi-report",
  title: "Beneficial ownership information (BOI) report",
  jurisdiction: "US-federal",
  appliesTo() {
    return {
      applies: false,
      reason: "Not required for companies formed in the US. You don't need to file a BOI report with FinCEN.",
    };
  },
  due() {
    return null;
  },
  sourceUrls: [
    "https://www.americanbar.org/groups/business_law/resources/business-law-today/2026-august/in-brief-corporations-llcs-partnerships",
  ],
  asOf: RULES_AS_OF,
};
