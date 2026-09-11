import { Project, Node } from "ts-morph";
import type { Rule, Finding, RuleContext, FixContext, FixResult } from "../../types.js";
import { generateUnifiedDiff } from "../../utils/diff.js";

export const sentryBreadcrumbsRule: Rule = {
  id: "sentry/breadcrumbs",
  name: "Sentry Tool Invocation Breadcrumbs",
  description: "Ensures Sentry.addBreadcrumb is recorded when a tool is called to reconstruct agent execution trail",
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
      if (!tool.hasSentryBreadcrumb) {
        findings.push({
          ruleId: "sentry/breadcrumbs",
          ruleName: "Sentry Tool Invocation Breadcrumbs",
          category: "sentry",
          severity: "warn",
          toolName: tool.name,
          filePath: tool.filePath,
          lineNumber: tool.lineNumber,
          message: `Tool "${tool.name}" does not record a Sentry breadcrumb. Without breadcrumbs, debugging multi-step agent crashes is significantly harder.`,
          suggestedFix: `Add Sentry.addBreadcrumb({ category: "mcp.tool", message: "Executing tool: ${tool.name}", level: "info" }) at handler start.`,
          fixable: true,
        });
      }
    }

    return findings;
  },

  async fix(context: FixContext): Promise<FixResult[]> {
    const results: FixResult[] = [];
    const brokenTools = context.fingerprint.tools.filter((t) => !t.hasSentryBreadcrumb);
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
                    if (!body.getText().includes("addBreadcrumb")) {
                      body.insertStatements(
                        0,
                        `Sentry.addBreadcrumb({ category: "mcp.tool", message: "Invoking tool: ${toolName}", level: "info" });`
                      );
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
          ruleId: "sentry/breadcrumbs",
          fixed: true,
          description: `Injected Sentry.addBreadcrumb call into tool handlers in ${filePath}`,
          filePath,
          diff,
        });
      }
    }

    return results;
  },
};
