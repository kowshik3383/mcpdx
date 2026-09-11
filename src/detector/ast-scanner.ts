import fs from "node:fs";
import path from "node:path";
import { Project, SyntaxKind, Node, CallExpression, ObjectLiteralExpression } from "ts-morph";
import type { RegisteredTool, ProjectFingerprint, IntegrationStatus } from "../types.js";
import { detectTransportsFromCode } from "./transports.js";
import { parseProjectPackageJson, detectDependencyIntegrations } from "./dependencies.js";

export interface ScanASTResult {
  tools: RegisteredTool[];
  serverInstantiations: Array<{
    filePath: string;
    lineNumber: number;
    variableName?: string;
    serverName?: string;
  }>;
  sentryDetails?: {
    hasInit: boolean;
    initKeys: string[];
    hasStartSpan: boolean;
    hasCaptureException: boolean;
    hasAddBreadcrumb: boolean;
    initFilePath?: string;
    initLineNumber?: number;
  };
  otelDetails?: {
    hasTracer: boolean;
    hasStartSpan: boolean;
  };
  loggingDetails?: {
    winstonInUse: boolean;
    pinoInUse: boolean;
  };
  sourceFilePaths: string[];
}

export function findSourceFiles(
  dir: string,
  excludes: string[] = [
    "node_modules",
    "dist",
    ".git",
    ".mcpdoctor",
    "coverage",
    "build",
    "out",
    "tmp",
    "temp",
    ".gemini",
    "AppData",
    "$RECYCLE.BIN",
    ".vscode",
    ".idea",
  ],
  maxDepth: number = 5,
  maxFiles: number = 200
): string[] {
  const results: string[] = [];

  function scan(currentDir: string, depth: number) {
    if (depth > maxDepth || results.length >= maxFiles) return;

    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (results.length >= maxFiles) break;

      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (!excludes.includes(entry.name) && !entry.name.startsWith(".")) {
          scan(fullPath, depth + 1);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if ([".ts", ".js", ".mjs", ".cjs", ".mts"].includes(ext) && !entry.name.endsWith(".d.ts")) {
          results.push(fullPath);
        }
      }
    }
  }

  scan(dir, 0);
  return results;
}

export function scanProjectAST(projectDir: string): ScanASTResult {
  const sourceFiles = findSourceFiles(projectDir);
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    compilerOptions: {
      allowJs: true,
    },
  });

  for (const file of sourceFiles) {
    try {
      project.addSourceFileAtPath(file);
    } catch {
      // Continue on parsing error for individual file
    }
  }

  const tools: RegisteredTool[] = [];
  const serverInstantiations: ScanASTResult["serverInstantiations"] = [];
  const sentryDetails: ScanASTResult["sentryDetails"] = {
    hasInit: false,
    initKeys: [],
    hasStartSpan: false,
    hasCaptureException: false,
    hasAddBreadcrumb: false,
  };
  const otelDetails: ScanASTResult["otelDetails"] = {
    hasTracer: false,
    hasStartSpan: false,
  };
  const loggingDetails: ScanASTResult["loggingDetails"] = {
    winstonInUse: false,
    pinoInUse: false,
  };

  const allFileTexts: Record<string, string> = {};
  for (const sf of project.getSourceFiles()) {
    allFileTexts[sf.getFilePath()] = sf.getFullText();
  }

  // First pass: scan imports and general usages
  for (const sf of project.getSourceFiles()) {
    const text = sf.getFullText();
    const filePath = sf.getFilePath();

    // Check Sentry
    if (text.includes("Sentry") || text.includes("@sentry")) {
      // Look for Sentry.init
      sf.forEachDescendant((node) => {
        if (Node.isCallExpression(node)) {
          const expr = node.getExpression();
          const callText = expr.getText();
          if (callText === "Sentry.init" || callText.endsWith(".Sentry.init")) {
            sentryDetails.hasInit = true;
            sentryDetails.initFilePath = filePath;
            sentryDetails.initLineNumber = node.getStartLineNumber();

            const args = node.getArguments();
            if (args.length > 0 && Node.isObjectLiteralExpression(args[0])) {
              const obj = args[0] as ObjectLiteralExpression;
              for (const prop of obj.getProperties()) {
                if (Node.isPropertyAssignment(prop) || Node.isShorthandPropertyAssignment(prop)) {
                  sentryDetails.initKeys.push(prop.getName());
                }
              }
            }
          }

          if (callText.includes("startSpan") || callText.includes("startInactiveSpan")) {
            sentryDetails.hasStartSpan = true;
          }
          if (callText.includes("captureException")) {
            sentryDetails.hasCaptureException = true;
          }
          if (callText.includes("addBreadcrumb")) {
            sentryDetails.hasAddBreadcrumb = true;
          }
        }
      });
    }

    // Check OpenTelemetry
    if (text.includes("@opentelemetry") || text.includes("trace.getTracer")) {
      otelDetails.hasTracer = true;
      if (text.includes("startSpan") || text.includes("startActiveSpan")) {
        otelDetails.hasStartSpan = true;
      }
    }

    // Check Winston & Pino
    if (text.includes("winston") || text.includes("createLogger")) {
      loggingDetails.winstonInUse = true;
    }
    if (text.includes("pino(") || text.includes("pino.")) {
      loggingDetails.pinoInUse = true;
    }

    // Check Server instantiations: new McpServer(...) or new Server(...)
    sf.forEachDescendant((node) => {
      if (Node.isNewExpression(node)) {
        const expr = node.getExpression();
        const exprText = expr.getText();
        if (exprText === "McpServer" || exprText === "Server") {
          let variableName: string | undefined;
          const parent = node.getParent();
          if (parent && Node.isVariableDeclaration(parent)) {
            variableName = parent.getName();
          }

          let serverName: string | undefined;
          const args = node.getArguments();
          if (args.length > 0) {
            if (Node.isObjectLiteralExpression(args[0])) {
              const nameProp = (args[0] as ObjectLiteralExpression).getProperty("name");
              if (nameProp && Node.isPropertyAssignment(nameProp)) {
                serverName = nameProp.getInitializer()?.getText().replace(/['"]/g, "");
              }
            } else if (Node.isStringLiteral(args[0])) {
              serverName = args[0].getLiteralText();
            }
          }

          serverInstantiations.push({
            filePath,
            lineNumber: node.getStartLineNumber(),
            variableName,
            serverName,
          });
        }
      }
    });

    // Detect tools registered via server.tool(...) or server.registerTool(...)
    sf.forEachDescendant((node) => {
      if (Node.isCallExpression(node)) {
        const expr = node.getExpression();
        if (Node.isPropertyAccessExpression(expr)) {
          const propName = expr.getName();
          if (propName === "tool" || propName === "registerTool") {
            const args = node.getArguments();
            if (args.length >= 1) {
              const nameArg = args[0];
              let toolName: string | undefined;

              if (Node.isStringLiteral(nameArg) || Node.isNoSubstitutionTemplateLiteral(nameArg)) {
                toolName = nameArg.getLiteralText();
              } else {
                // If dynamic expression or variable
                toolName = nameArg.getText().replace(/['"]/g, "");
              }

              if (toolName) {
                // Determine description & schema & handler
                let description: string | undefined;
                let hasInputSchema = false;
                let handlerNode: Node | undefined;

                if (args.length === 2) {
                  // server.tool(name, handler)
                  handlerNode = args[1];
                } else if (args.length === 3) {
                  // server.tool(name, schema, handler) OR server.tool(name, description, handler)
                  const secondArg = args[1];
                  handlerNode = args[2];

                  if (Node.isStringLiteral(secondArg) || Node.isNoSubstitutionTemplateLiteral(secondArg)) {
                    description = secondArg.getLiteralText();
                  } else {
                    hasInputSchema = true;
                    // Check if schema is Zod or object with description
                    const schemaText = secondArg.getText();
                    if (schemaText.includes(".describe(")) {
                      description = "Zod described schema";
                    }
                  }
                } else if (args.length >= 4) {
                  // server.tool(name, description, schema, handler)
                  const secondArg = args[1];
                  const thirdArg = args[2];
                  handlerNode = args[3];

                  if (Node.isStringLiteral(secondArg) || Node.isNoSubstitutionTemplateLiteral(secondArg)) {
                    description = secondArg.getLiteralText();
                  }
                  hasInputSchema = true;
                }

                // Analyze handler body
                let hasErrorBoundary = false;
                let hasTimeoutGuard = false;
                let hasSentrySpan = false;
                let hasSentryBreadcrumb = false;
                let hasSentryErrorCapture = false;
                let handlerNodeText = "";

                if (handlerNode) {
                  handlerNodeText = handlerNode.getText();
                  const lowerText = handlerNodeText.toLowerCase();

                  // Error boundary: try / catch block
                  handlerNode.forEachDescendant((hDesc) => {
                    if (Node.isTryStatement(hDesc)) {
                      hasErrorBoundary = true;
                    }
                  });

                  // Timeout guard
                  if (
                    lowerText.includes("abortsignal") ||
                    lowerText.includes("timeout") ||
                    lowerText.includes("aborterror") ||
                    lowerText.includes("race([") ||
                    lowerText.includes("promise.race")
                  ) {
                    hasTimeoutGuard = true;
                  }

                  // Sentry instrumentation inside handler
                  if (
                    handlerNodeText.includes("startSpan") ||
                    handlerNodeText.includes("startInactiveSpan") ||
                    handlerNodeText.includes("trace(")
                  ) {
                    hasSentrySpan = true;
                  }

                  if (handlerNodeText.includes("addBreadcrumb")) {
                    hasSentryBreadcrumb = true;
                  }

                  if (handlerNodeText.includes("captureException")) {
                    hasSentryErrorCapture = true;
                  }
                }

                tools.push({
                  name: toolName,
                  filePath,
                  lineNumber: node.getStartLineNumber(),
                  description,
                  hasInputSchema,
                  hasErrorBoundary,
                  hasTimeoutGuard,
                  hasSentrySpan,
                  hasSentryBreadcrumb,
                  hasSentryErrorCapture,
                  isReferencedElsewhere: false, // will check in next pass
                  handlerNodeText,
                });
              }
            }
          }
        }
      }
    });
  }

  // Cross-check: is each tool name referenced elsewhere in the project?
  // (e.g., tests, client code, README, documentation, imports)
  for (const tool of tools) {
    let referenceCount = 0;
    for (const [fPath, fText] of Object.entries(allFileTexts)) {
      // Find occurrences of tool name
      const occurrences = (fText.match(new RegExp(`\\b${escapeRegex(tool.name)}\\b`, "g")) || []).length;
      if (fPath === tool.filePath) {
        // More than 1 occurrence in the definition file means referenced elsewhere in the same file
        if (occurrences > 1) {
          referenceCount += occurrences - 1;
        }
      } else {
        referenceCount += occurrences;
      }
    }
    tool.isReferencedElsewhere = referenceCount > 0;
  }

  return {
    tools,
    serverInstantiations,
    sentryDetails,
    otelDetails,
    loggingDetails,
    sourceFilePaths: sourceFiles,
  };
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
