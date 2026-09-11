import { Project, Node } from "ts-morph";
import type { Rule, Finding, RuleContext, FixContext, FixResult } from "../../types.js";
import { generateUnifiedDiff } from "../../utils/diff.js";

export const sentryToolSpansRule: Rule = {
  id: "sentry/tool-spans",
  name: "Sentry Tool Handler Spans",
  description: "Ensures each MCP tool handler is wrapped in a Sentry.startSpan for latency tracing",
  category: "sentry",
  defaultSeverity: "warn",

  detect(fingerprint) {
    return fingerprint.integrations.sentry.installed || fingerprint.integrations.sentry.inUse;
  },

  evaluate(context: RuleContext): Finding[] {
    const findings: Finding[] = [];
    const sentry = context.fingerprint.integrations.sentry;

    if (!sentry.installed && !sentry.inUse) {
      return findings;
    }

    for (const tool of context.fingerprint.tools) {
      if (!tool.hasSentrySpan) {
        findings.push({
          ruleId: "sentry/tool-spans",
          ruleName: "Sentry Tool Handler Spans",
          category: "sentry",
          severity: "warn",
          toolName: tool.name,
          filePath: tool.filePath,
          lineNumber: tool.lineNumber,
          message: `Tool "${tool.name}" is not wrapped in Sentry.startSpan(). Uninstrumented tool calls are invisible in Sentry distributed traces.`,
          suggestedFix: `Wrap tool logic with Sentry.startSpan({ name: "mcp.tool.${tool.name}", op: "mcp.tool" }, async () => { ... }).`,
          fixable: true,
        });
      }
    }

    return findings;
  },

  async fix(context: FixContext): Promise<FixResult[]> {
    const results: FixResult[] = [];
    const brokenTools = context.fingerprint.tools.filter((t) => !t.hasSentrySpan);
    if (brokenTools.length === 0) return results;

    const filesToModify = new Set(brokenTools.map((t) => t.filePath));

    for (const filePath of filesToModify) {
      const project = new Project({ skipAddingFilesFromTsConfig: true });
      const sourceFile = project.addSourceFileAtPath(filePath);
      const originalCode = sourceFile.getFullText();
      let modified = false;

      // Ensure Sentry import
      if (!sourceFile.getFullText().includes("Sentry")) {
        sourceFile.insertStatements(0, 'import * as Sentry from "@sentry/node";\n');
        modified = true;
      }

      sourceFile.forEachDescendant((node) => {
        if (Node.isCallExpression(node)) {
          const expr = node.getExpression();
          if (Node.isPropertyAccessExpression(expr) && (expr.getName() === "tool" || expr.getName() === "registerTool")) {
            const args = node.getArguments();
            if (args.length >= 2) {
              const nameArg = args[0];
              const toolName = nameArg.getText().replace(/['"]/g, "");
              const isTarget = brokenTools.some((bt) => bt.name === toolName && bt.filePath === filePath);

              if (isTarget) {
                const handlerArg = args[args.length - 1];
                if (Node.isArrowFunction(handlerArg) || Node.isFunctionExpression(handlerArg)) {
                  const body = handlerArg.getBody();
                  if (Node.isBlock(body)) {
                    const text = body.getText();
                    if (!text.includes("startSpan")) {
                      const inner = body.getStatements().map((s) => s.getText()).join("\n    ");
                      const wrapped = `{\n  return await Sentry.startSpan(\n    { name: "mcp.tool.${toolName}", op: "mcp.tool" },\n    async () => {\n      ${inner}\n    }\n  );\n}`;
                      body.replaceWithText(wrapped);
                      modified = true;
                    }
                  }
                }
              }
            }
          }
        }
      });

      if (modified) {
        const newCode = sourceFile.getFullText();
        const diff = generateUnifiedDiff(filePath, originalCode, newCode);

        if (!context.dryRun) {
          sourceFile.saveSync();
        }

        results.push({
          ruleId: "sentry/tool-spans",
          fixed: true,
          description: `Wrapped tool handlers with Sentry.startSpan in ${filePath}`,
          filePath,
          diff,
        });
      }
    }

    return results;
  },
};
