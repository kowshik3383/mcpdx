import * as Sentry from "@sentry/node";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

Sentry.init({
  dsn: "https://examplePublicKey@o0.ingest.sentry.io/0",
});

const server = new McpServer({
  name: "sentry-test-server",
  version: "1.0.0",
});

server.tool(
  "query_db",
  "Performs a parameterized SQL query against the primary relational database",
  async () => {
    try {
      return { content: [{ type: "text", text: "result" }] };
    } catch (error: any) {
      return { isError: true, content: [{ type: "text", text: error.message }] };
    }
  }
);

export async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
