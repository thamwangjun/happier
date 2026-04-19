---
phase: 3
slug: validation-feedback
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-19
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.x |
| **Config file** | `apps/cli/vitest.config.ts` |
| **Quick run command** | `cd apps/cli && yarn test:unit --reporter=verbose src/settings/sessionAgentToolsSettings.test.ts` |
| **Full suite command** | `cd apps/cli && yarn test:unit` |
| **Estimated runtime** | ~5 seconds (unit), ~30 seconds (full) |

---

## Sampling Rate

- **After every task commit:** Run `cd apps/cli && yarn test:unit src/settings/sessionAgentToolsSettings.test.ts`
- **After every plan wave:** Run `cd apps/cli && yarn test:unit`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 3-01-01 | 01 | 1 | VALID-01 | — | N/A | unit | `cd apps/cli && yarn test:unit src/settings/sessionAgentToolsSettings.test.ts` | ✅ | ⬜ pending |
| 3-01-02 | 01 | 1 | VALID-01 | — | N/A | unit | `cd apps/cli && yarn test:unit src/settings/sessionAgentToolsSettings.test.ts` | ✅ | ⬜ pending |
| 3-01-03 | 01 | 1 | TOOLS-02 | — | N/A | unit | `cd apps/cli && yarn test:unit src/settings/sessionAgentToolsSettings.test.ts` | ✅ | ⬜ pending |
| 3-01-04 | 01 | 1 | VALID-01 | — | N/A | integration | `cd apps/cli && yarn test:integration src/mcp/startHappyServer.integration.test.ts` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. No new test files, no new config, no new fixtures are required. New test cases are added to existing test files.

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Developer sees warn in daemon log at startup | VALID-01 | Log file inspection requires running real daemon | 1. Write `sessionAgentToolsSettingsV1: { v: 1, tools: { "change-title": { enabled: false } } }` to `~/.happier-dev/settings.json`. 2. Run `happier daemon start`. 3. Check daemon log file for `[sessionAgentToolsSettings] Unknown tool names` warn entry. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
