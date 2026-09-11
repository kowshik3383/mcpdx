import path from "node:path";
import fs from "node:fs";
import type { AuditReport, Finding, RuleContext, DoctorConfig } from "../types.js";
import { detectProject } from "../detector/index.js";
import { defaultRuleRegistry } from "../rules/registry.js";
import { parseRuntimeLogs } from "../rules/runtime/log-parser.js";
import { loadDoctorConfig } from "../config.js";

export interface RunChecksOptions {
  projectDir?: string;
  logsPath?: string;
  config?: DoctorConfig;
  filterRules?: string[];
  filterCategories?: string[];
}

export async function runChecks(options: RunChecksOptions = {}): Promise<AuditReport> {
  const projectDir = path.resolve(options.projectDir || process.cwd());
  const config = options.config || (await loadDoctorConfig(projectDir));

  const fingerprint = detectProject(projectDir);

  // Load runtime logs if provided or if present in default location
  let logsPath = options.logsPath;
  if (!logsPath && config.logs) {
    const candidate = path.resolve(projectDir, config.logs);
    if (fs.existsSync(candidate)) {
      logsPath = candidate;
    }
  }

  const logs = logsPath ? parseRuntimeLogs(logsPath) : [];

  const context: RuleContext = {
    projectPath: projectDir,
    fingerprint,
    logs,
  };

  const allRules = defaultRuleRegistry.getAll();
  const findings: Finding[] = [];

  for (const rule of allRules) {
    // Check command line filters
    if (options.filterRules && !options.filterRules.includes(rule.id)) {
      continue;
    }
    if (options.filterCategories && !options.filterCategories.includes(rule.category)) {
      continue;
    }

    // Check config severity override
    const ruleConfig = config.rules?.[rule.id];
    let configSeverity = typeof ruleConfig === "string" ? ruleConfig : ruleConfig?.severity;
    if (configSeverity === "off") {
      continue;
    }

    // Check detection condition
    if (rule.detect) {
      const isApplicable = await rule.detect(fingerprint);
      if (!isApplicable) {
        continue;
      }
    }

    // Evaluate rule
    try {
      const ruleFindings = await rule.evaluate(context);
      for (const finding of ruleFindings) {
        if (configSeverity && (configSeverity === "error" || configSeverity === "warn")) {
          finding.severity = configSeverity;
        }
        findings.push(finding);
      }
    } catch (err) {
      console.warn(`[mcp-doctor] Warning: Error evaluating rule "${rule.id}":`, err);
    }
  }

  const errors = findings.filter((f) => f.severity === "error").length;
  const warnings = findings.filter((f) => f.severity === "warn").length;
  const info = findings.filter((f) => f.severity === "info").length;

  return {
    summary: {
      totalFindings: findings.length,
      errors,
      warnings,
      info,
      toolsAnalyzed: fingerprint.tools.length,
      fingerprint,
    },
    findings,
    timestamp: new Date().toISOString(),
    runtimeLogsAnalyzed: logs.length,
  };
}
