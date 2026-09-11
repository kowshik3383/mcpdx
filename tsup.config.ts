import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    cli: "src/cli.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  banner: {
    js: `// mcp-doctor - Opinionated completeness auditor for MCP servers`,
  },
  // Ensure cli entry gets executable shebang
  esbuildOptions(options) {
    options.banner = {
      js: options.banner?.js || "",
    };
  },
});
