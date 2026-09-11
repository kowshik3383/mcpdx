import type { Rule, Finding, RuleContext } from "../../types.js";

export const unreferencedToolRule: Rule = {
  id: "core/unreferenced-tool",
  name: "Unreferenced Tool Registration",
  description: "Flags tools that have zero references elsewhere in test files, client configs, or docs",
  category: "core",
  defaultSeverity: "info",

  evaluate(context: RuleContext): Finding[] {
    const findings: Finding[] = [];

    // Only evaluate if there are multiple source/test files in the project
    if (context.fingerprint.sourceFiles.length <= 1) {
      return findings;
    }

    for (const tool of context.fingerprint.tools) {
      if (!tool.isReferencedElsewhere) {
        findings.push({
          ruleId: "core/unreferenced-tool",
          ruleName: "Unreferenced Tool Registration",
          category: "core",
          severity: "info",
          toolName: tool.name,
          filePath: tool.filePath,
          lineNumber: tool.lineNumber,
          message: `Tool "${tool.name}" is registered but not referenced in any tests, exports, or other project files.`,
          suggestedFix: `Add an automated test verifying "${tool.name}" or document it in your tool catalog.`,
          fixable: false,
        });
      }
    }

    return findings;
  },
};
