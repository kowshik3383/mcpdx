import type { Rule, Finding, RuleContext } from "../../types.js";

export const duplicateCallsRule: Rule = {
  id: "runtime/duplicate-calls",
  name: "Repeated Identical Tool Calls",
  description: "Detects identical tool calls (same tool and argsHash) within the same session",
  category: "runtime",
  defaultSeverity: "warn",

  evaluate(context: RuleContext): Finding[] {
    const findings: Finding[] = [];
    const logs = context.logs;

    if (!logs || logs.length === 0) {
      return findings;
    }

    // Group logs by sessionId or global sequence
    const sessionMap = new Map<string, typeof logs>();
    for (const log of logs) {
      const sess = log.sessionId || "default-session";
      if (!sessionMap.has(sess)) {
        sessionMap.set(sess, []);
      }
      sessionMap.get(sess)!.push(log);
    }

    for (const [sessionId, sessionLogs] of sessionMap.entries()) {
      const callCounts = new Map<string, { tool: string; argsHash: string; count: number }>();

      for (const log of sessionLogs) {
        const key = `${log.tool}::${log.argsHash}`;
        const existing = callCounts.get(key);
        if (existing) {
          existing.count++;
        } else {
          callCounts.set(key, { tool: log.tool, argsHash: log.argsHash, count: 1 });
        }
      }

      for (const [_, item] of callCounts.entries()) {
        if (item.count >= 2) {
          findings.push({
            ruleId: "runtime/duplicate-calls",
            ruleName: "Repeated Identical Tool Calls",
            category: "runtime",
            severity: "warn",
            toolName: item.tool,
            message: `Tool "${item.tool}" was invoked ${item.count} times with identical arguments in session "${sessionId}". This typically indicates an agent looping or failing to receive a conclusive response.`,
            suggestedFix: `Check if tool response contains unambiguous termination hints, or implement idempotency / client-side result caching.`,
            fixable: false,
          });
        }
      }
    }

    return findings;
  },
};
