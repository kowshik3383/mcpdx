import path from "node:path";
import type { FixResult, FixContext } from "../types.js";
import { detectProject } from "../detector/index.js";
import { defaultRuleRegistry } from "../rules/registry.js";
import { loadDoctorConfig } from "../config.js";

export interface RunFixesOptions {
  projectDir?: string;
  dryRun?: boolean;
  ruleIds?: string[];
}

export async function runFixes(options: RunFixesOptions = {}): Promise<FixResult[]> {
  const projectDir = path.resolve(options.projectDir || process.cwd());
  const config = await loadDoctorConfig(projectDir);
  const fingerprint = detectProject(projectDir);

  const context: FixContext = {
    projectPath: projectDir,
    fingerprint,
    dryRun: options.dryRun,
    specificRuleIds: options.ruleIds,
  };

  const allRules = defaultRuleRegistry.getAll();
  const results: FixResult[] = [];

  for (const rule of allRules) {
    if (!rule.fix) continue;

    if (options.ruleIds && options.ruleIds.length > 0 && !options.ruleIds.includes(rule.id)) {
      continue;
    }

    // Check if detected
    if (rule.detect) {
      const isApplicable = await rule.detect(fingerprint);
      if (!isApplicable) continue;
    }

    try {
      const fixResults = await rule.fix(context);
      results.push(...fixResults);
    } catch (err: any) {
      results.push({
        ruleId: rule.id,
        fixed: false,
        description: `Failed to apply fix for ${rule.id}`,
        error: err?.message || String(err),
      });
    }
  }

  return results;
}
