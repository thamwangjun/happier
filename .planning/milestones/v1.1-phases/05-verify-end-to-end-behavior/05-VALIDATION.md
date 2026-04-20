---
phase: 5
slug: verify-end-to-end-behavior
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-20
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.2.4 |
| **Config file** | `apps/cli/vitest.config.ts` |
| **Quick run command** | `yarn workspace @happier-dev/cli test:unit -- src/backends/claude/remote/claudeRemoteAgentSdk.baselineTurnCompletion.test.ts` |
| **Full suite command** | `yarn workspace @happier-dev/cli test:unit` |
| **Estimated runtime** | ~2 seconds |

---

## Sampling Rate

- **After every task commit:** Run `yarn workspace @happier-dev/cli test:unit -- src/backends/claude/remote/claudeRemoteAgentSdk.baselineTurnCompletion.test.ts`
- **After every plan wave:** Run `yarn workspace @happier-dev/cli test:unit`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~2 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 05-01-01 | 01 | 1 | TURN-06 (SC-3 baseline) | — | N/A | unit | `yarn workspace @happier-dev/cli test:unit -- src/backends/claude/remote/claudeRemoteAgentSdk.baselineTurnCompletion.test.ts` | ❌ W0 | ⬜ pending |
| 05-01-02 | 01 | 1 | TURN-06 (SC-3 multi) | — | N/A | unit | `yarn workspace @happier-dev/cli test:unit -- src/backends/claude/remote/claudeRemoteAgentSdk.baselineTurnCompletion.test.ts` | ❌ W0 | ⬜ pending |
| 05-01-03 | 01 | 1 | TURN-06 (SC-1) | — | N/A | code-inspection | VERIFICATION.md artifact | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/cli/src/backends/claude/remote/claudeRemoteAgentSdk.baselineTurnCompletion.test.ts` — new file; covers TURN-06 SC-3 baseline and multi-subagent scenario

*(Existing infrastructure covers all other requirements — `subagentTurnCompletion.test.ts` is already green for SC-2)*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| SC-1: `task_notification` handler calls `finalizeSubagentTurn()` not `finalizeCurrentTurn()` | TURN-06 | Static code inspection — no runtime test required; the call site is a direct read of the production source | Read `apps/cli/src/backends/claude/remote/claudeRemoteAgentSdk.ts` line ~1554–1561; confirm `finalizeSubagentTurn()` is called and `finalizeCurrentTurn()` is NOT called in the `task_notification` branch |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 2s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
