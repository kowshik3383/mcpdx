import type { Rule, Finding, RuleContext } from "../../types.js";

export const timeoutGuardRule: Rule = {
  id: "core/timeout-guard",
  name: "Tool Timeout Guard",
  description: "Detects asynchronous tool handlers lacking timeout protection",
  category: "core",
  defaultSeverity: "warn",

  evaluate(context: RuleContext): Finding[] {
    const findings: Finding[] = [];

    for (const tool of context.fingerprint.tools) {
      if (!tool.hasTimeoutGuard) {
        findings.push({
          ruleId: "core/timeout-guard",
          ruleName: "Tool Timeout Guard",
          category: "core",
          severity: "warn",
          toolName: tool.name,
          filePath: tool.filePath,
          lineNumber: tool.lineNumber,
          message: `Tool "${tool.name}" handler does not have a timeout guard or AbortSignal handling. Unbounded network or database calls can hang LLM clients indefinitely.`,
          suggestedFix: `Pass extra.signal to fetch/subprocesses, or wrap handler execution with AbortSignal.timeout(30000) / Promise.race.`,
          fixable: false,
        });
      }
    }

    return findings;
  },
};
