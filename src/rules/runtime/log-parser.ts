import fs from "node:fs";
import path from "node:path";
import type { RuntimeCallLog } from "../../types.js";

export function parseRuntimeLogs(logFilePath: string): RuntimeCallLog[] {
  const resolved = path.resolve(logFilePath);
  if (!fs.existsSync(resolved)) {
    return [];
  }

  const logs: RuntimeCallLog[] = [];
  try {
    const content = fs.readFileSync(resolved, "utf8");
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      try {
        const entry = JSON.parse(line);
        if (entry && typeof entry.tool === "string") {
          logs.push({
            timestamp: entry.timestamp || Date.now(),
            tool: entry.tool,
            argsHash: String(entry.argsHash || "unknown"),
            durationMs: Number(entry.durationMs || 0),
            success: Boolean(entry.success),
            error: entry.error,
            sessionId: entry.sessionId,
          });
        }
      } catch {
        // Skip malformed individual lines
      }
    }
  } catch (err) {
    console.warn(`[mcp-doctor] Warning reading log file at ${resolved}:`, err);
  }

  return logs;
}
