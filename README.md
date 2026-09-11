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

## 📄 License

MIT © [mcp-doctor contributors](LICENSE)
