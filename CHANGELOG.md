# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-09-11

### Added
- **Core Detection & AST Fingerprinting Layer**:
  - `detectProject()` analyzing `package.json` and static source files via `ts-morph`.
  - Automatic detection of MCP transport mechanisms (`stdio`, `sse`, `streamable-http`).
  - Integration status scanner for Sentry, OpenTelemetry, Winston, Pino, and retry libraries.
- **Core Structural Rule Pack**:
  - `core/duplicate-tools`: Identifies duplicate tool registrations across the codebase.
  - `core/description-quality`: Audits tool descriptions for length (<20 chars), vagueness, or bloating.
  - `core/missing-input-schema`: Flags tool handlers accepting inputs without schema definitions.
  - `core/error-boundary`: Detects handlers lacking `try/catch` error boundaries with automated codemod fixes.
  - `core/timeout-guard`: Flags async tool handlers missing `AbortSignal` or timeout bounds.
  - `core/unreferenced-tool`: Flags registered tools without references in tests or docs.
- **Runtime Behavioral Analysis Pack**:
  - `withDoctorLogging()` telemetry middleware appending calls to `.mcpdoctor/calls.jsonl`.
  - `runtime/duplicate-calls`: Detects repeated identical tool invocations within a session.
  - `runtime/dead-tools`: Identifies tools with 0 invocations across call logs.
  - `runtime/slow-tools`: Detects p95 latency outliers (> 3000ms).
  - `runtime/high-failure-rate`: Flags tools with $\ge 20\%$ failure rates.
- **Sentry Integration Pack**:
  - `sentry/init-config`: Audits `Sentry.init` configuration keys (`dsn`, `environment`, `release`).
  - `sentry/tool-spans`: Enforces `Sentry.startSpan` transaction wrapping.
  - `sentry/error-capture`: Ensures exceptions are forwarded to `Sentry.captureException`.
  - `sentry/breadcrumbs`: Injects `Sentry.addBreadcrumb` at tool invocations.
- **CLI Commands**:
  - `mcp-doctor detect [dir]`: Print normalized project fingerprint.
  - `mcp-doctor check [dir]`: Run static completeness and runtime behavioral audit with colorized terminal and `--json` reporting.
  - `mcp-doctor fix [dir]`: Apply automated AST codemod fixes with `--dry-run` unified diff preview.
  - `mcp-doctor init [dir]`: Scaffold `mcpdoctor.config.js` and `.mcpdoctor/` workspace.
