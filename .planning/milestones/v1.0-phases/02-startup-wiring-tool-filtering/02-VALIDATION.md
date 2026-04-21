---
phase: 2
slug: startup-wiring-tool-filtering
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-19
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.x |
| **Config file** | `apps/cli/vitest.config.ts` |
| **Quick run command** | `yarn workspace @happier-dev/cli vitest run src/settings/sessionAgentToolsSettings.test.ts src/mcp/createHappierMcpServer.test.ts` |
| **Full suite command** | `yarn workspace @happier-dev/cli vitest run` |
| **Estimated runtime** | ~10 seconds (unit), ~30 seconds (full with integration) |

---

## Sampling Rate

- **After every task commit:** Run `yarn workspace @happier-dev/cli vitest run src/settings/sessionAgentToolsSettings.test.ts src/mcp/createHappierMcpServer.test.ts`
- **After every plan wave:** Run `yarn workspace @happier-dev/cli vitest run` (unit suite only)
- **Before `/gsd-verify-work`:** Full unit suite green + integration test for TOOLS-01 green
- **Max feedback latency:** ~30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 0 | STARTUP-01 | — | N/A | unit | `yarn workspace @happier-dev/cli vitest run src/settings/sessionAgentToolsSettings.test.ts` | ❌ W0 (rename needed) | ⬜ pending |
| 02-01-02 | 01 | 0 | STARTUP-02 | — | N/A | unit | `yarn workspace @happier-dev/cli vitest run src/settings/sessionAgentToolsSettings.test.ts` | ❌ W0 (rename needed) | ⬜ pending |
| 02-01-03 | 01 | 0 | STARTUP-03 | — | N/A | unit | `yarn workspace @happier-dev/cli vitest run src/settings/sessionAgentToolsSettings.test.ts` | ❌ W0 (rename needed) | ⬜ pending |
| 02-02-01 | 02 | 0 | TOOLS-01 | — | N/A | unit | `yarn workspace @happier-dev/cli vitest run src/mcp/server/registerHappierMcpBuiltInTools.test.ts` | ❌ W0 (new file) | ⬜ pending |
| 02-02-02 | 02 | 1 | TOOLS-01 | — | N/A | unit | `yarn workspace @happier-dev/cli vitest run src/mcp/createHappierMcpServer.test.ts` | ✅ (extend) | ⬜ pending |
| 02-02-03 | 02 | 1 | STARTUP-01 | — | N/A | unit | `yarn workspace @happier-dev/cli vitest run src/mcp/createHappierMcpServer.test.ts` | ✅ (extend) | ⬜ pending |
| 02-03-01 | 03 | 1 | TOOLS-01 | — | N/A | integration | `yarn workspace @happier-dev/cli vitest run src/mcp/startHappyServer.integration.test.ts` | ✅ (extend) | ⬜ pending |
| 02-03-02 | 03 | 1 | STARTUP-01 | — | N/A | integration | `yarn workspace @happier-dev/cli vitest run src/mcp/startHappyServer.integration.test.ts` | ✅ (extend) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/cli/src/settings/mcpToolsSettings.test.ts` — rename to `sessionAgentToolsSettings.test.ts` + update all internals (prerequisite for STARTUP-01/02/03 unit tests)
- [ ] `apps/cli/src/mcp/server/registerHappierMcpBuiltInTools.test.ts` — new file; stubs for TOOLS-01 unit coverage

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Tool absent from MCP inspector after daemon restart | TOOLS-01 | End-to-end daemon start requires live MCP client | Edit `~/.happier/settings.json` to set a tool `enabled: false`; restart daemon; verify tool absent via `npx @modelcontextprotocol/inspector` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
