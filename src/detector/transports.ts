import type { TransportType } from "../types.js";

export function detectTransportsFromCode(sourceCode: string): TransportType[] {
  const transports: Set<TransportType> = new Set();

  if (
    sourceCode.includes("StdioServerTransport") ||
    sourceCode.includes("/server/stdio") ||
    sourceCode.includes("new StdioServerTransport")
  ) {
    transports.add("stdio");
  }

  if (
    sourceCode.includes("SSEServerTransport") ||
    sourceCode.includes("/server/sse") ||
    sourceCode.includes("new SSEServerTransport")
  ) {
    transports.add("sse");
  }

  if (
    sourceCode.includes("StreamableHttp") ||
    sourceCode.includes("streamable-http") ||
    sourceCode.includes("express") ||
    sourceCode.includes("fastify") ||
    sourceCode.includes("koa")
  ) {
    transports.add("streamable-http");
  }

  if (transports.size === 0 && (sourceCode.includes("connect(") || sourceCode.includes("transport"))) {
    transports.add("custom");
  }

  return Array.from(transports);
}
