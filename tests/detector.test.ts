import path from "node:path";
import { describe, it, expect } from "vitest";
import { detectProject } from "../src/detector/index.js";

describe("Detector & Fingerprinting", () => {
  const fixturesDir = path.resolve(__dirname, "fixtures");

  it("fingerprints healthy server correctly", () => {
    const dir = path.join(fixturesDir, "sample-healthy");
    const fp = detectProject(dir);

    expect(fp.mcpDetected).toBe(true);
    expect(fp.packageName).toBe("sample-healthy-server");
    expect(fp.transports).toContain("stdio");
    expect(fp.tools).toHaveLength(1);

    const tool = fp.tools[0];
    expect(tool.name).toBe("calculate_bmi");
    expect(tool.hasInputSchema).toBe(true);
    expect(tool.hasErrorBoundary).toBe(true);
    expect(tool.hasTimeoutGuard).toBe(true);
  });

  it("detects integrations and issues in sentry server", () => {
    const dir = path.join(fixturesDir, "sample-sentry");
    const fp = detectProject(dir);

    expect(fp.integrations.sentry.installed).toBe(true);
    expect(fp.integrations.sentry.inUse).toBe(true);
    expect(fp.integrations.sentry.details?.hasInit).toBe(true);
    expect(fp.integrations.sentry.details?.initKeys).toContain("dsn");
    expect(fp.integrations.sentry.details?.initKeys).not.toContain("environment");
  });

  it("identifies duplicate tools and lacking boundaries in buggy server", () => {
    const dir = path.join(fixturesDir, "sample-buggy");
    const fp = detectProject(dir);

    expect(fp.tools.length).toBeGreaterThanOrEqual(2);
    const names = fp.tools.map((t) => t.name);
    expect(names).toContain("fetch_data");
    expect(names).toContain("danger_action");

    const dangerTool = fp.tools.find((t) => t.name === "danger_action");
    expect(dangerTool?.hasErrorBoundary).toBe(false);
    expect(dangerTool?.hasInputSchema).toBe(false);
  });
});
