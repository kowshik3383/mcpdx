/**
 * Core type definitions for mcp-doctor
 */

export type Severity = "error" | "warn" | "info";

export type RuleCategory =
  | "core"
  | "runtime"
  | "sentry"
  | "opentelemetry"
  | "logging"
  | "security";

export type TransportType = "stdio" | "sse" | "streamable-http" | "custom";

export interface IntegrationStatus {
  name: string;
  installed: boolean;
  version?: string;
  inUse: boolean;
  details?: Record<string, any>;
}

export interface RegisteredTool {
  name: string;
  filePath: string;
  lineNumber: number;
  description?: string;
  hasInputSchema: boolean;
  hasErrorBoundary: boolean;
  hasTimeoutGuard: boolean;
  hasSentrySpan?: boolean;
  hasSentryBreadcrumb?: boolean;
  hasSentryErrorCapture?: boolean;
  isReferencedElsewhere: boolean;
  handlerNodeText?: string;
}

export interface ProjectFingerprint {
  projectPath: string;
  hasPackageJson: boolean;
  packageName?: string;
  packageVersion?: string;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  mcpDetected: boolean;
  sdkVersion?: string;
  transports: TransportType[];
  integrations: {
    sentry: IntegrationStatus;
    opentelemetry: IntegrationStatus;
    winston: IntegrationStatus;
    pino: IntegrationStatus;
    retries: IntegrationStatus;
  };
  tools: RegisteredTool[];
  sourceFiles: string[];
  serverInstantiations: Array<{
    filePath: string;
    lineNumber: number;
    variableName?: string;
    serverName?: string;
  }>;
}

export interface RuntimeCallLog {
  timestamp: string | number;
  tool: string;
  argsHash: string;
  durationMs: number;
  success: boolean;
  error?: string;
  sessionId?: string;
}

export interface Finding {
  ruleId: string;
  ruleName: string;
  category: RuleCategory;
  severity: Severity;
  message: string;
  filePath?: string;
  lineNumber?: number;
  toolName?: string;
  suggestedFix?: string;
  fixable: boolean;
}

export interface FixResult {
  ruleId: string;
  fixed: boolean;
  description: string;
  filePath?: string;
  diff?: string;
  error?: string;
}

export interface RuleContext {
  projectPath: string;
  fingerprint: ProjectFingerprint;
  logs?: RuntimeCallLog[];
  options?: Record<string, any>;
}

export interface FixContext extends RuleContext {
  dryRun?: boolean;
  specificRuleIds?: string[];
}

export interface Rule {
  id: string;
  name: string;
  description: string;
  category: RuleCategory;
  defaultSeverity: Severity;
  detect?: (fingerprint: ProjectFingerprint) => boolean | Promise<boolean>;
  evaluate: (context: RuleContext) => Finding[] | Promise<Finding[]>;
  fix?: (context: FixContext) => Promise<FixResult[]> | FixResult[];
}

export interface DoctorConfig {
  rules?: Record<
    string,
    "off" | "warn" | "error" | { severity?: "off" | "warn" | "error"; options?: any }
  >;
  ignorePatterns?: string[];
  logs?: string;
  rulesDir?: string;
}

export interface AuditReport {
  summary: {
    totalFindings: number;
    errors: number;
    warnings: number;
    info: number;
    toolsAnalyzed: number;
    fingerprint: ProjectFingerprint;
  };
  findings: Finding[];
  timestamp: string;
  runtimeLogsAnalyzed?: number;
}
