import path from "node:path";
import fs from "node:fs";
import { describe, it, expect } from "vitest";
import { runFixes } from "../src/engine/fixer.js";

describe("Fixer Engine & Codemods", () => {
  const fixturesDir = path.resolve(__dirname, "fixtures");

  it("generates dry-run diffs without modifying files on disk", async () => {
    const dir = path.join(fixturesDir, "sample-sentry");
    const serverFile = path.join(dir, "server.ts");
    const originalContent = fs.readFileSync(serverFile, "utf8");

    const fixes = await runFixes({
      projectDir: dir,
      dryRun: true,
      ruleIds: ["sentry/init-config"],
    });

    expect(fixes.length).toBeGreaterThan(0);
    expect(fixes[0].fixed).toBe(true);
    expect(fixes[0].diff).toBeDefined();
    expect(fixes[0].diff).toContain("+");
    expect(fixes[0].diff).toContain("environment");

    // Ensure file was not modified on disk
    const contentAfter = fs.readFileSync(serverFile, "utf8");
    expect(contentAfter).toBe(originalContent);
  });

  it("generates span and breadcrumb fix diffs", async () => {
    const dir = path.join(fixturesDir, "sample-sentry");
    const fixes = await runFixes({
      projectDir: dir,
      dryRun: true,
      ruleIds: ["sentry/breadcrumbs"],
    });

    expect(fixes.length).toBeGreaterThan(0);
    expect(fixes[0].diff).toContain("Sentry.addBreadcrumb");
  });
});
