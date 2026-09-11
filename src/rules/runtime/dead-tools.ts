import type { Rule, Finding, RuleContext } from "../../types.js";

export const deadToolsRule: Rule = {
  id: "runtime/dead-tools",
  name: "Dead / Unused Tools",
  description: "Detects statically registered tools that are never invoked in runtime call logs",
  category: "runtime",
  defaultSeverity: "info",

  evaluate(context: RuleContext): Finding[] {
    const findings: Finding[] = [];
    const logs = context.logs;

    if (!logs || logs.length < 5) {
      // Need a minimal sample size of runtime calls before flagging dead tools
      return findings;
    }

    const invokedTools = new Set(logs.map((l) => l.tool));

    for (const tool of context.fingerprint.tools) {
      if (!invokedTools.has(tool.name)) {
        findings.push({
          ruleId: "runtime/dead-tools",
          ruleName: "Dead / Unused Tools",
          category: "runtime",
          severity: "info",
          toolName: tool.name,
          filePath: tool.filePath,
          lineNumber: tool.lineNumber,
          message: `Tool "${tool.name}" is registered in code but has 0 recorded invocations across ${logs.length} runtime calls. Unused tools clutter client prompt contexts.`,
          suggestedFix: `Evaluate if "${tool.name}" is obsolete, or improve its description so models know when to pick it.`,
          fixable: false,
        });
      }
    }

    return findings;
  },
};
