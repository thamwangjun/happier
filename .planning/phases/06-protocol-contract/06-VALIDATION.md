---
phase: 6
slug: protocol-contract
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-21
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `packages/protocol/vitest.config.ts` (or root vitest config) |
| **Quick run command** | `pnpm --filter @happier/protocol test --run` |
| **Full suite command** | `pnpm --filter @happier/protocol test --run && pnpm tsc --noEmit` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @happier/protocol test --run`
- **After every plan wave:** Run `pnpm --filter @happier/protocol test --run && pnpm tsc --noEmit`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 6-01-01 | 01 | 0 | PROTO-02 | — | N/A | unit | `pnpm --filter @happier/protocol test --run socketResilience` | ❌ W0 | ⬜ pending |
| 6-01-02 | 01 | 0 | PROTO-03 | — | N/A | unit | `pnpm --filter @happier/protocol test --run socketResilience` | ❌ W0 | ⬜ pending |
| 6-02-01 | 02 | 0 | PROTO-04 | — | N/A | unit | `pnpm --filter @happier/protocol test --run ackSeq` | ❌ W0 | ⬜ pending |
| 6-03-01 | 03 | 1 | PROTO-02 | — | N/A | unit | `pnpm --filter @happier/protocol test --run` | ❌ W0 | ⬜ pending |
| 6-03-02 | 03 | 1 | PROTO-03 | — | N/A | unit | `pnpm --filter @happier/protocol test --run` | ❌ W0 | ⬜ pending |
| 6-04-01 | 04 | 1 | PROTO-04 | — | N/A | unit | `pnpm --filter @happier/protocol test --run` | ❌ W0 | ⬜ pending |
| 6-05-01 | 05 | 1 | PROTO-01 | — | N/A | manual | Open `docs/protocol.md` and verify v1.3 section present | — | ⬜ pending |
| 6-06-01 | 06 | 1 | PROTO-05 | — | N/A | manual | Verify `ACK_DEBOUNCE_MS` documented in `docs/protocol.md` | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/protocol/src/__tests__/socketResilience.test.ts` — stubs for PROTO-02, PROTO-03 (schema shape, event names, ACK_DEBOUNCE_MS export)
- [ ] `packages/protocol/src/__tests__/ackSeq.test.ts` — stubs for PROTO-04 (UpdateContainerSchema backward compat: with/without ackSeq)

*Existing test infrastructure covers the framework; only test stubs need creating.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `docs/protocol.md` v1.3 section completeness | PROTO-01 | Documentation review — no programmatic check for content quality | Open file, verify section exists with all four event names, payload types, and ackSeq envelope notes |
| `ackDebounceMs` documented as authoritative | PROTO-05 | Prose documentation, not a runtime behavior | Open `docs/protocol.md`, verify `ACK_DEBOUNCE_MS = 500` is cited as the canonical constant |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
