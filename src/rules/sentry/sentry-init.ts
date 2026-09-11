import { Project, Node, ObjectLiteralExpression } from "ts-morph";
import type { Rule, Finding, RuleContext, FixContext, FixResult } from "../../types.js";
import { generateUnifiedDiff } from "../../utils/diff.js";

export const sentryInitRule: Rule = {
  id: "sentry/init-config",
  name: "Sentry Initialization & Configuration",
  description: "Verifies Sentry.init() is called with standard keys (dsn, environment, release)",
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

    const details = sentry.details;
    if (!details?.hasInit) {
      findings.push({
        ruleId: "sentry/init-config",
        ruleName: "Sentry Initialization & Configuration",
        category: "sentry",
        severity: "error",
        message: `Sentry is installed (${sentry.name}@${sentry.version || "latest"}), but Sentry.init() is never called in the codebase.`,
        suggestedFix: `Add Sentry.init({ dsn: process.env.SENTRY_DSN, environment: process.env.NODE_ENV || "production", release: process.env.npm_package_version }) in your server entrypoint.`,
        filePath: context.fingerprint.sourceFiles[0],
        fixable: true,
      });
      return findings;
    }

    const requiredKeys = ["dsn", "environment", "release"];
    const missingKeys = requiredKeys.filter((k) => !details.initKeys.includes(k));

    if (missingKeys.length > 0) {
      findings.push({
        ruleId: "sentry/init-config",
        ruleName: "Sentry Initialization & Configuration",
        category: "sentry",
        severity: "warn",
        filePath: details.initFilePath,
        lineNumber: details.initLineNumber,
        message: `Sentry.init() is missing standard configuration key(s): ${missingKeys.join(", ")}. Incomplete config leads to untagged releases and unmapped environments.`,
        suggestedFix: `Configure ${missingKeys.map((k) => `${k}: ...`).join(", ")} in Sentry.init({...}).`,
        fixable: true,
      });
    }

    return findings;
  },

  async fix(context: FixContext): Promise<FixResult[]> {
    const results: FixResult[] = [];
    const sentry = context.fingerprint.integrations.sentry;
    const details = sentry.details;

    if (!details?.hasInit && context.fingerprint.sourceFiles.length > 0) {
      // Sentry.init is completely missing: add to first source file (entrypoint)
      const entryPath = context.fingerprint.sourceFiles[0];
      const project = new Project({ skipAddingFilesFromTsConfig: true });
      const sourceFile = project.addSourceFileAtPath(entryPath);
      const originalCode = sourceFile.getFullText();

      // Add import if not present
      if (!originalCode.includes("import * as Sentry") && !originalCode.includes('require("@sentry/node")')) {
        sourceFile.insertStatements(0, 'import * as Sentry from "@sentry/node";\n');
      }

      // Add Sentry.init block
      const initCode = `\nSentry.init({\n  dsn: process.env.SENTRY_DSN,\n  environment: process.env.NODE_ENV || "development",\n  release: process.env.npm_package_version || "1.0.0",\n});\n`;
      sourceFile.insertStatements(1, initCode);

      const newCode = sourceFile.getFullText();
      const diff = generateUnifiedDiff(entryPath, originalCode, newCode);

      if (!context.dryRun) {
        sourceFile.saveSync();
      }

      results.push({
        ruleId: "sentry/init-config",
        fixed: true,
        description: `Injected Sentry.init() configuration block into ${entryPath}`,
        filePath: entryPath,
        diff,
      });
      return results;
    }

    if (details?.hasInit && details.initFilePath) {
      const filePath = details.initFilePath;
      const project = new Project({ skipAddingFilesFromTsConfig: true });
      const sourceFile = project.addSourceFileAtPath(filePath);
      const originalCode = sourceFile.getFullText();
      let modified = false;

      sourceFile.forEachDescendant((node) => {
        if (Node.isCallExpression(node)) {
          const expr = node.getExpression();
          if (expr.getText() === "Sentry.init" || expr.getText().endsWith(".Sentry.init")) {
            const args = node.getArguments();
            if (args.length > 0 && Node.isObjectLiteralExpression(args[0])) {
              const obj = args[0] as ObjectLiteralExpression;
              const existingPropNames = obj.getProperties().map((p) => {
                if (Node.isPropertyAssignment(p) || Node.isShorthandPropertyAssignment(p)) {
                  return p.getName();
                }
                return "";
              });

              if (!existingPropNames.includes("environment")) {
                obj.addPropertyAssignment({
                  name: "environment",
                  initializer: 'process.env.NODE_ENV || "development"',
                });
                modified = true;
              }
              if (!existingPropNames.includes("release")) {
                obj.addPropertyAssignment({
                  name: "release",
                  initializer: 'process.env.npm_package_version || "1.0.0"',
                });
                modified = true;
              }
              if (!existingPropNames.includes("dsn")) {
                obj.addPropertyAssignment({
                  name: "dsn",
                  initializer: "process.env.SENTRY_DSN",
                });
                modified = true;
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
          ruleId: "sentry/init-config",
          fixed: true,
          description: `Added missing keys (dsn, environment, release) to Sentry.init() in ${filePath}`,
          filePath,
          diff,
        });
      }
    }

    return results;
  },
};
