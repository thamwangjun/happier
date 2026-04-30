---
id: 260430-wbf
status: complete
date: "2026-04-30"
commit: (uncommitted — changes staged in worktree workspace/thamw-mcp-config-ext1)
---

# Summary

Fixed STDIO bridge bypassing `sessionAgentToolsSettingsV1` tool filter.

Three files changed: predicate parameter added to `registerHappierMcpBridgeTools`,
env var read in `happyMcpStdioBridge`, env var forwarded from `createHappierMcpBridge`.
Type-check passed cleanly.
