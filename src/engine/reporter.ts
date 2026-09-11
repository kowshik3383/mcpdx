import pc from "picocolors";
import type { AuditReport, Finding, ProjectFingerprint, FixResult } from "../types.js";
import { formatColoredDiff } from "../utils/diff.js";

export function formatFingerprintReport(fp: ProjectFingerprint): string {
  const lines: string[] = [];

  lines.push(pc.bold(pc.cyan("🔍 MCP Project Fingerprint")));
  lines.push(pc.dim("━".repeat(60)));
  lines.push(`  ${pc.bold("Location:")}      ${fp.projectPath}`);
  lines.push(`  ${pc.bold("Package:")}       ${fp.packageName || "unnamed"} (v${fp.packageVersion || "unknown"})`);
  lines.push(`  ${pc.bold("MCP Detected:")}   ${fp.mcpDetected ? pc.green("Yes") : pc.yellow("No standard SDK detected")}`);
  if (fp.sdkVersion) {
    lines.push(`  ${pc.bold("MCP SDK:")}        ${fp.sdkVersion}`);
  }
  lines.push(
    `  ${pc.bold("Transports:")}     ${
      fp.transports.length > 0 ? fp.transports.map((t) => pc.cyan(t)).join(", ") : pc.dim("none detected")
    }`
  );

  lines.push(`  ${pc.bold("Integrations:")}`);
  const intEntries = [
    { name: "Sentry", item: fp.integrations.sentry },
    { name: "OpenTelemetry", item: fp.integrations.opentelemetry },
    { name: "Winston", item: fp.integrations.winston },
    { name: "Pino", item: fp.integrations.pino },
    { name: "Retries", item: fp.integrations.retries },
  ];

  for (const { name, item } of intEntries) {
    let status = pc.dim("not installed");
    if (item.installed && item.inUse) {
      status = pc.green(`installed & active (${item.name}@${item.version || "latest"})`);
    } else if (item.installed && !item.inUse) {
      status = pc.yellow(`installed but unused (${item.name}@${item.version || "latest"})`);
    } else if (!item.installed && item.inUse) {
      status = pc.magenta("code in use (missing from package.json)");
    }
    lines.push(`    • ${pc.bold(name)}: ${status}`);
  }

  lines.push(`  ${pc.bold("Registered Tools:")} ${fp.tools.length}`);
  for (const tool of fp.tools) {
    const badges: string[] = [];
    if (tool.hasInputSchema) badges.push(pc.green("schema:✓"));
    else badges.push(pc.yellow("schema:✗"));

    if (tool.hasErrorBoundary) badges.push(pc.green("try/catch:✓"));
    else badges.push(pc.red("try/catch:✗"));

    if (tool.hasTimeoutGuard) badges.push(pc.green("timeout:✓"));
    else badges.push(pc.dim("timeout:✗"));

    lines.push(`    - ${pc.bold(tool.name)} (${pc.dim(tool.filePath + ":" + tool.lineNumber)}) [${badges.join(" ")}]`);
  }

  lines.push(pc.dim("━".repeat(60)));
  return lines.join("\n");
}

export function formatTerminalReport(report: AuditReport): string {
  const lines: string[] = [];
  const { summary, findings } = report;
  const fp = summary.fingerprint;

  lines.push("");
  lines.push(pc.bold(pc.magenta("🩺 mcp-doctor — Completeness & Structural Audit")));
  lines.push(pc.dim("━".repeat(65)));
  lines.push(
    `Server: ${pc.bold(fp.packageName || pathBase(fp.projectPath))} | Tools: ${pc.bold(
      String(summary.toolsAnalyzed)
    )} | Transports: ${pc.cyan(fp.transports.join(", ") || "none")}`
  );
  if (report.runtimeLogsAnalyzed !== undefined && report.runtimeLogsAnalyzed > 0) {
    lines.push(`Runtime calls evaluated: ${pc.cyan(String(report.runtimeLogsAnalyzed))}`);
  }
  lines.push(pc.dim("━".repeat(65)));
  lines.push("");

  if (findings.length === 0) {
    lines.push(pc.green("✨ All MCP completeness and structural checks passed! No issues found."));
    lines.push("");
    return lines.join("\n");
  }

  const errors = findings.filter((f) => f.severity === "error");
  const warnings = findings.filter((f) => f.severity === "warn");
  const infos = findings.filter((f) => f.severity === "info");

  const printFinding = (f: Finding, icon: string, titleColor: (s: string) => string) => {
    const loc = f.filePath ? pc.dim(` (${pathBase(f.filePath)}${f.lineNumber ? `:${f.lineNumber}` : ""})`) : "";
    const toolBadge = f.toolName ? pc.magenta(`[tool: ${f.toolName}] `) : "";
    lines.push(`  ${icon} ${titleColor(pc.bold(f.ruleName))} ${toolBadge}${loc}`);
    lines.push(`     ${f.message}`);
    if (f.suggestedFix) {
      lines.push(`     ${pc.dim("Fix:")} ${pc.cyan(f.suggestedFix)}`);
    }
    if (f.fixable) {
      lines.push(`     ${pc.green("⚡ Auto-fix available: run 'npx @valipireddykowshik/mcpdx fix' or 'mcpdx fix'")}`);
    }
    lines.push("");
  };

  if (errors.length > 0) {
    lines.push(pc.bold(pc.red(`🔴 ERRORS (${errors.length})`)));
    lines.push(pc.dim("─".repeat(40)));
    for (const err of errors) {
      printFinding(err, pc.red("✖"), pc.red);
    }
  }

  if (warnings.length > 0) {
    lines.push(pc.bold(pc.yellow(`⚠️  WARNINGS (${warnings.length})`)));
    lines.push(pc.dim("─".repeat(40)));
    for (const warn of warnings) {
      printFinding(warn, pc.yellow("▲"), pc.yellow);
    }
  }

  if (infos.length > 0) {
    lines.push(pc.bold(pc.blue(`ℹ️  INFO / SUGGESTIONS (${infos.length})`)));
    lines.push(pc.dim("─".repeat(40)));
    for (const inf of infos) {
      printFinding(inf, pc.blue("ℹ"), pc.blue);
    }
  }

  lines.push(pc.dim("━".repeat(65)));
  const summaryParts: string[] = [];
  if (summary.errors > 0) summaryParts.push(pc.red(pc.bold(`${summary.errors} error(s)`)));
  if (summary.warnings > 0) summaryParts.push(pc.yellow(pc.bold(`${summary.warnings} warning(s)`)));
  if (summary.info > 0) summaryParts.push(pc.blue(pc.bold(`${summary.info} info`)));

  lines.push(`Summary: ${summaryParts.join(" | ")} across ${summary.toolsAnalyzed} registered tool(s)`);
  lines.push("");

  // Actionable Next Steps Box
  const fixableCount = findings.filter((f) => f.fixable).length;
  lines.push(pc.bold(pc.cyan("💡 Actionable Next Steps:")));
  if (fixableCount > 0) {
    lines.push(
      `  • ${pc.green("Apply Automated Fixes:")} ${pc.bold("npx @valipireddykowshik/mcpdx fix")} (${fixableCount} issue${fixableCount > 1 ? "s" : ""} can be patched automatically)`
    );
    lines.push(
      `  • ${pc.dim("Preview Diff Only:")}     npx @valipireddykowshik/mcpdx fix --dry-run`
    );
  }
  if (summary.warnings > 0) {
    lines.push(
      `  • ${pc.yellow("Fix Timeout Warnings:")} Pass AbortSignal or wrap handlers with AbortSignal.timeout(30000) to avoid client freezes.`
    );
  }
  if (!report.runtimeLogsAnalyzed) {
    lines.push(
      `  • ${pc.blue("Behavioral Audit:")}     Run 'npx @valipireddykowshik/mcpdx init' to enable runtime call logging for dead tool & loop detection.`
    );
  }
  lines.push("");

  return lines.join("\n");
}

export function formatJsonReport(report: AuditReport): string {
  return JSON.stringify(report, null, 2);
}

export function formatFixReport(results: FixResult[], dryRun: boolean): string {
  const lines: string[] = [];
  lines.push("");
  lines.push(pc.bold(dryRun ? pc.cyan("🔎 Dry-Run Fix Preview") : pc.green("⚡ Applied Automated Fixes")));
  lines.push(pc.dim("━".repeat(65)));

  if (results.length === 0) {
    lines.push(pc.dim("No fixes were needed or eligible for the specified criteria."));
    lines.push("");
    return lines.join("\n");
  }

  for (const res of results) {
    if (res.fixed) {
      lines.push(`${pc.green("✔")} [${pc.bold(res.ruleId)}] ${res.description}`);
      if (res.diff) {
        lines.push(pc.dim("─".repeat(50)));
        lines.push(formatColoredDiff(res.diff));
        lines.push(pc.dim("─".repeat(50)));
      }
    } else {
      lines.push(`${pc.red("✖")} [${pc.bold(res.ruleId)}] ${res.description}`);
      if (res.error) {
        lines.push(`   ${pc.red(res.error)}`);
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}

function pathBase(fullPath: string): string {
  return fullPath.split(/[\/\\]/).pop() || fullPath;
}
