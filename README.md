# mcpdx 🩺 (mcp-doctor)

[![npm version](https://img.shields.io/npm/v/@valipireddykowshik/mcpdx.svg)](https://www.npmjs.com/package/@valipireddykowshik/mcpdx)
[![CI](https://github.com/kowshik3383/mcpdx/actions/workflows/ci.yml/badge.svg)](https://github.com/kowshik3383/mcpdx/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node-18%2B-brightgreen)](https://nodejs.org)

> **"mcpdx audits an MCP server's static schema and runtime call logs, flags missing best-practice wiring for detected integrations (Sentry, OTel, retries), and offers automated fixes."**

Think of **mcpdx** (executable as `mcpdx` or `mcp-doctor`) as a *"react-scan for MCP"* — shaped as an opinionated completeness auditor. It detects what is already wired into your Model Context Protocol server (Sentry, OpenTelemetry, Pino, Winston, etc.), evaluates your tool implementations against standard production checklists, checks runtime behavioral logs for tool loops or dead tools, and automatically applies AST codemod fixes.

---

## ⚡ 30-Second Quickstart

Run directly in the root of any TypeScript or JavaScript MCP server repository with zero configuration:

```bash
# 1. Fingerprint your server and detected integrations
npx @valipireddykowshik/mcpdx detect

# 2. Run static completeness & structural audit
npx @valipireddykowshik/mcpdx check

# 3. Preview automated codemod fixes (diff preview)
npx @valipireddykowshik/mcpdx fix --dry-run

# 4. Apply automated fixes to your codebase
npx @valipireddykowshik/mcpdx fix
```

*(Note: `npx mcp-doctor` is also supported as an alias!)*

---

## 📑 Table of Contents

- [Why mcpdx?](#-why-mcpdx)
- [30-Second Quickstart](#-30-second-quickstart)
- [Sample Audit Output](#-sample-audit-output)
- [Core CLI Commands](#-core-cli-commands)
- [Rule Packs Reference](#-rule-packs)
  - [Core Structural Pack](#1-core-structural-pack-zero-dependencies-required)
  - [Runtime Behavioral Pack](#2-runtime-behavioral-pack-requires-call-logs)
  - [Sentry Integration Pack](#3-sentry-integration-pack-active-when-sentrynode-is-detected)
- [Optional Runtime Telemetry Middleware](#-optional-runtime-telemetry-middleware)
- [Comparison: mcpdx vs ESLint](#-comparison-mcpdx-vs-traditional-linters)
- [Configuration (`mcpdoctor.config.js`)](#️-configuration-mcpdoctorconfigjs)
- [CI/CD Automation](#-cicd-automation)
- [Frequently Asked Questions (FAQ)](#-frequently-asked-questions-faq)
- [License](#-license)

---

## 🎯 Why mcpdx?

Building a Model Context Protocol (MCP) server for Claude Desktop, Cursor, or AI agents is easy to start, but difficult to harden for production:
- **Unhandled exceptions crash the entire stdio connection**, disconnecting Claude or Cursor immediately.
- **Unvalidated or vague tool descriptions** cause LLMs to hallucinate arguments or trigger infinite tool loops.
- **Missing observability** leaves developers blind when an agent fails multi-turn planning in production.

`mcpdx` acts as an automated doctor: it runs static AST inspections across your codebase, evaluates real runtime call logs, and patches missing error boundaries and Sentry spans with **one command**.

---

## 📊 Sample Audit Output

```text
🩺 mcp-doctor — Completeness & Structural Audit
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Server: my-mcp-server | Tools: 6 | Transports: stdio
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔴 ERRORS (2)
────────────────────────────────────────
  ✖ Tool Error Boundary [tool: execute_raw_sql] (src/tools.ts:42)
     Tool "execute_raw_sql" handler body does not contain a try/catch error boundary.
     Fix: Wrap tool handler execution in a try/catch block returning { isError: true, ... }.
     ⚡ Auto-fix available via: mcp-doctor fix

  ✖ Sentry Tool Error Capture [tool: search_docs] (src/tools.ts:18)
     Tool "search_docs" handler does not forward failures to Sentry.captureException().
     Fix: Call Sentry.captureException(error) in the catch block of "search_docs".
     ⚡ Auto-fix available via: mcp-doctor fix

⚠️  WARNINGS (2)
────────────────────────────────────────
  ▲ Sentry Initialization & Configuration (src/index.ts:12)
     Sentry.init() is missing standard configuration key(s): environment, release.
     Fix: Configure environment, release in Sentry.init({...}).
     ⚡ Auto-fix available via: mcp-doctor fix

  ▲ Tool Timeout Guard [tool: fetch_remote_url] (src/tools.ts:89)
     Tool "fetch_remote_url" handler does not have a timeout guard or AbortSignal handling.
     Fix: Pass extra.signal to fetch/subprocesses, or wrap handler with AbortSignal.timeout(30000).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Summary: 2 error(s) | 2 warning(s) across 6 registered tool(s)
```

---

## 🧭 Scope & Non-Goals

To maintain high reliability, speed, and focus, v1 explicitly adheres to the following scope boundaries:

- **Target Runtime**: Node.js 18+ (Node/TypeScript-first ecosystem).
- **Out of Scope for v1**:
  - Live proxy / GUI dashboard *(planned for v2)*
  - Python-based MCP servers *(planned for v2)*
  - IDE extensions *(planned for v2)*
  - Hosted cloud SaaS *(planned for v2)*

---

## 📦 Core CLI Commands

### 1. `mcp-doctor detect [dir]`
Scans `package.json` dependencies and runs an AST scan with `ts-morph` to produce a normalized project fingerprint:
- Installed & in-use integrations (Sentry, OpenTelemetry, Winston, Pino, retries)
- Transport types (stdio, SSE, streamable-http)
- Registered tools and their capabilities

```bash
npx mcp-doctor detect
# Output as JSON for CI or automation:
npx mcp-doctor detect --json
```

### 2. `mcp-doctor check [dir]`
Runs the completeness audit across static code and optional runtime logs.
```bash
npx mcp-doctor check

# Cross-reference with runtime call logs:
npx mcp-doctor check --logs .mcpdoctor/calls.jsonl

# Run a specific rule or category:
npx mcp-doctor check --rule core/duplicate-tools
npx mcp-doctor check --category sentry

# CI Mode (outputs JSON and sets exit codes):
npx mcp-doctor check --json
```

**Exit Codes:**
- `0`: Clean (no errors, no warnings)
- `1`: Warnings only
- `2`: Errors detected

### 3. `mcp-doctor fix [dir]`
Performs automated AST codemods using `ts-morph` to inject missing error boundaries, Sentry breadcrumbs, spans, and initialization keys.

```bash
# Preview changes with colorized unified diffs:
npx mcp-doctor fix --dry-run

# Interactively review and apply fixes:
npx mcp-doctor fix

# Apply all fixes non-interactively:
npx mcp-doctor fix --yes
```

### 4. `mcp-doctor init [dir]`
Scaffolds `mcpdoctor.config.js` and initializes `.mcpdoctor/` directory.

```bash
npx mcp-doctor init
```

---

## 🪵 Optional Runtime Telemetry Middleware

To unlock behavioral rules (dead tools, repeated duplicate calls, slow tools, failure rate outliers), add the one-line logging middleware:

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { withDoctorLogging } from "mcp-doctor";

const server = withDoctorLogging(
  new McpServer({
    name: "my-mcp-server",
    version: "1.0.0",
  })
);

// Tool calls now automatically record latency, success, and hashed args
// into .mcpdoctor/calls.jsonl
```

Cross-check runtime behavior:
```bash
npx mcp-doctor check --logs .mcpdoctor/calls.jsonl
```

*Note: Runtime logging is completely optional. Static audit works out of the box with zero code changes.*

---

## 📋 Rule Packs

### 1. Core Structural Pack (Zero dependencies required)
| Rule ID | Severity | Description | Fixable |
|---|---|---|:---:|
| `core/duplicate-tools` | `error` | Flags duplicate tool names registered across the server | ❌ |
| `core/description-quality` | `warn` / `error` | Detects missing, short (<20 chars), vague, or bloated descriptions | ❌ |
| `core/missing-input-schema` | `warn` | Checks if tool handlers accept arguments without schema validation | ❌ |
| `core/error-boundary` | `error` | Ensures tool handlers have try/catch error boundaries | ⚡ Yes |
| `core/timeout-guard` | `warn` | Flags async tool handlers without AbortSignal or timeout guards | ❌ |
| `core/unreferenced-tool` | `info` | Flags registered tools unreferenced in tests or documentation | ❌ |

### 2. Runtime Behavioral Pack (Requires call logs)
| Rule ID | Severity | Description | Fixable |
|---|---|---|:---:|
| `runtime/duplicate-calls` | `warn` | Flags repeated identical tool calls (same tool + argsHash) in a session | ❌ |
| `runtime/dead-tools` | `info` | Identifies tools registered in code but with 0 invocations | ❌ |
| `runtime/slow-tools` | `warn` | Detects tools with p95 duration outliers (> 3000ms) | ❌ |
| `runtime/high-failure-rate` | `error` | Detects tools with >= 20% failure rate across calls | ❌ |

### 3. Sentry Integration Pack (Active when `@sentry/node` is detected)
| Rule ID | Severity | Description | Fixable |
|---|---|---|:---:|
| `sentry/init-config` | `error` | Verifies `Sentry.init` is called with `dsn`, `environment`, and `release` | ⚡ Yes |
| `sentry/tool-spans` | `warn` | Ensures tool handlers are wrapped in `Sentry.startSpan` | ⚡ Yes |
| `sentry/error-capture` | `error` | Ensures tool failures are routed to `Sentry.captureException` | ⚡ Yes |
| `sentry/breadcrumbs` | `warn` | Injects `Sentry.addBreadcrumb` at tool invocation start | ⚡ Yes |

---

## ⚙️ Configuration (`mcpdoctor.config.js`)

You can customize rule severities or add exclusions by creating `mcpdoctor.config.js`:

```javascript
/** @type {import('mcp-doctor').DoctorConfig} */
export default {
  rules: {
    "core/timeout-guard": "error",
    "core/unreferenced-tool": "off",
    "runtime/slow-tools": {
      severity: "warn",
      options: { slowThresholdMs: 2000 }
    }
  },
  logs: ".mcpdoctor/calls.jsonl",
  ignorePatterns: ["node_modules", "dist", ".git", "fixtures"]
};
```

---

## 🔌 Authoring Custom Rule Packs

You can easily define and register custom rules using the `Rule` plugin interface:

```typescript
import { Rule, defaultRuleRegistry } from "mcp-doctor";

export const customAuthRule: Rule = {
  id: "security/require-auth-header",
  name: "Require Authorization Guard",
  description: "Ensures sensitive tools verify user authorization",
  category: "security",
  defaultSeverity: "error",

  evaluate({ fingerprint }) {
    const findings = [];
    for (const tool of fingerprint.tools) {
      if (tool.name.startsWith("admin_") && !tool.handlerNodeText?.includes("auth")) {
        findings.push({
          ruleId: "security/require-auth-header",
          ruleName: "Require Authorization Guard",
          category: "security",
          severity: "error",
          toolName: tool.name,
          filePath: tool.filePath,
          message: `Admin tool "${tool.name}" does not verify authorization.`,
          fixable: false,
        });
      }
    }
    return findings;
  }
};

defaultRuleRegistry.register(customAuthRule);
```

---

## ⚖️ Comparison: mcpdx vs Traditional Linters

| Capability | ESLint / Biome | Manual Code Review | **mcpdx** |
|---|:---:|:---:|:---:|
| **MCP SDK Understanding** | ❌ File-scoped only | ⚠️ Error-prone | ✅ Full project AST walk |
| **Tool Completeness Auditing** | ❌ None | ⚠️ Manual checklist | ✅ Automated 14-rule audit |
| **Runtime Behavior & Dead Tools** | ❌ Static only | ❌ Hard to trace | ✅ Analyzes `.jsonl` call logs |
| **Sentry / OTel Wiring Verification** | ❌ None | ⚠️ Often overlooked | ✅ Checklist + Missing key alerts |
| **Automated AST Codemod Fixes** | ⚠️ Lint fixes only | ❌ Manual | ✅ One-command codemod (`fix`) |
| **Zero-Config Execution** | ❌ Config required | ❌ N/A | ✅ Run with `npx` instantly |

---

## 🔄 CI/CD Automation

Run `mcpdx` inside GitHub Actions to block pull requests that introduce broken MCP tool schemas or missing error boundaries:

```yaml
name: MCP Completeness Audit

on: [push, pull_request]

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npx @valipireddykowshik/mcpdx check --json
```

**Exit Codes for CI:**
- `0`: All checks passed clean.
- `1`: Warnings only (e.g. description could be improved).
- `2`: Errors found (unhandled error boundary, duplicate tool, missing schema).

---

## ❓ Frequently Asked Questions (FAQ)

### Why do MCP servers crash or disconnect in Claude Desktop / Cursor?
In the Model Context Protocol stdio transport, any unhandled JavaScript exception thrown inside a tool handler terminates the Node.js process or closes the standard I/O stream without sending a JSON-RPC error response. This causes Claude Desktop or Cursor to display *"Server disconnected"*. `mcpdx` flags missing `try/catch` error boundaries and can automatically patch them with `mcpdx fix`.

### What causes duplicate tool calls or agent looping?
When an AI agent invokes an MCP tool but receives ambiguous, empty, or uninformative responses, the model repeatedly attempts the same tool invocation with identical arguments. `mcpdx check --logs` detects repeated identical calls and pinpoints the responsible tool.

### How do I add Sentry distributed tracing to an MCP server?
Installing `@sentry/node` is only the first step. To trace tool latency and errors, each tool handler must be wrapped in `Sentry.startSpan()` and catch blocks must route to `Sentry.captureException()`. `mcpdx` audits this automatically and patches missing spans and breadcrumbs with `mcpdx fix`.

### Does mcpdx support Python MCP servers?
v1 focuses on Node.js / TypeScript (the primary MCP SDK reference ecosystem). Python FastMCP support is planned on our v2 roadmap!

---

## 📄 License

MIT © [kowshik3383](LICENSE)
