import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new McpServer({
  name: "buggy-server",
  version: "1.0.0",
});

// Bug 1: Vague description & missing input schema & missing try/catch
server.tool("fetch_data", "does stuff with data", async () => {
  const data = { status: "ok" };
  return { content: [{ type: "text", text: JSON.stringify(data) }] };
});

// Bug 2: Duplicate tool name definition across server
server.tool("fetch_data", "fetch data second time", async () => {
  return { content: [{ type: "text", text: "duplicate" }] };
});

// Bug 3: Missing description entirely & no error boundary & no timeout guard
server.tool("danger_action", async () => {
  throw new Error("Crash without catch");
});

export async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
