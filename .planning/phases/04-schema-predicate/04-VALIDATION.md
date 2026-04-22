---
phase: 4
slug: schema-predicate
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-22
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 3.x |
| **Config file** | `apps/cli/vitest.config.ts` |
| **Quick run command** | `yarn workspace @happier-dev/cli test --run apps/cli/src/settings/sessionAgentToolsSettings.test.ts` |
| **Full suite command** | `yarn workspace @happier-dev/cli test --run` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick run command
- **After every plan wave:** Run full suite command
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 04-01-01 | 01 | 1 | SCHEMA-01, SCHEMA-02, SCHEMA-03, SCHEMA-04, VALID-01 | — | Non-boolean `default` falls back to DEFAULT_SESSION_AGENT_TOOLS_SETTINGS (no throw) | unit | `yarn workspace @happier-dev/cli test --run apps/cli/src/settings/sessionAgentToolsSettings.test.ts` | ✅ | ⬜ pending |
| 04-01-02 | 01 | 1 | SCHEMA-01, SCHEMA-02, SCHEMA-03, SCHEMA-04, VALID-01 | — | All predicate cases covered by 6 new test cases | unit | `yarn workspace @happier-dev/cli test --run apps/cli/src/settings/sessionAgentToolsSettings.test.ts` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

All phase behaviors have automated verification.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
