---
phase: 1
slug: schema-reader
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-19
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.x |
| **Config file** | `apps/cli/vitest.config.ts` |
| **Quick run command** | `yarn workspace @happier-dev/cli vitest run src/settings/mcpToolsSettings.test.ts` |
| **Full suite command** | `yarn workspace @happier-dev/cli vitest run` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `yarn workspace @happier-dev/cli vitest run src/settings/mcpToolsSettings.test.ts`
- **After every plan wave:** Run `yarn workspace @happier-dev/cli vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 1-01-01 | 01 | 1 | SCHEMA-01 | — | N/A | unit | `yarn workspace @happier-dev/cli vitest run src/settings/mcpToolsSettings.test.ts` | ❌ W0 | ⬜ pending |
| 1-01-02 | 01 | 1 | SCHEMA-01 | — | N/A | unit | `yarn workspace @happier-dev/cli vitest run src/settings/mcpToolsSettings.test.ts` | ❌ W0 | ⬜ pending |
| 1-01-03 | 01 | 1 | SCHEMA-01 | — | N/A | unit (tsc) | `cd apps/cli && tsc --noEmit` | ✅ | ⬜ pending |
| 1-01-04 | 01 | 1 | SCHEMA-02 | — | N/A | unit | `yarn workspace @happier-dev/cli vitest run src/settings/mcpToolsSettings.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/cli/src/settings/mcpToolsSettings.ts` — new module (schema + reader) to be created
- [ ] `apps/cli/src/settings/mcpToolsSettings.test.ts` — unit test file to be created

*Existing infrastructure (Vitest, `createTempDir`, `envSnapshot`, `vitestSetup.ts`) is fully present. No framework installation needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| TypeScript compile passes with new `import type` in `persistence.ts` | SCHEMA-01 | Compile-time type check | Run `cd apps/cli && tsc --noEmit`; confirm zero errors |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
