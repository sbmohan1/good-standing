import { knownValue } from "../schema.js";
import { RULES_AS_OF } from "./shared.js";
import type { Rule } from "./types.js";

export const outOfStateOperations: Rule = {
  id: "out-of-state-operations",
  title: "Foreign qualification and state taxes outside Delaware",
  jurisdiction: "state",
  appliesTo(record) {
    const states = knownValue(record.statesWithOperations);
    if (states === null) {
      return {
        applies: "maybe",
        reason:
          "Do you have employees, an office, or other operations in any state besides Delaware? If so, you may need to register there.",
      };
    }
    if (states.length > 0) {
      return {
        applies: "maybe",
        reason: `You reported operations in ${states.join(", ")} [founder answer]. You may need to register as a foreign corporation and file state taxes in ${states.join(", ")}; Atlas refers this to partners.`,
      };
    }
    return { applies: false, reason: "You reported no operations outside Delaware [founder answer]." };
  },
  due() {
    return null;
  },
  sourceUrls: ["https://docs.stripe.com/atlas/business-taxes?business-type=ccorp"],
  asOf: RULES_AS_OF,
};
