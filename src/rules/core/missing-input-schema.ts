import type { Rule, Finding, RuleContext } from "../../types.js";

export const missingInputSchemaRule: Rule = {
  id: "core/missing-input-schema",
  name: "Missing Input Schema",
  description: "Detects tools registered without explicit input schema validation",
  category: "core",
  defaultSeverity: "warn",

  evaluate(context: RuleContext): Finding[] {
    const findings: Finding[] = [];

    for (const tool of context.fingerprint.tools) {
      if (!tool.hasInputSchema) {
        findings.push({
          ruleId: "core/missing-input-schema",
          ruleName: "Missing Input Schema",
          category: "core",
          severity: "warn",
          toolName: tool.name,
          filePath: tool.filePath,
          lineNumber: tool.lineNumber,
          message: `Tool "${tool.name}" is registered without input schema validation. Tools without schemas lead to hallucinations, type coercion bugs, and unvalidated arguments.`,
          suggestedFix: `Pass a Zod schema or JSON Schema object (e.g. z.object({ param: z.string() })) as the second argument to server.tool.`,
          fixable: false,
        });
      }
    }

    return findings;
  },
};
