import type { Rule, Finding, RuleContext } from "../../types.js";

function calculatePercentile(values: number[], percentile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

export const slowToolsRule: Rule = {
  id: "runtime/slow-tools",
  name: "Slow Tool Invocations (p95 Outliers)",
  description: "Flags tools with high p95 latency that degrade LLM response times",
  category: "runtime",
  defaultSeverity: "warn",

  evaluate(context: RuleContext): Finding[] {
    const findings: Finding[] = [];
    const logs = context.logs;

    if (!logs || logs.length === 0) {
      return findings;
    }

    const toolDurations = new Map<string, number[]>();
    for (const log of logs) {
      if (!toolDurations.has(log.tool)) {
        toolDurations.set(log.tool, []);
      }
      toolDurations.get(log.tool)!.push(log.durationMs);
    }

    const latencyThresholdMs = context.options?.slowThresholdMs || 3000;

    for (const [toolName, durations] of toolDurations.entries()) {
      if (durations.length < 2) continue;

      const p95 = calculatePercentile(durations, 95);
      const median = calculatePercentile(durations, 50);

      if (p95 > latencyThresholdMs) {
        findings.push({
          ruleId: "runtime/slow-tools",
          ruleName: "Slow Tool Invocations (p95 Outliers)",
          category: "runtime",
          severity: "warn",
          toolName,
          message: `Tool "${toolName}" has a high p95 latency of ${p95}ms (median: ${median}ms across ${durations.length} calls). Slow tools freeze agent workflows and can cause client timeouts.`,
          suggestedFix: `Optimize underlying database queries, external API requests, or cache frequent operations.`,
          fixable: false,
        });
      }
    }

    return findings;
  },
};
