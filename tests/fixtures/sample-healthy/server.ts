import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "sample-healthy-server",
  version: "1.0.0",
});

server.tool(
  "calculate_bmi",
  "Calculates Body Mass Index given height in meters and weight in kilograms with healthy range feedback",
  {
    weightKg: z.number().describe("Weight in kilograms"),
    heightM: z.number().describe("Height in meters"),
  },
  async ({ weightKg, heightM }) => {
    try {
      const signal = AbortSignal.timeout(5000);
      if (signal.aborted) throw new Error("Timed out");
      const bmi = Number((weightKg / (heightM * heightM)).toFixed(1));
      return {
        content: [{ type: "text", text: `BMI: ${bmi}` }],
      };
    } catch (error: any) {
      return {
        isError: true,
        content: [{ type: "text", text: error.message }],
      };
    }
  }
);

export async function start() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
