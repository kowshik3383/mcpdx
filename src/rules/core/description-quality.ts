import type { Rule, Finding, RuleContext } from "../../types.js";

const VAGUE_PATTERNS = [
  /^does\s+stuff/i,
  /^handles?\s+things/i,
  /^runs?\s+command/i,
  /^helper(\s+function)?/i,
  /^do\s+action/i,
  /^tool\s+to\s+do/i,
  /^utility/i,
  /^test/i,
];

export const descriptionQualityRule: Rule = {
  id: "core/description-quality",
  name: "Tool Description Quality",
  description: "Audits tool descriptions for length, vagueness, and LLM comprehension readiness",
  category: "core",
  defaultSeverity: "warn",

  evaluate(context: RuleContext): Finding[] {
    const findings: Finding[] = [];

    for (const tool of context.fingerprint.tools) {
      const desc = tool.description?.trim();

      // Case 1: Missing description
      if (!desc) {
        findings.push({
          ruleId: "core/description-quality",
          ruleName: "Tool Description Quality",
          category: "core",
          severity: "error",
          toolName: tool.name,
          filePath: tool.filePath,
          lineNumber: tool.lineNumber,
          message: `Tool "${tool.name}" has no description. LLMs rely on descriptions to determine when and how to call tools.`,
          suggestedFix: `Add a concise explanation of what "${tool.name}" does, its inputs, and expected return value.`,
          fixable: false,
        });
        continue;
      }

      // Case 2: Too short (< 20 chars)
      if (desc.length < 20) {
        findings.push({
          ruleId: "core/description-quality",
          ruleName: "Tool Description Quality",
          category: "core",
          severity: "warn",
          toolName: tool.name,
          filePath: tool.filePath,
          lineNumber: tool.lineNumber,
          message: `Tool "${tool.name}" has an excessively short description (${desc.length} chars: "${desc}"). This causes high ambiguity for model invocation.`,
          suggestedFix: `Expand description to at least 20-50 characters explaining context, parameters, and side-effects.`,
          fixable: false,
        });
        continue;
      }

      // Case 3: Vague verbs or meaningless placeholders
      const isVague = VAGUE_PATTERNS.some((pattern) => pattern.test(desc));
      if (isVague) {
        findings.push({
          ruleId: "core/description-quality",
          ruleName: "Tool Description Quality",
          category: "core",
          severity: "warn",
          toolName: tool.name,
          filePath: tool.filePath,
          lineNumber: tool.lineNumber,
          message: `Tool "${tool.name}" uses a vague description: "${desc}". Avoid generic phrases like "does stuff" or "helper".`,
          suggestedFix: `Specify exact action, target resource, and expected output format.`,
          fixable: false,
        });
        continue;
      }

      // Case 4: Bloated description (> 1000 characters)
      if (desc.length > 1000) {
        findings.push({
          ruleId: "core/description-quality",
          ruleName: "Tool Description Quality",
          category: "core",
          severity: "info",
          toolName: tool.name,
          filePath: tool.filePath,
          lineNumber: tool.lineNumber,
          message: `Tool "${tool.name}" has a bloated description (${desc.length} chars). Large tool schemas consume excessive LLM context window tokens on every turn.`,
          suggestedFix: `Trim description to essential facts and move lengthy tutorials to an MCP resource or prompt.`,
          fixable: false,
        });
      }
    }

    return findings;
  },
};
