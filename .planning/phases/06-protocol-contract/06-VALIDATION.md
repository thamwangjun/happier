---
phase: 6
slug: protocol-contract
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-21
audited: 2026-04-23
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | root `vitest.config.ts` |
| **Quick run command** | `node node_modules/vitest/vitest.mjs run --config vitest.config.ts packages/protocol/src/socketResilience.test.ts packages/protocol/src/updates.ackSeq.test.ts` |
| **Full suite command** | `node node_modules/vitest/vitest.mjs run --config vitest.config.ts` |
| **Server tests** | `cd apps/server && node_modules/.bin/vitest run --config vitest.config.ts sources/config/backends.spec.ts` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick protocol tests
- **After every plan wave:** Run full suite + `pnpm tsc --noEmit`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 6-01-01 | 01 | 1 | PROTO-02 | T-06-01 | N/A | unit | `node node_modules/vitest/vitest.mjs run --config vitest.config.ts packages/protocol/src/socketResilience.test.ts` | ✅ | ✅ green |
| 6-01-02 | 01 | 1 | PROTO-03 | T-06-01 | N/A | unit | `node node_modules/vitest/vitest.mjs run --config vitest.config.ts packages/protocol/src/socketResilience.test.ts` | ✅ | ✅ green |
| 6-01-03 | 01 | 1 | PROTO-04 | T-06-03 | N/A | unit | `node node_modules/vitest/vitest.mjs run --config vitest.config.ts packages/protocol/src/updates.ackSeq.test.ts` | ✅ | ✅ green |
| 6-02-01 | 02 | 2 | PROTO-01 | — | N/A | manual | Open `docs/protocol.md` and verify `## v1.3 Resilience Events` section present | — | ✅ verified |
| 6-02-02 | 02 | 2 | PROTO-05 | T-06-02 | N/A | unit + manual | `node node_modules/vitest/vitest.mjs run --config vitest.config.ts packages/protocol/src/index.exports.test.ts` + docs check | ✅ | ✅ green |
| 6-03-01 | 03 | 2 | PROTO-05 | T-06-06 | silent fallback on invalid env input | unit | `cd apps/server && node_modules/.bin/vitest run --config vitest.config.ts sources/config/backends.spec.ts` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Test Coverage Summary (as of 2026-04-23)

| Test File | Tests | Result |
|-----------|-------|--------|
| `packages/protocol/src/socketResilience.test.ts` | 15 | ✅ all pass |
| `packages/protocol/src/updates.ackSeq.test.ts` | 4 | ✅ all pass |
| `packages/protocol/src/index.exports.test.ts` | 18 | ✅ all pass |
| `apps/server/sources/config/backends.spec.ts` | 16 (10 new) | ✅ all pass |

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions | Status |
|----------|-------------|------------|-------------------|--------|
| `docs/protocol.md` v1.3 section completeness | PROTO-01 | Documentation review — no programmatic check for content quality | Open file, verify `## v1.3 Resilience Events` section exists with all four event names, payload types, and ackSeq envelope notes | ✅ verified 2026-04-23 |
| `ACK_DEBOUNCE_MS` documented as authoritative | PROTO-05 | Prose documentation, not a runtime behavior | Open `docs/protocol.md`, verify `ACK_DEBOUNCE_MS = 500` is cited as the canonical constant | ✅ verified 2026-04-23 |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or manual-verified entries
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0/Wave 1 test files created and passing
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** ✅ complete — 2026-04-23

---

## Validation Audit 2026-04-23

| Metric | Count |
|--------|-------|
| Requirements audited | 5 (PROTO-01 through PROTO-05) |
| Gaps found | 0 |
| Resolved | 0 |
| Escalated to manual-only | 0 |
| Pre-existing tests confirmed green | 53 (across 4 test files) |

All requirements were COVERED at time of audit. VALIDATION.md updated from draft → complete, `nyquist_compliant` set to `true`.
