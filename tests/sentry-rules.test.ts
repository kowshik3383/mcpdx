import path from "node:path";
import { describe, it, expect } from "vitest";
import { detectProject } from "../src/detector/index.js";
import { sentryInitRule } from "../src/rules/sentry/sentry-init.js";
import { sentryToolSpansRule } from "../src/rules/sentry/sentry-tool-spans.js";
import { sentryErrorCaptureRule } from "../src/rules/sentry/sentry-error-capture.js";
import { sentryBreadcrumbsRule } from "../src/rules/sentry/sentry-breadcrumbs.js";

describe("Sentry Integration Rules", () => {
  const fixturesDir = path.resolve(__dirname, "fixtures");

  it("identifies missing Sentry configuration keys and handlers", () => {
    const dir = path.join(fixturesDir, "sample-sentry");
    const fp = detectProject(dir);
    const context = { projectPath: dir, fingerprint: fp };

    // 1. Sentry.init config keys
    const initFindings = sentryInitRule.evaluate(context);
    expect(initFindings.length).toBeGreaterThan(0);
    expect(initFindings[0].message).toContain("missing standard configuration key");

    // 2. Tool spans
    const spanFindings = sentryToolSpansRule.evaluate(context);
    expect(spanFindings.length).toBeGreaterThan(0);
    expect(spanFindings[0].toolName).toBe("query_db");

    // 3. Error capture
    const captureFindings = sentryErrorCaptureRule.evaluate(context);
    expect(captureFindings.length).toBeGreaterThan(0);
    expect(captureFindings[0].toolName).toBe("query_db");

    // 4. Breadcrumbs
    const breadcrumbFindings = sentryBreadcrumbsRule.evaluate(context);
    expect(breadcrumbFindings.length).toBeGreaterThan(0);
    expect(breadcrumbFindings[0].toolName).toBe("query_db");
  });
});
