# Phase 2: Startup Wiring & Tool Filtering - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-19
**Phase:** 02-startup-wiring-tool-filtering
**Areas discussed:** Surface key for filtering, toolNames return value, Filter scope

---

## Surface key for filtering

| Option | Description | Selected |
|--------|-------------|----------|
| `session_agent` surface | Matches what createHappierMcpServer actually registers; filter, snapshot, and Phase 3 validation all reference the same tool set. 9 divergence points with `mcp` surface confirmed. | ✓ |
| `mcp` surface | Semantically clearer name for devs reading the config, but 9 divergence points mean filter and registration immediately disagree. | |

**User's choice:** `session_agent`

**Notes:** User explicitly added that naming/schema of all settings and interfaces introduced or modified should reflect `session_agent` semantics — not `mcp`-branded names. This triggered a retroactive rename decision for Phase 1 artifacts (`mcpToolsSettingsV1` → `sessionAgentToolsSettingsV1` everywhere). Rename to be handled as part of Phase 2 plan, not a separate fixup.

---

## toolNames return value

| Option | Description | Selected |
|--------|-------------|----------|
| Filtered — enabled tools only | Consistent with createHappierMcpServer's own return. No current caller uses the field but future callers get a truthful list. | ✓ |
| Unfiltered — all tools | Simpler. Current caller (createHappierMcpBridge) discards the field anyway. Useful for future diagnostics UI. | |

**User's choice:** Filtered — enabled tools only

**Notes:** No additional context provided.

---

## Filter scope

| Option | Description | Selected |
|--------|-------------|----------|
| Requirement unambiguous, no code change | Schema key `tools` and SDK method difference (`registerTool` vs `registerResource`) already encode the boundary. | |
| Add one-line comment at registerHappierMcpResources call site | Documents the intentional bypass. Prevents future reviewers from flagging as an oversight. | ✓ |
| Extend schema to include `resources` key | Premature — no requirement for resource filtering exists. | |

**User's choice:** Add the one-line comment

**Notes:** No additional context provided.

---

## Claude's Discretion

- Exact parameter shape for threading the predicate into `createHappierMcpServer`
- Whether predicate helper lives in `sessionAgentToolsSettings.ts` or inline in `startHappyServer`
- Zod ergonomics for the rename

## Deferred Ideas

None.
