import fs from "node:fs";
import path from "node:path";
import type { ProjectFingerprint } from "../types.js";
import { parseProjectPackageJson, detectDependencyIntegrations } from "./dependencies.js";
import { scanProjectAST } from "./ast-scanner.js";
import { detectTransportsFromCode } from "./transports.js";

export function detectProject(projectDir: string = process.cwd()): ProjectFingerprint {
  const resolvedDir = path.resolve(projectDir);
  const pkg = parseProjectPackageJson(resolvedDir);

  const integrations = detectDependencyIntegrations(pkg);
  const astScan = scanProjectAST(resolvedDir);

  // Cross-check AST findings against dependency listings
  if (astScan.sentryDetails?.hasInit || astScan.sentryDetails?.hasStartSpan) {
    integrations.sentry.inUse = true;
  }
  if (astScan.sentryDetails) {
    integrations.sentry.details = astScan.sentryDetails;
  }

  if (astScan.otelDetails?.hasTracer || astScan.otelDetails?.hasStartSpan) {
    integrations.opentelemetry.inUse = true;
    integrations.opentelemetry.details = astScan.otelDetails;
  }

  if (astScan.loggingDetails?.winstonInUse) {
    integrations.winston.inUse = true;
  }
  if (astScan.loggingDetails?.pinoInUse) {
    integrations.pino.inUse = true;
  }

  // Detect transports from all source code
  let combinedSource = "";
  for (const sfPath of astScan.sourceFilePaths) {
    try {
      combinedSource += fs.readFileSync(sfPath, "utf8") + "\n";
    } catch {
      // ignore read error
    }
  }
  const transports = detectTransportsFromCode(combinedSource);

  // Check MCP detection
  const hasMcpDep = Boolean(
    pkg?.allDependencies["@modelcontextprotocol/sdk"] ||
    pkg?.allDependencies["@modelcontextprotocol/server"]
  );
  const hasMcpCode = astScan.serverInstantiations.length > 0 || astScan.tools.length > 0 || transports.length > 0;
  const mcpDetected = hasMcpDep || hasMcpCode;
  const sdkVersion =
    pkg?.allDependencies["@modelcontextprotocol/sdk"] ||
    pkg?.allDependencies["@modelcontextprotocol/server"];

  return {
    projectPath: resolvedDir,
    hasPackageJson: pkg !== null,
    packageName: pkg?.name,
    packageVersion: pkg?.version,
    dependencies: pkg?.dependencies || {},
    devDependencies: pkg?.devDependencies || {},
    mcpDetected,
    sdkVersion,
    transports,
    integrations,
    tools: astScan.tools,
    sourceFiles: astScan.sourceFilePaths,
    serverInstantiations: astScan.serverInstantiations,
  };
}
