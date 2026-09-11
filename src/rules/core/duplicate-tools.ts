import type { Rule, Finding, RuleContext } from "../../types.js";

export const duplicateToolsRule: Rule = {
  id: "core/duplicate-tools",
  name: "Duplicate Tool Names",
  description: "Detects duplicate tool registrations across the MCP server",
  category: "core",
  defaultSeverity: "error",

  evaluate(context: RuleContext): Finding[] {
    const findings: Finding[] = [];
    const counts = new Map<string, { count: number; locations: Array<{ file: string; line: number }> }>();

    for (const tool of context.fingerprint.tools) {
      const existing = counts.get(tool.name);
      if (existing) {
        existing.count++;
        existing.locations.push({ file: tool.filePath, line: tool.lineNumber });
      } else {
        counts.set(tool.name, {
          count: 1,
          locations: [{ file: tool.filePath, line: tool.lineNumber }],
        });
      }
    }

    for (const [toolName, data] of counts.entries()) {
      if (data.count > 1) {
        const locationsStr = data.locations
          .map((loc) => `${loc.file}:${loc.line}`)
          .join(", ");
        findings.push({
          ruleId: "core/duplicate-tools",
          ruleName: "Duplicate Tool Names",
          category: "core",
          severity: "error",
          toolName,
          filePath: data.locations[0].file,
          lineNumber: data.locations[0].line,
          message: `Tool "${toolName}" is registered ${data.count} times across the server (${locationsStr}). Tool names in MCP must be unique.`,
          suggestedFix: `Rename duplicate tool registrations to ensure each tool identifier is unique.`,
          fixable: false,
        });
      }
    }

    return findings;
  },
};
