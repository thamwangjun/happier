---
phase: 4
slug: restructure-finalizecurrentturn
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-19
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `apps/cli/vitest.config.ts` |
| **Quick run command** | `yarn workspace @happier-dev/cli test --run claudeRemoteAgentSdk` |
| **Full suite command** | `yarn workspace @happier-dev/cli test --run` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `yarn workspace @happier-dev/cli test --run claudeRemoteAgentSdk`
- **After every plan wave:** Run `yarn workspace @happier-dev/cli test --run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 4-01-01 | 01 | 1 | TURN-01 | — | N/A | unit | `yarn workspace @happier-dev/cli test --run claudeRemoteAgentSdk.subagentTurnCompletion` | ❌ W0 | ⬜ pending |
| 4-01-02 | 01 | 1 | TURN-02 | — | N/A | unit | `yarn workspace @happier-dev/cli test --run claudeRemoteAgentSdk.subagentTurnCompletion` | ❌ W0 | ⬜ pending |
| 4-01-03 | 01 | 1 | TURN-03 | — | N/A | unit | `yarn workspace @happier-dev/cli test --run claudeRemoteAgentSdk.subagentTurnCompletion` | ❌ W0 | ⬜ pending |
| 4-02-01 | 02 | 2 | TURN-05 | — | N/A | unit | `yarn workspace @happier-dev/cli test --run claudeRemoteAgentSdk` | ✅ | ⬜ pending |
| 4-02-02 | 02 | 2 | TEST-01 | — | N/A | unit | `yarn workspace @happier-dev/cli test --run claudeRemoteAgentSdk.subagentTurnCompletion` | ❌ W0 | ⬜ pending |
| 4-02-03 | 02 | 2 | TEST-02 | — | N/A | unit | `yarn workspace @happier-dev/cli test --run claudeRemoteAgentSdk.subagentTurnCompletion` | ❌ W0 | ⬜ pending |
| 4-02-04 | 02 | 2 | TEST-03 | — | N/A | unit | `yarn workspace @happier-dev/cli test --run claudeRemoteAgentSdk.subagentTurnCompletion` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/cli/src/backends/claude/remote/claudeRemoteAgentSdk.subagentTurnCompletion.test.ts` — test stubs for TEST-01, TEST-02, TEST-03

*Wave 0 creates the test file with failing stubs before implementation tasks run.*

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
