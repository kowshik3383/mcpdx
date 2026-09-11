import { Project, Node } from "ts-morph";
import type { Rule, Finding, RuleContext, FixContext, FixResult } from "../../types.js";
import { generateUnifiedDiff } from "../../utils/diff.js";

export const sentryErrorCaptureRule: Rule = {
  id: "sentry/error-capture",
  name: "Sentry Tool Error Capture",
  description: "Ensures caught or unhandled tool exceptions are routed to Sentry.captureException()",
  category: "sentry",
  defaultSeverity: "error",

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
      if (!tool.hasSentryErrorCapture) {
        findings.push({
          ruleId: "sentry/error-capture",
          ruleName: "Sentry Tool Error Capture",
          category: "sentry",
          severity: "error",
          toolName: tool.name,
          filePath: tool.filePath,
          lineNumber: tool.lineNumber,
          message: `Tool "${tool.name}" handler does not forward failures to Sentry.captureException(). Tool errors will go unreported in Sentry error monitoring.`,
          suggestedFix: `Call Sentry.captureException(error) in the catch block of "${tool.name}".`,
          fixable: true,
        });
      }
    }

    return findings;
  },

  async fix(context: FixContext): Promise<FixResult[]> {
    const results: FixResult[] = [];
    const brokenTools = context.fingerprint.tools.filter((t) => !t.hasSentryErrorCapture);
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
                    // Check if there is already a try / catch
                    let injected = false;
                    body.forEachDescendant((sub) => {
                      if (Node.isCatchClause(sub) && !injected) {
                        const catchBlock = sub.getBlock();
                        const catchText = catchBlock.getText();
                        if (!catchText.includes("captureException")) {
                          const varName = sub.getVariableDeclaration()?.getName() || "error";
                          catchBlock.insertStatements(0, `Sentry.captureException(${varName});`);
                          injected = true;
                          modified = true;
                        }
                      }
                    });

                    // If no try/catch existed at all, wrap the body with try/catch containing Sentry.captureException
                    if (!injected && !body.getText().includes("captureException")) {
                      const inner = body.getStatements().map((s) => s.getText()).join("\n    ");
                      const wrapped = `{\n  try {\n    ${inner}\n  } catch (error: any) {\n    Sentry.captureException(error);\n    return { isError: true, content: [{ type: "text", text: String(error?.message || error) }] };\n  }\n}`;
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
          ruleId: "sentry/error-capture",
          fixed: true,
          description: `Added Sentry.captureException(error) to tool catch blocks in ${filePath}`,
          filePath,
          diff,
        });
      }
    }

    return results;
  },
};
