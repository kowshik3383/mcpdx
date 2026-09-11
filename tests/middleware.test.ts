import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { describe, it, expect, afterEach } from "vitest";
import { withDoctorLogging, hashArguments } from "../src/middleware/index.js";
import { parseRuntimeLogs } from "../src/rules/runtime/log-parser.js";

describe("Runtime Middleware", () => {
  const tempLogDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-doc-test-"));
  const logFile = path.join(tempLogDir, "calls.jsonl");

  afterEach(() => {
    try {
      fs.rmSync(tempLogDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("produces deterministic hashes for arguments", () => {
    const hash1 = hashArguments({ query: "SELECT 1", limit: 10 });
    const hash2 = hashArguments({ limit: 10, query: "SELECT 1" });
    expect(hash1).toBe(hash2);
  });

  it("wraps McpServer tool calls and appends structured logs", async () => {
    // Mock server object
    const mockServer = {
      tools: new Map<string, Function>(),
      tool(name: string, handler: Function) {
        this.tools.set(name, handler);
      },
    };

    const instrumented = withDoctorLogging(mockServer, { logPath: logFile });

    // Register a tool
    instrumented.tool("sample_calc", async ({ a, b }: { a: number; b: number }) => {
      return { result: a + b };
    });

    const handler = mockServer.tools.get("sample_calc")!;
    expect(handler).toBeDefined();

    // Call tool
    const res = await handler({ a: 2, b: 3 });
    expect(res).toEqual({ result: 5 });

    // Verify log file was written
    expect(fs.existsSync(logFile)).toBe(true);
    const logs = parseRuntimeLogs(logFile);
    expect(logs).toHaveLength(1);
    expect(logs[0].tool).toBe("sample_calc");
    expect(logs[0].success).toBe(true);
    expect(logs[0].durationMs).toBeGreaterThanOrEqual(0);
  });

  it("captures tool failures in runtime log", async () => {
    const mockServer = {
      tools: new Map<string, Function>(),
      tool(name: string, handler: Function) {
        this.tools.set(name, handler);
      },
    };

    const instrumented = withDoctorLogging(mockServer, { logPath: logFile });

    instrumented.tool("failing_tool", async () => {
      throw new Error("Simulated database failure");
    });

    const handler = mockServer.tools.get("failing_tool")!;
    await expect(handler()).rejects.toThrow("Simulated database failure");

    const logs = parseRuntimeLogs(logFile);
    expect(logs).toHaveLength(1);
    expect(logs[0].tool).toBe("failing_tool");
    expect(logs[0].success).toBe(false);
    expect(logs[0].error).toBe("Simulated database failure");
  });
});
