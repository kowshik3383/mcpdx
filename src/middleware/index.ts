import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { RuntimeCallLog } from "../types.js";

export interface DoctorLoggingOptions {
  /**
   * Log file path. Defaults to `.mcpdoctor/calls.jsonl`
   */
  logPath?: string;
  /**
   * Project root directory. Defaults to `process.cwd()`
   */
  projectDir?: string;
  /**
   * Session identifier. If omitted, a random UUID will be generated per process session.
   */
  sessionId?: string;
  /**
   * Disable console or stderr warnings if logging fails
   */
  silent?: boolean;
}

const currentSessionId = crypto.randomUUID();

export function hashArguments(args: unknown): string {
  try {
    const serialized = JSON.stringify(args ?? {}, Object.keys(args as object || {}).sort());
    return crypto.createHash("sha256").update(serialized).digest("hex").slice(0, 16);
  } catch {
    return "unhashable";
  }
}

export function appendCallLog(log: RuntimeCallLog, logPath: string): void {
  try {
    const dir = path.dirname(logPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const line = JSON.stringify(log) + "\n";
    fs.appendFileSync(logPath, line, "utf8");
  } catch (err) {
    // Logging middleware should never crash the host server
    console.error("[mcp-doctor] Warning: Failed to write runtime call log:", err);
  }
}

/**
 * Wraps an MCP Server (or McpServer instance) with automatic telemetry logging
 * for tool invocations.
 *
 * Appends call records to `.mcpdoctor/calls.jsonl`
 */
export function withDoctorLogging<T extends object>(
  server: T,
  options: DoctorLoggingOptions = {}
): T {
  const root = options.projectDir || process.cwd();
  const logFile = options.logPath || path.join(root, ".mcpdoctor", "calls.jsonl");
  const sessionId = options.sessionId || currentSessionId;

  // Pattern 1: McpServer high-level SDK (has server.tool() method)
  const anyServer = server as any;

  if (typeof anyServer.tool === "function") {
    const originalTool = anyServer.tool.bind(anyServer);
    anyServer.tool = function (name: string, ...args: any[]) {
      // Find the handler function, which is typically the last argument
      const handlerIndex = args.length - 1;
      const originalHandler = args[handlerIndex];

      if (typeof originalHandler === "function") {
        args[handlerIndex] = async function (...handlerArgs: any[]) {
          const startTime = Date.now();
          const toolArgs = handlerArgs[0];
          const argsHash = hashArguments(toolArgs);
          let success = true;
          let errorMessage: string | undefined;

          try {
            const result = await originalHandler(...handlerArgs);
            return result;
          } catch (err: any) {
            success = false;
            errorMessage = err?.message || String(err);
            throw err;
          } finally {
            const durationMs = Date.now() - startTime;
            appendCallLog(
              {
                timestamp: new Date().toISOString(),
                tool: name,
                argsHash,
                durationMs,
                success,
                error: errorMessage,
                sessionId,
              },
              logFile
            );
          }
        };
      }

      return originalTool(name, ...args);
    };
  }

  // Pattern 2: Server low-level SDK with setRequestHandler
  if (typeof anyServer.setRequestHandler === "function") {
    const originalSetRequestHandler = anyServer.setRequestHandler.bind(anyServer);
    anyServer.setRequestHandler = function (schema: any, handler: any) {
      // Check if this is the CallToolRequest handler
      const isCallTool =
        schema?.method === "tools/call" ||
        schema?.name === "CallToolRequestSchema" ||
        (typeof schema === "object" && schema !== null && schema.shape && schema.shape.method);

      if (isCallTool && typeof handler === "function") {
        const wrappedHandler = async (request: any, extra: any) => {
          const startTime = Date.now();
          const toolName = request?.params?.name || "unknown";
          const toolArgs = request?.params?.arguments;
          const argsHash = hashArguments(toolArgs);
          let success = true;
          let errorMessage: string | undefined;

          try {
            const response = await handler(request, extra);
            if (response?.isError) {
              success = false;
              errorMessage = "Tool returned isError: true";
            }
            return response;
          } catch (err: any) {
            success = false;
            errorMessage = err?.message || String(err);
            throw err;
          } finally {
            const durationMs = Date.now() - startTime;
            appendCallLog(
              {
                timestamp: new Date().toISOString(),
                tool: toolName,
                argsHash,
                durationMs,
                success,
                error: errorMessage,
                sessionId,
              },
              logFile
            );
          }
        };
        return originalSetRequestHandler(schema, wrappedHandler);
      }

      return originalSetRequestHandler(schema, handler);
    };
  }

  return server;
}
