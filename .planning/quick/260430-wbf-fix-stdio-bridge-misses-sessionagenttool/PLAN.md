---
id: 260430-wbf
slug: fix-stdio-bridge-misses-sessionagenttool
title: Fix STDIO bridge ignoring sessionAgentToolsSettingsV1 filter
date: "2026-04-30"
status: complete
---

# Fix: STDIO bridge bypasses sessionAgentToolsSettingsV1 tool filter

## Problem

`sessionAgentToolsSettingsV1` with `default: false` had no effect — all
`mcp__happier__*` tools remained visible to the session agent even after a
daemon restart and full yarn build.

Root cause: the HTTP MCP server (`registerHappierMcpBuiltInTools`) correctly
filters tools via the `isSessionAgentToolEnabled` predicate, but the **STDIO
bridge** (`registerHappierMcpBridgeTools`) is a separate subprocess that was
never wired to receive the predicate. It listed and registered all tools from
the catalog unconditionally, so the session agent saw the full tool list
regardless of settings.

## Files changed

| File | Change |
|------|--------|
| `apps/cli/src/backends/codex/registerHappierMcpBridgeTools.ts` | Added optional `isToolEnabled` predicate parameter; skip tools that don't pass it |
| `apps/cli/src/backends/codex/happyMcpStdioBridge.ts` | Read `HAPPIER_ENABLED_SESSION_AGENT_TOOLS` env var (comma-separated names); build predicate and pass to `registerHappierMcpBridgeTools` |
| `apps/cli/src/agent/runtime/createHappierMcpBridge.ts` | Spread `HAPPIER_ENABLED_SESSION_AGENT_TOOLS` (from `startHappyServer` `toolNames`) into the STDIO bridge subprocess env |

## Approach

`startHappyServer` already computes and returns `toolNames` (the
already-filtered list). `createHappierMcpBridge` now forwards those names to
the STDIO bridge subprocess via env var. The bridge reads the env var and
builds a `Set`-based predicate. Absent or empty env var → all tools enabled
(backwards-compatible).

No settings-reading logic is duplicated — `startHappyServer` remains the
single source of truth for applying `sessionAgentToolsSettingsV1`.
