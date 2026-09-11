import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { DoctorConfig } from "./types.js";

const DEFAULT_CONFIG: DoctorConfig = {
  rules: {},
  ignorePatterns: ["node_modules", "dist", ".git", ".mcpdoctor", "coverage"],
  logs: ".mcpdoctor/calls.jsonl",
};

export async function loadDoctorConfig(projectDir: string = process.cwd()): Promise<DoctorConfig> {
  const possiblePaths = [
    path.join(projectDir, "mcpdoctor.config.js"),
    path.join(projectDir, "mcpdoctor.config.mjs"),
    path.join(projectDir, "mcpdoctor.config.cjs"),
    path.join(projectDir, "mcpdoctor.config.json"),
    path.join(projectDir, ".mcpdoctorrc"),
    path.join(projectDir, ".mcpdoctorrc.json"),
  ];

  for (const configPath of possiblePaths) {
    if (fs.existsSync(configPath)) {
      try {
        if (configPath.endsWith(".json") || configPath.endsWith("rc")) {
          const content = fs.readFileSync(configPath, "utf8");
          const parsed = JSON.parse(content);
          return { ...DEFAULT_CONFIG, ...parsed };
        } else {
          // JS/MJS/CJS config
          const fileUrl = pathToFileURL(configPath).href;
          const mod = await import(fileUrl);
          const config = mod.default || mod;
          return { ...DEFAULT_CONFIG, ...config };
        }
      } catch (err) {
        console.warn(`[mcp-doctor] Warning: Failed to parse configuration at ${configPath}:`, err);
      }
    }
  }

  // Check package.json
  const pkgPath = path.join(projectDir, "package.json");
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
      if (pkg.mcpDoctor) {
        return { ...DEFAULT_CONFIG, ...pkg.mcpDoctor };
      }
    } catch {
      // ignore
    }
  }

  return DEFAULT_CONFIG;
}
