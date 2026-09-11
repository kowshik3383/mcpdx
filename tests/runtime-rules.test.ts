import path from "node:path";
import { describe, it, expect } from "vitest";
import { parseRuntimeLogs } from "../src/rules/runtime/log-parser.js";
import { duplicateCallsRule } from "../src/rules/runtime/duplicate-calls.js";
import { deadToolsRule } from "../src/rules/runtime/dead-tools.js";
import { slowToolsRule } from "../src/rules/runtime/slow-tools.js";
import { highFailureRateRule } from "../src/rules/runtime/high-failure-rate.js";
import type { ProjectFingerprint } from "../src/types.js";

describe("Runtime Rules", () => {
  const logFile = path.resolve(__dirname, "fixtures", "sample-calls.jsonl");
  const logs = parseRuntimeLogs(logFile);

  const mockFingerprint: ProjectFingerprint = {
    projectPath: "/mock",
    hasPackageJson: true,
    dependencies: {},
    devDependencies: {},
    mcpDetected: true,
    transports: ["stdio"],
    integrations: {
      sentry: { name: "sentry", installed: false, inUse: false },
      opentelemetry: { name: "otel", installed: false, inUse: false },
      winston: { name: "winston", installed: false, inUse: false },
      pino: { name: "pino", installed: false, inUse: false },
      retries: { name: "retries", installed: false, inUse: false },
    },
    tools: [
      {
        name: "query_db",
        filePath: "/mock/server.ts",
        lineNumber: 10,
        hasInputSchema: true,
        hasErrorBoundary: true,
        hasTimeoutGuard: false,
        isReferencedElsewhere: true,
      },
      {
        name: "heavy_calculation",
        filePath: "/mock/server.ts",
        lineNumber: 25,
        hasInputSchema: true,
        hasErrorBoundary: true,
        hasTimeoutGuard: false,
        isReferencedElsewhere: true,
      },
      {
        name: "flaky_api",
        filePath: "/mock/server.ts",
        lineNumber: 40,
        hasInputSchema: true,
        hasErrorBoundary: true,
        hasTimeoutGuard: false,
        isReferencedElsewhere: true,
      },
      {
        name: "uninvoked_tool",
        filePath: "/mock/server.ts",
        lineNumber: 60,
        hasInputSchema: true,
        hasErrorBoundary: true,
        hasTimeoutGuard: false,
        isReferencedElsewhere: false,
      },
    ],
    sourceFiles: ["/mock/server.ts"],
    serverInstantiations: [],
  };

  const context = {
    projectPath: "/mock",
    fingerprint: mockFingerprint,
    logs,
  };

  it("parses logs correctly", () => {
    expect(logs.length).toBe(8);
  });

  it("detects repeated duplicate tool calls in same session", () => {
    const findings = duplicateCallsRule.evaluate(context);
    expect(findings.length).toBeGreaterThan(0);
    const finding = findings.find((f) => f.toolName === "query_db");
    expect(finding).toBeDefined();
    expect(finding?.message).toContain("query_db");
    expect(finding?.message).toContain("3 times");
  });

  it("detects dead tools that are never invoked", () => {
    const findings = deadToolsRule.evaluate(context);
    expect(findings.length).toBe(1);
    expect(findings[0].toolName).toBe("uninvoked_tool");
  });

  it("flags slow tools based on latency p95", () => {
    const findings = slowToolsRule.evaluate(context);
    expect(findings.length).toBe(1);
    expect(findings[0].toolName).toBe("heavy_calculation");
    expect(findings[0].message).toContain("high p95 latency");
  });

  it("detects high failure rate tools", () => {
    const findings = highFailureRateRule.evaluate(context);
    expect(findings.length).toBe(1);
    expect(findings[0].toolName).toBe("flaky_api");
    expect(findings[0].severity).toBe("error");
    expect(findings[0].message).toContain("67%");
  });
});
