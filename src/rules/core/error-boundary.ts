import { Project, Node, SyntaxKind } from "ts-morph";
import type { Rule, Finding, RuleContext, FixContext, FixResult } from "../../types.js";
import { generateUnifiedDiff } from "../../utils/diff.js";

export const errorBoundaryRule: Rule = {
  id: "core/error-boundary",
  name: "Tool Error Boundary",
  description: "Ensures tool handlers have try/catch error handling to prevent server crashes",
  category: "core",
  defaultSeverity: "error",

  evaluate(context: RuleContext): Finding[] {
    const findings: Finding[] = [];

    for (const tool of context.fingerprint.tools) {
      if (!tool.hasErrorBoundary) {
        findings.push({
          ruleId: "core/error-boundary",
          ruleName: "Tool Error Boundary",
          category: "core",
          severity: "error",
          toolName: tool.name,
          filePath: tool.filePath,
          lineNumber: tool.lineNumber,
          message: `Tool "${tool.name}" handler body does not contain a try/catch error boundary. An unhandled exception will crash or drop the JSON-RPC connection.`,
          suggestedFix: `Wrap tool handler execution in a try/catch block returning { isError: true, content: [{ type: "text", text: error.message }] }.`,
          fixable: true,
        });
      }
    }

    return findings;
  },

  async fix(context: FixContext): Promise<FixResult[]> {
    const results: FixResult[] = [];
    const brokenTools = context.fingerprint.tools.filter((t) => !t.hasErrorBoundary);
    if (brokenTools.length === 0) return results;

    const filesToModify = new Set(brokenTools.map((t) => t.filePath));

    for (const filePath of filesToModify) {
      const project = new Project({ skipAddingFilesFromTsConfig: true });
      const sourceFile = project.addSourceFileAtPath(filePath);
      const originalCode = sourceFile.getFullText();
      let modified = false;

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
                  // If body is a block
                  if (Node.isBlock(body)) {
                    const hasTry = body.getStatements().some((s) => Node.isTryStatement(s));
                    if (!hasTry) {
                      const bodyText = body.getStatements().map((s) => s.getText()).join("\n    ");
                      const wrappedBody = `{\n  try {\n    ${bodyText}\n  } catch (error: any) {\n    return { isError: true, content: [{ type: "text", text: String(error?.message || error) }] };\n  }\n}`;
                      body.replaceWithText(wrappedBody);
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
          ruleId: "core/error-boundary",
          fixed: true,
          description: `Wrapped tool handlers in try/catch error boundaries in ${filePath}`,
          filePath,
          diff,
        });
      }
    }

    return results;
  },
};
