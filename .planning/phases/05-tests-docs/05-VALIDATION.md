---
phase: 5
slug: tests-docs
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-22
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.2.4 |
| **Config file** | `apps/cli/vitest.config.ts` |
| **Quick run command** | `cd apps/cli && npx vitest run src/settings/sessionAgentToolsSettings.test.ts` |
| **Full suite command** | `cd apps/cli && npx vitest run` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd apps/cli && npx vitest run src/settings/sessionAgentToolsSettings.test.ts`
- **After every plan wave:** Run `cd apps/cli && npx vitest run src/settings/sessionAgentToolsSettings.test.ts`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 05-01-01 | 01 | 1 | TEST-01 | — | N/A | unit | `cd apps/cli && npx vitest run src/settings/sessionAgentToolsSettings.test.ts` | ❌ W0 | ⬜ pending |
| 05-01-02 | 01 | 1 | TEST-02 | — | N/A | unit | `cd apps/cli && npx vitest run src/settings/sessionAgentToolsSettings.test.ts` | ❌ W0 | ⬜ pending |
| 05-01-03 | 01 | 1 | TEST-03 | — | N/A | unit | `cd apps/cli && npx vitest run src/settings/sessionAgentToolsSettings.test.ts` | ❌ W0 | ⬜ pending |
| 05-01-04 | 01 | 1 | TEST-04 | — | N/A | unit | `cd apps/cli && npx vitest run src/settings/sessionAgentToolsSettings.test.ts` | ❌ W0 | ⬜ pending |
| 05-01-05 | 01 | 1 | DOCS-01 | — | N/A | manual | N/A — review `docs/mcp-tool-filtering.md` for Example E | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] 4 new `it` blocks inside `describe('3-level lookup (TEST-01..04)')` in `apps/cli/src/settings/sessionAgentToolsSettings.test.ts` — covers TEST-01..04
- [ ] Example E in `docs/mcp-tool-filtering.md` — covers DOCS-01

*Existing infrastructure covers test runner; no new packages needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `docs/mcp-tool-filtering.md` Example E is accurate and copy-pasteable | DOCS-01 | Docs are not machine-verifiable | Read Example E, verify JSON is valid and matches documented behavior |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
