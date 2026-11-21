import { buildCalendar, type CompanyRecord, estimateFranchiseTax, formatDate, RULES, type RuleContext, usd } from "@good-standing/core";
import { renderEstimate } from "./render.ts";

/**
 * `explain` doesn't call a model. It finds the rules a question is about and returns exactly what
 * the registry and the record say, with sources, for the client's model to explain in plain words.
 * If no rule matches, it says so, so the answer becomes "I don't know, ask a tax professional".
 */

interface Topic {
  ruleId: string;
  patterns: RegExp[];
}

const TOPICS: Topic[] = [
  { ruleId: "de-franchise-tax", patterns: [/franchise/i, /annual report/i, /delaware.*(tax|fee|owe|notice)/i, /assumed par/i, /authorized shares/i, /\$?85,?165/i, /\bnotice\b/i] },
  { ruleId: "de-llc-annual-tax", patterns: [/\bllc\b/i, /hb ?400/i] },
  { ruleId: "form-1120", patterns: [/\b1120\b/i, /income tax/i, /federal (tax )?return/i, /\b7004\b/i, /extension/i, /zero revenue/i] },
  { ruleId: "form-5472", patterns: [/\b5472\b/i, /foreign[- ]owned/i, /non-?us/i, /international founder/i, /related[- ]party/i, /\$?25,000/i] },
  { ruleId: "form-1099-nec", patterns: [/\b1099/i, /contractor/i, /freelancer/i] },
  { ruleId: "registered-agent-renewal", patterns: [/registered agent/i, /good standing/i] },
  { ruleId: "out-of-state-operations", patterns: [/\bstates?\b/i, /foreign qualification/i, /\bnexus\b/i, /california|new york|texas|washington/i] },
  { ruleId: "boi-report", patterns: [/\bboi\b/i, /beneficial owner/i, /fincen/i, /corporate transparency/i] },
  { ruleId: "83b-election", patterns: [/83\s*\(?b\)?/i, /vesting/i] },
];

export function matchRules(question: string): string[] {
  return TOPICS.filter((t) => t.patterns.some((p) => p.test(question))).map((t) => t.ruleId);
}

export function explainGrounding(question: string, record: CompanyRecord, ctx: RuleContext): string {
  const ruleIds = matchRules(question);
  if (ruleIds.length === 0) {
    return [
      "## Not covered",
      "",
      "None of Good Standing's rules cover this question. Tell the founder: \"I don't know. Please ask a tax professional.\" Don't answer from general knowledge.",
      "",
      `Topics Good Standing covers: ${RULES.map((r) => r.title).join("; ")}.`,
    ].join("\n");
  }

  const calendar = buildCalendar(record, ctx);
  const entries = [...calendar.applies, ...calendar.maybe, ...calendar.notRequired];
  const lines = [
    "## Grounding for your answer",
    "",
    "Answer the founder's question in plain language using **only** the material below, and cite its sources. If the question goes beyond it, say you don't know and suggest a tax professional. Don't compute new numbers or dates.",
    "",
  ];

  for (const id of ruleIds) {
    const rule = RULES.find((r) => r.id === id)!;
    const entry = entries.find((e) => e.ruleId === id)!;
    const status = { applies: "Applies to this company", maybe: "May apply to this company", not_required: "Not required for this company" }[entry.status];
    lines.push(`### ${rule.title}`, `- ${status}${entry.label ? ` (${entry.label})` : ""}: ${entry.reason}`);
    if (entry.due) lines.push(`- Due: ${entry.due.approximate ? "around " : ""}${formatDate(entry.due.date)}${entry.due.note ? `. ${entry.due.note}` : ""}`);
    if (entry.amount?.usd != null) lines.push(`- Amount: ${usd(entry.amount.usd)}. ${entry.amount.workings.join(" ")}`);
    if (rule.penalty) lines.push(`- If missed: ${rule.penalty}`);
    lines.push(`- Sources (checked ${rule.asOf}): ${rule.sourceUrls.join(", ")}`);
    if (rule.verifyNote) lines.push(`- Not yet verified: ${rule.verifyNote}`);
    lines.push("");
    if (id === "de-franchise-tax") {
      lines.push(renderEstimate(estimateFranchiseTax(record, { taxYear: ctx.taxYear })), "");
    }
  }
  return lines.join("\n");
}
