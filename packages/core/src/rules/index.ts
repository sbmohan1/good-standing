import { boiReport } from "./boiReport.ts";
import { deFranchiseTax } from "./deFranchiseTax.ts";
import { deLlcAnnualTax } from "./deLlcAnnualTax.ts";
import { election83b } from "./election83b.ts";
import { form1099Nec } from "./form1099Nec.ts";
import { form1120 } from "./form1120.ts";
import { form5472 } from "./form5472.ts";
import { outOfStateOperations } from "./outOfStateOperations.ts";
import { registeredAgent } from "./registeredAgent.ts";
import type { Rule } from "./types.ts";

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

export type { Amount, Applicability, DueDate, Rule, RuleContext } from "./types.ts";
