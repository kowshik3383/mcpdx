#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { Command } from "commander";
import pc from "picocolors";
import { detectProject } from "./detector/index.js";
import { runChecks } from "./engine/runner.js";
import { runFixes } from "./engine/fixer.js";
import {
  formatFingerprintReport,
  formatTerminalReport,
  formatJsonReport,
  formatFixReport,
} from "./engine/reporter.js";

const program = new Command();

program
  .name("mcp-doctor")
  .description("Opinionated completeness auditor and runtime linter for MCP servers")
  .version("0.1.0");

function checkMcpPresence(fingerprint: ReturnType<typeof detectProject>, force?: boolean): boolean {
  if (!fingerprint.mcpDetected && fingerprint.tools.length === 0 && !force) {
    console.log(pc.yellow("⚠️  No MCP server or tools detected in this directory."));
    console.log(
      pc.dim(
        "   We looked for @modelcontextprotocol/sdk in package.json, Server / McpServer instantiations, and server.tool() definitions.\n" +
        "   If this is an MCP repository, make sure you are in the project root, or re-run with --force."
      )
    );
    return false;
  }
  return true;
}

// Subcommand 1: detect
program
  .command("detect [directory]")
  .description("Detect and fingerprint installed MCP SDK, transports, and integrations")
  .option("--json", "Output fingerprint as raw JSON")
  .option("-f, --force", "Run detection even if no standard MCP indicators are found")
  .action((dir, options) => {
    const targetDir = path.resolve(dir || ".");
    const fp = detectProject(targetDir);

    if (options.json) {
      console.log(JSON.stringify(fp, null, 2));
      return;
    }

    if (!checkMcpPresence(fp, options.force)) {
      process.exitCode = 0;
      return;
    }

    console.log(formatFingerprintReport(fp));
  });

// Subcommand 2: check
program
  .command("check [directory]")
  .description("Audit MCP server static schema and runtime call logs for completeness and bugs")
  .option("-l, --logs <path>", "Path to runtime call log (.jsonl)")
  .option("--json", "Output audit report as JSON for CI/CD pipelines")
  .option("-r, --rule <ruleId>", "Run a single specific rule by id")
  .option("-c, --category <name>", "Filter rules by category (core, runtime, sentry)")
  .option("-f, --force", "Run audit even if no standard MCP SDK was detected")
  .action(async (dir, options) => {
    const targetDir = path.resolve(dir || ".");
    const fp = detectProject(targetDir);

    if (!checkMcpPresence(fp, options.force)) {
      process.exitCode = 0;
      return;
    }

    const report = await runChecks({
      projectDir: targetDir,
      logsPath: options.logs,
      filterRules: options.rule ? [options.rule] : undefined,
      filterCategories: options.category ? [options.category] : undefined,
    });

    if (options.json) {
      console.log(formatJsonReport(report));
    } else {
      console.log(formatTerminalReport(report));
    }

    // Exit code convention:
    // 0 = clean
    // 1 = warnings only
    // 2 = errors
    if (report.summary.errors > 0) {
      process.exitCode = 2;
    } else if (report.summary.warnings > 0) {
      process.exitCode = 1;
    } else {
      process.exitCode = 0;
    }
  });

// Subcommand 3: fix
program
  .command("fix [directory]")
  .description("Automatically patch missing integrations and handlers using ts-morph codemods")
  .option("-d, --dry-run", "Preview diffs without modifying files on disk")
  .option("-y, --yes", "Apply all fixes without interactive prompt")
  .option("-a, --all", "Apply all eligible fixes")
  .option("-r, --rule <ruleId>", "Apply fix for a specific rule only")
  .option("-f, --force", "Proceed even if MCP server detection was negative")
  .action(async (dir, options) => {
    const targetDir = path.resolve(dir || ".");
    const fp = detectProject(targetDir);

    if (!checkMcpPresence(fp, options.force)) {
      process.exitCode = 0;
      return;
    }

    const shouldApply = options.yes || options.all || options.dryRun;

    if (!shouldApply && process.stdin.isTTY) {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const answer = await new Promise<string>((resolve) => {
        rl.question(
          pc.bold(pc.cyan("Apply recommended automated fixes to this project? [y/N]: ")),
          (ans) => {
            rl.close();
            resolve(ans.trim().toLowerCase());
          }
        );
      });

      if (answer !== "y" && answer !== "yes") {
        console.log(pc.dim("Aborted without making changes."));
        return;
      }
    }

    const results = await runFixes({
      projectDir: targetDir,
      dryRun: Boolean(options.dryRun),
      ruleIds: options.rule ? [options.rule] : undefined,
    });

    console.log(formatFixReport(results, Boolean(options.dryRun)));
  });

// Subcommand 4: init
program
  .command("init [directory]")
  .description("Scaffold mcpdoctor.config.js and runtime logging directories in an MCP project")
  .action((dir) => {
    const targetDir = path.resolve(dir || ".");
    const configPath = path.join(targetDir, "mcpdoctor.config.js");
    const mcpDoctorDir = path.join(targetDir, ".mcpdoctor");

    console.log(pc.bold(pc.magenta("🚀 Initializing mcp-doctor configuration...")));

    if (!fs.existsSync(mcpDoctorDir)) {
      fs.mkdirSync(mcpDoctorDir, { recursive: true });
      const sampleGitIgnore = path.join(mcpDoctorDir, ".gitignore");
      fs.writeFileSync(sampleGitIgnore, "# Ignore runtime logs\ncalls.jsonl\n", "utf8");
      console.log(`  ${pc.green("✔")} Created directory: ${pc.cyan(".mcpdoctor/")}`);
    }

    if (!fs.existsSync(configPath)) {
      const configTemplate = `// @ts-check
/** @type {import('mcp-doctor').DoctorConfig} */
export default {
  rules: {
    // Core rules
    "core/duplicate-tools": "error",
    "core/description-quality": "warn",
    "core/missing-input-schema": "warn",
    "core/error-boundary": "error",
    "core/timeout-guard": "warn",

    // Runtime behavioral rules (cross-referenced with .mcpdoctor/calls.jsonl)
    "runtime/duplicate-calls": "warn",
    "runtime/dead-tools": "info",
    "runtime/slow-tools": "warn",
    "runtime/high-failure-rate": "error",

    // Integration packs
    "sentry/init-config": "error",
    "sentry/tool-spans": "warn",
    "sentry/error-capture": "error",
    "sentry/breadcrumbs": "warn",
  },
  logs: ".mcpdoctor/calls.jsonl",
  ignorePatterns: ["node_modules", "dist", ".git"],
};
`;
      fs.writeFileSync(configPath, configTemplate, "utf8");
      console.log(`  ${pc.green("✔")} Created config: ${pc.cyan("mcpdoctor.config.js")}`);
    } else {
      console.log(`  ${pc.dim("•")} Config file already exists at ${pc.cyan("mcpdoctor.config.js")}`);
    }

    console.log("");
    console.log(pc.bold("Next steps:"));
    console.log(`  1. Wrap your server with the optional telemetry middleware:`);
    console.log(
      pc.cyan(`     import { withDoctorLogging } from "mcp-doctor";\n     const server = withDoctorLogging(new McpServer(...));`)
    );
    console.log(`  2. Run completeness audit anytime with:`);
    console.log(pc.cyan(`     npx mcp-doctor check`));
    console.log("");
  });

program.parse();
