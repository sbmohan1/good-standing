import { boiReport } from "./boiReport.js";
import { deFranchiseTax } from "./deFranchiseTax.js";
import { deLlcAnnualTax } from "./deLlcAnnualTax.js";
import { election83b } from "./election83b.js";
import { form1099Nec } from "./form1099Nec.js";
import { form1120 } from "./form1120.js";
import { form5472 } from "./form5472.js";
import { outOfStateOperations } from "./outOfStateOperations.js";
import { registeredAgent } from "./registeredAgent.js";
import type { Rule } from "./types.js";

/** Every rule Good Standing knows about, in BRIEF §6 order. */
export const RULES: readonly Rule[] = [
  deFranchiseTax,
  deLlcAnnualTax,
  form1120,
  form5472,
  form1099Nec,
  registeredAgent,
  outOfStateOperations,
  boiReport,
  election83b,
];

export function getRule(id: string): Rule {
  const rule = RULES.find((r) => r.id === id);
  if (!rule) throw new Error(`Unknown rule: ${id}`);
  return rule;
}

export type { Amount, Applicability, DueDate, Rule, RuleContext } from "./types.js";
