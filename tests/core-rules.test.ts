import path from "node:path";
import { describe, it, expect } from "vitest";
import { detectProject } from "../src/detector/index.js";
import { duplicateToolsRule } from "../src/rules/core/duplicate-tools.js";
import { descriptionQualityRule } from "../src/rules/core/description-quality.js";
import { missingInputSchemaRule } from "../src/rules/core/missing-input-schema.js";
import { errorBoundaryRule } from "../src/rules/core/error-boundary.js";
import { timeoutGuardRule } from "../src/rules/core/timeout-guard.js";

describe("Core Rules", () => {
  const fixturesDir = path.resolve(__dirname, "fixtures");

  it("passes all core rules on healthy server", () => {
    const dir = path.join(fixturesDir, "sample-healthy");
    const fp = detectProject(dir);
    const context = { projectPath: dir, fingerprint: fp };

    const dupFindings = duplicateToolsRule.evaluate(context);
    const descFindings = descriptionQualityRule.evaluate(context);
    const schemaFindings = missingInputSchemaRule.evaluate(context);
    const errorFindings = errorBoundaryRule.evaluate(context);
    const timeoutFindings = timeoutGuardRule.evaluate(context);

    expect(dupFindings).toHaveLength(0);
    expect(descFindings).toHaveLength(0);
    expect(schemaFindings).toHaveLength(0);
    expect(errorFindings).toHaveLength(0);
    expect(timeoutFindings).toHaveLength(0);
  });

  it("catches duplicate tool names in buggy server", () => {
    const dir = path.join(fixturesDir, "sample-buggy");
    const fp = detectProject(dir);
    const context = { projectPath: dir, fingerprint: fp };

    const dupFindings = duplicateToolsRule.evaluate(context);
    expect(dupFindings.length).toBeGreaterThan(0);
    expect(dupFindings[0].ruleId).toBe("core/duplicate-tools");
    expect(dupFindings[0].toolName).toBe("fetch_data");
    expect(dupFindings[0].severity).toBe("error");
  });

  it("catches vague and missing descriptions", () => {
    const dir = path.join(fixturesDir, "sample-buggy");
    const fp = detectProject(dir);
    const context = { projectPath: dir, fingerprint: fp };

    const descFindings = descriptionQualityRule.evaluate(context);
    expect(descFindings.length).toBeGreaterThanOrEqual(2);

    const vagueFinding = descFindings.find((f) => f.toolName === "fetch_data");
    expect(vagueFinding).toBeDefined();

    const missingFinding = descFindings.find((f) => f.toolName === "danger_action");
    expect(missingFinding).toBeDefined();
    expect(missingFinding?.severity).toBe("error");
  });

  it("catches missing error boundaries", () => {
    const dir = path.join(fixturesDir, "sample-buggy");
    const fp = detectProject(dir);
    const context = { projectPath: dir, fingerprint: fp };

    const errorFindings = errorBoundaryRule.evaluate(context);
    expect(errorFindings.some((f) => f.toolName === "danger_action")).toBe(true);
  });
});
