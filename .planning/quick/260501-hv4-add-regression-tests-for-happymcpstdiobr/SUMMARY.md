---
id: 260501-hv4
status: complete
date: "2026-05-01"
---

# Summary

Added `apps/cli/src/backends/codex/happyMcpStdioBridge.toolFilter.test.ts` — 3 regression
tests covering the STDIO bridge's switch from env-var tool filtering to direct settings reading.

Tests mock `readSettings`, `registerHappierMcpBridgeTools`, and the MCP SDK so `main()` can
run synchronously in tests. Each test asserts `readSettings` was called (old code skips it →
assertion fails) and verifies `isToolEnabled` correctly reflects `sessionAgentToolsSettings`.

| Test | Scenario | Guards against |
|------|----------|----------------|
| BRIDGE-01 | Named tool disabled in settings | Per-tool filter not applied |
| BRIDGE-02 | `default: false` (all-disabled) | Empty env var fell through guard → all shown |
| BRIDGE-03 | No settings → all enabled | Backward compat regression |

All 3 passed on first run after adding `vi.clearAllMocks()` to `beforeEach`.
