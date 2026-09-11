import fs from "node:fs";
import path from "node:path";
import type { IntegrationStatus } from "../types.js";

export interface ParsedPackageJson {
  name?: string;
  version?: string;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  allDependencies: Record<string, string>;
  raw?: any;
}

export function parseProjectPackageJson(projectDir: string): ParsedPackageJson | null {
  const pkgPath = path.join(projectDir, "package.json");
  if (!fs.existsSync(pkgPath)) {
    return null;
  }

  try {
    const rawContent = fs.readFileSync(pkgPath, "utf8");
    const json = JSON.parse(rawContent);
    const dependencies = json.dependencies || {};
    const devDependencies = json.devDependencies || {};
    const allDependencies = { ...devDependencies, ...dependencies };

    return {
      name: json.name,
      version: json.version,
      dependencies,
      devDependencies,
      allDependencies,
      raw: json,
    };
  } catch {
    return null;
  }
}

export function detectDependencyIntegrations(pkg: ParsedPackageJson | null): {
  sentry: IntegrationStatus;
  opentelemetry: IntegrationStatus;
  winston: IntegrationStatus;
  pino: IntegrationStatus;
  retries: IntegrationStatus;
} {
  const allDeps = pkg?.allDependencies || {};

  const findDep = (names: string[]): { installed: boolean; name: string; version?: string } => {
    for (const name of names) {
      if (allDeps[name]) {
        return { installed: true, name, version: allDeps[name] };
      }
    }
    return { installed: false, name: names[0] };
  };

  const sentryInfo = findDep([
    "@sentry/node",
    "@sentry/core",
    "@sentry/bun",
    "@sentry/deno",
    "@sentry/browser",
  ]);

  const otelInfo = findDep([
    "@opentelemetry/api",
    "@opentelemetry/sdk-node",
    "@opentelemetry/auto-instrumentations-node",
  ]);

  const winstonInfo = findDep(["winston"]);
  const pinoInfo = findDep(["pino"]);
  const retryInfo = findDep(["p-retry", "bottleneck", "async-retry", "retry", "cockatiel"]);

  return {
    sentry: {
      name: sentryInfo.name,
      installed: sentryInfo.installed,
      version: sentryInfo.version,
      inUse: false, // will be confirmed by AST scanner
    },
    opentelemetry: {
      name: otelInfo.name,
      installed: otelInfo.installed,
      version: otelInfo.version,
      inUse: false,
    },
    winston: {
      name: winstonInfo.name,
      installed: winstonInfo.installed,
      version: winstonInfo.version,
      inUse: false,
    },
    pino: {
      name: pinoInfo.name,
      installed: pinoInfo.installed,
      version: pinoInfo.version,
      inUse: false,
    },
    retries: {
      name: retryInfo.name,
      installed: retryInfo.installed,
      version: retryInfo.version,
      inUse: false,
    },
  };
}
