import { anniversaryInYear } from "../dates.js";
import { cite } from "../format.js";
import { knownValue } from "../schema.js";
import { RULES_AS_OF } from "./shared.js";
import type { Rule } from "./types.js";

const ATLAS_RENEWAL_USD = 100;

export const registeredAgent: Rule = {
  id: "registered-agent-renewal",
  title: "Registered agent renewal",
  jurisdiction: "DE",
  appliesTo(record) {
    const agent = knownValue(record.registeredAgent);
    const atlas = knownValue(record.atlasCompany);
    if (agent?.provider === "other") {
      return {
        applies: true,
        reason: `Every Delaware company must keep a registered agent (${cite("registered agent", record.registeredAgent, () => "non-Atlas provider")}). Check renewal terms with your provider.`,
      };
    }
    if (agent?.provider === "atlas" || atlas === true) {
      const source = agent
        ? cite("registered agent", record.registeredAgent, () => "Atlas")
        : cite("Atlas company", record.atlasCompany, () => "yes");
      return {
        applies: true,
        reason: `Atlas includes the registered agent for year one, then it renews at $100/year (${source}). A lapsed agent puts the company out of good standing.`,
      };
    }
    return {
      applies: true,
      reason: "Every Delaware company must keep a registered agent. Tell us who yours is and when it renews.",
    };
  },
  due(record, { taxYear }) {
    const agent = knownValue(record.registeredAgent);
    if (agent?.renewalDate && record.registeredAgent.status === "confirmed") {
      return { date: agent.renewalDate };
    }
    const incorporated = knownValue(record.incorporationDate);
    if (!incorporated) return null;
    // TODO(verify): Atlas's exact renewal date isn't published; we assume the incorporation anniversary.
    return {
      date: anniversaryInYear(incorporated, taxYear + 1),
      approximate: true,
      note: "Estimated from your incorporation anniversary. Confirm the exact renewal date in your Atlas Dashboard.",
    };
  },
  amount(record) {
    const agent = knownValue(record.registeredAgent);
    if (agent?.provider === "other") return null;
    if (agent?.provider !== "atlas" && knownValue(record.atlasCompany) !== true) return null;
    return { usd: ATLAS_RENEWAL_USD, workings: ["Atlas registered agent: first year included, then $100/year"] };
  },
  penalty: "A lapsed registered agent puts the company out of good standing.",
  sourceUrls: ["https://stripe.com/atlas"],
  asOf: RULES_AS_OF,
  verifyNote: "Renewal date assumed to be the incorporation anniversary; founder must confirm in the Atlas Dashboard.",
};
