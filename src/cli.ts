#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { Command } from "commander";
import pc from "picocolors";
import * as p from "@clack/prompts";
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
  .name("mcpdx")
  .description("Opinionated completeness auditor and runtime linter for MCP servers")
  .version("0.1.1");

function checkMcpPresence(fingerprint: ReturnType<typeof detectProject>, force?: boolean): boolean {
  if (!fingerprint.mcpDetected && fingerprint.tools.length === 0 && !force) {
    p.note(
      "We looked for @modelcontextprotocol/sdk in package.json, Server / McpServer instantiations, and server.tool() definitions.\nIf this is an MCP repository, ensure you are in the project root, or re-run with --force.",
      "⚠️ No MCP server or tools detected"
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
    // 0 = clean, 1 = warnings only, 2 = errors
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

    // Step 1: Run dry-run to discover candidate fixes
    const previewFixes = await runFixes({
      projectDir: targetDir,
      dryRun: true,
      ruleIds: options.rule ? [options.rule] : undefined,
    });

    if (previewFixes.length === 0) {
      console.log(pc.cyan("ℹ No auto-fixable issues were detected in this MCP server."));
      return;
    }

    console.log(formatFixReport(previewFixes, true));

    if (options.dryRun) {
      console.log(pc.dim("Dry-run preview complete. To write these changes to disk, run:"));
      console.log(pc.bold(pc.green("  npx @valipireddykowshik/mcpdx fix\n")));
      return;
    }

    let shouldApply = Boolean(options.yes || options.all);

    if (!shouldApply) {
      if (process.stdin.isTTY) {
        p.intro(pc.bgMagenta(pc.black(" ⚡ mcpdx Auto-Fix Wizard ")));

        const proceed = await p.confirm({
          message: `Found ${previewFixes.length} fixable issue(s). Apply these changes to your code files now?`,
          initialValue: true,
        });

        if (p.isCancel(proceed) || !proceed) {
          p.cancel("Fix aborted. No files were modified.");
          return;
        }
        shouldApply = true;
      } else {
        shouldApply = true;
      }
    }

    if (shouldApply) {
      const liveFixes = await runFixes({
        projectDir: targetDir,
        dryRun: false,
        ruleIds: options.rule ? [options.rule] : undefined,
      });

      console.log(formatFixReport(liveFixes, false));
      console.log(pc.bold(pc.green("✔ All changes successfully written to disk! Run 'mcpdx check' to verify.\n")));
    }
  });

// Subcommand 4: init
program
  .command("init [directory]")
  .description("Scaffold mcpdoctor.config.js and runtime logging directories in an MCP project")
  .option("-y, --yes", "Skip interactive prompts and apply defaults")
  .action(async (dir, options) => {
    const targetDir = path.resolve(dir || ".");
    const configPath = path.join(targetDir, "mcpdoctor.config.js");
    const mcpDoctorDir = path.join(targetDir, ".mcpdoctor");

    let createConfig = true;
    let createLogging = true;

    if (process.stdin.isTTY && !options.yes) {
      p.intro(pc.bgMagenta(pc.black(" 🚀 mcpdx Setup Wizard ")));

      const configAns = await p.confirm({
        message: "Scaffold mcpdoctor.config.js for custom rule configuration?",
        initialValue: true,
      });

      if (p.isCancel(configAns)) {
        p.cancel("Setup cancelled.");
        return;
      }
      createConfig = Boolean(configAns);

      const loggingAns = await p.confirm({
        message: "Enable runtime telemetry directory (.mcpdoctor/) to track dead tools & latency?",
        initialValue: true,
      });

      if (p.isCancel(loggingAns)) {
        p.cancel("Setup cancelled.");
        return;
      }
      createLogging = Boolean(loggingAns);
    }

    if (createLogging && !fs.existsSync(mcpDoctorDir)) {
      fs.mkdirSync(mcpDoctorDir, { recursive: true });
      const sampleGitIgnore = path.join(mcpDoctorDir, ".gitignore");
      fs.writeFileSync(sampleGitIgnore, "# Ignore runtime logs\ncalls.jsonl\n", "utf8");
      console.log(`  ${pc.green("✔")} Created directory: ${pc.cyan(".mcpdoctor/")}`);
    }

    if (createConfig) {
      if (!fs.existsSync(configPath)) {
        const configTemplate = `// @ts-check
/** @type {import('@valipireddykowshik/mcpdx').DoctorConfig} */
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
        console.log(`  ${pc.dim("•")} Config already exists at ${pc.cyan("mcpdoctor.config.js")}`);
      }
    }

    console.log("");
    console.log(pc.bold("Next steps:"));
    console.log(`  1. Wrap your server with telemetry logging:`);
    console.log(
      pc.cyan(`     import { withDoctorLogging } from "@valipireddykowshik/mcpdx";\n     const server = withDoctorLogging(new McpServer(...));`)
    );
    console.log(`  2. Audit anytime with:`);
    console.log(pc.cyan(`     npx @valipireddykowshik/mcpdx check`));
    console.log("");
  });

// Root interactive wizard when executed with no arguments
program.action(async () => {
  p.intro(pc.bgMagenta(pc.black(" 🩺 mcpdx — Model Context Protocol Doctor ")));

  const action = await p.select({
    message: "What would you like to do?",
    options: [
      { value: "check", label: "🔍 Audit MCP Server", hint: "Check schemas, error boundaries, descriptions & logs" },
      { value: "fix", label: "⚡ Auto-Fix Issues", hint: "Automatically apply AST codemod fixes" },
      { value: "detect", label: "📋 Inspect Fingerprint", hint: "Detect installed SDK, transports & integrations" },
      { value: "init", label: "🚀 Setup Telemetry & Config", hint: "Initialize mcpdoctor.config.js and logging" },
    ],
  });

  if (p.isCancel(action)) {
    p.cancel("Goodbye!");
    return;
  }

  const targetDir = path.resolve(".");

  if (action === "check") {
    const fp = detectProject(targetDir);
    if (!checkMcpPresence(fp)) return;
    const report = await runChecks({ projectDir: targetDir });
    console.log(formatTerminalReport(report));
  } else if (action === "fix") {
    const previewFixes = await runFixes({ projectDir: targetDir, dryRun: true });
    if (previewFixes.length === 0) {
      p.note("No auto-fixable issues were detected in this MCP server.", "Fix Status");
      return;
    }
    console.log(formatFixReport(previewFixes, true));
    const proceed = await p.confirm({
      message: `Found ${previewFixes.length} fixable issue(s). Apply these changes to disk now?`,
      initialValue: true,
    });
    if (!p.isCancel(proceed) && proceed) {
      const s = p.spinner();
      s.start("Applying AST codemod fixes...");
      const liveFixes = await runFixes({ projectDir: targetDir, dryRun: false });
      s.stop("Done!");
      console.log(formatFixReport(liveFixes, false));
      p.outro(pc.green("✔ All changes successfully written to disk!"));
    }
  } else if (action === "detect") {
    const fp = detectProject(targetDir);
    if (checkMcpPresence(fp)) {
      console.log(formatFingerprintReport(fp));
    }
  } else if (action === "init") {
    await program.commands.find((c) => c.name() === "init")?.parseAsync(["init"], { from: "user" });
  }
});

program.parse();
