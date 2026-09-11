import path from "node:path";
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import { describe, it, expect } from "vitest";

describe("CLI Integration", () => {
  const cliPath = path.resolve(__dirname, "..", "dist", "cli.js");
  const fixturesDir = path.resolve(__dirname, "fixtures");

  it("detects healthy server in json mode", () => {
    const target = path.join(fixturesDir, "sample-healthy");
    const output = execSync(`node "${cliPath}" detect "${target}" --json`, {
      encoding: "utf8",
    });

    const parsed = JSON.parse(output);
    expect(parsed.mcpDetected).toBe(true);
    expect(parsed.packageName).toBe("sample-healthy-server");
    expect(parsed.tools).toHaveLength(1);
  });

  it("checks healthy server and exits with code 0", () => {
    const target = path.join(fixturesDir, "sample-healthy");
    const output = execSync(`node "${cliPath}" check "${target}" --json`, {
      encoding: "utf8",
    });

    const parsed = JSON.parse(output);
    expect(parsed.summary.errors).toBe(0);
    expect(parsed.summary.warnings).toBe(0);
  });

  it("checks buggy server and identifies errors", () => {
    const target = path.join(fixturesDir, "sample-buggy");
    let output = "";
    try {
      execSync(`node "${cliPath}" check "${target}" --json`, {
        encoding: "utf8",
      });
    } catch (err: any) {
      // Exit code is non-zero (2 for errors), stdout is in err.stdout
      output = err.stdout;
    }

    expect(output).toBeTruthy();
    const parsed = JSON.parse(output);
    expect(parsed.summary.errors).toBeGreaterThan(0);
    expect(parsed.findings.some((f: any) => f.ruleId === "core/duplicate-tools")).toBe(true);
  });

  it("inits a new project directory with config and .mcpdoctor folder", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-init-test-"));
    try {
      execSync(`node "${cliPath}" init "${tempDir}"`, {
        encoding: "utf8",
      });

      expect(fs.existsSync(path.join(tempDir, "mcpdoctor.config.js"))).toBe(true);
      expect(fs.existsSync(path.join(tempDir, ".mcpdoctor"))).toBe(true);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
