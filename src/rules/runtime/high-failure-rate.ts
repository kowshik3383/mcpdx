import type { Rule, Finding, RuleContext } from "../../types.js";

export const highFailureRateRule: Rule = {
  id: "runtime/high-failure-rate",
  name: "High Tool Failure Rate",
  description: "Detects tools with a failure rate above acceptable thresholds in call logs",
  category: "runtime",
  defaultSeverity: "error",

  evaluate(context: RuleContext): Finding[] {
    const findings: Finding[] = [];
    const logs = context.logs;

    if (!logs || logs.length === 0) {
      return findings;
    }

    const stats = new Map<string, { total: number; failed: number; errors: string[] }>();

    for (const log of logs) {
      if (!stats.has(log.tool)) {
        stats.set(log.tool, { total: 0, failed: 0, errors: [] });
      }
      const entry = stats.get(log.tool)!;
      entry.total++;
      if (!log.success) {
        entry.failed++;
        if (log.error && entry.errors.length < 3) {
          entry.errors.push(log.error);
        }
      }
    }

    const thresholdPercent = context.options?.failureRateThreshold || 20;

    for (const [toolName, data] of stats.entries()) {
      if (data.total >= 3) {
        const failureRate = Math.round((data.failed / data.total) * 100);
        if (failureRate >= thresholdPercent) {
          const sampleErrors = data.errors.length > 0 ? ` (e.g. "${data.errors[0]}")` : "";
          findings.push({
            ruleId: "runtime/high-failure-rate",
            ruleName: "High Tool Failure Rate",
            category: "runtime",
            severity: "error",
            toolName,
            message: `Tool "${toolName}" has a high failure rate of ${failureRate}% (${data.failed}/${data.total} failed)${sampleErrors}. Unreliable tools break agent planning steps.`,
            suggestedFix: `Inspect error logs, validate input arguments before handling, and ensure third-party services are reachable.`,
            fixable: false,
          });
        }
      }
    }

    return findings;
  },
};
