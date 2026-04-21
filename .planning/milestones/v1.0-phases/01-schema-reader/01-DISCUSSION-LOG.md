# Phase 1: Schema & Reader - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-18
**Phase:** 01-schema-reader
**Areas discussed:** Schema location, Settings interface typing, Reader return contract

---

## Schema location

| Option | Description | Selected |
|--------|-------------|----------|
| `apps/cli/src/settings/` | Schema + reader in mcpToolsSettings.ts. CLI-local concern stays CLI-local. No protocol package changes. | ✓ |
| `packages/protocol` + CLI reader | Schema in protocol (like memorySettings pattern), reader in apps/cli/src/settings/. Worth it only if server or mobile will ever read this config. | |
| You decide | Claude picks based on codebase patterns. | |

**User's choice:** `apps/cli/src/settings/` — schema + reader co-located in `mcpToolsSettings.ts`
**Notes:** Chose the recommended option. Protocol package stays clean; this schema has no cross-boundary consumers in v1.0.

---

## Settings interface typing

| Option | Description | Selected |
|--------|-------------|----------|
| `mcpToolsSettingsV1?: unknown` | Mirrors `memory?: unknown`. persistence.ts stays a dumb envelope; typed access only via the dedicated reader module. | |
| `mcpToolsSettingsV1?: McpToolsSettingsV1` | Typed directly. Requires importing the schema type into persistence.ts via `import type`. | ✓ |
| Don't add to Settings interface | Read `mcpToolsSettingsV1` directly from raw JSON without touching the Settings interface. | |

**User's choice:** `mcpToolsSettingsV1?: McpToolsSettingsV1` — typed import
**Notes:** Departed from the `memory?: unknown` precedent by choice. Provides compile-time safety at the `readSettings()` call site. Will use `import type` to avoid runtime circular dependency risk.

---

## Reader return contract

| Option | Description | Selected |
|--------|-------------|----------|
| Always return McpToolsSettingsV1 | Default = all tools enabled. Never null. `logger.warn` only on schema parse failure. Matches `readMcpServersSettingsFromAccountSettings` pattern. | ✓ |
| Return default + source discriminant | Same defaults, but includes a `source` field: `'default' \| 'parsed' \| 'fallback'`. | |
| You decide | Claude picks based on codebase patterns. | |

**User's choice:** Always return `McpToolsSettingsV1`
**Notes:** Consistent with existing settings reader conventions. Phase 3 unknown-name diagnostics can add provenance tracking if needed.

---

## Claude's Discretion

- Exact Zod schema ergonomics (`.strict()`, `.passthrough()`, `.preprocess()`)
- Whether to export a `McpToolsSettingsV1` type alias or rely on `z.infer<>` at use sites

## Deferred Ideas

None
