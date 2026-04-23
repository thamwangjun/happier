---
phase: "12"
slug: address-remaining-v1-3-audit-items-wire-shouldholdservercomm
status: verified
threats_open: 0
asvs_level: 1
created: 2026-04-23
---

# Phase 12 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| client code internal | Pure internal refactor of a boolean predicate in `pendingQueueV2.ts` — no external trust boundary crossed | None |
| protocol schema | Comment annotation only on `UpdateContainerSchema.ackSeq` — no schema behavior change | None |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-12-01 | Tampering | `pendingQueueV2.ts` gate logic | accept | `shouldHoldServerCommit(gate)` is semantically identical to `gate.isReplaying` — no behavioral change, no new attack surface. Gate logic is now centralised in `replayGate.ts`. | closed |
| T-12-02 | Information Disclosure | `UpdateContainerSchema.ackSeq` | accept | Comment describes field intent only (`// Reserved for future piggybacking (PROTO-04) — parsed but not consumed by any production code.`). No sensitive implementation details disclosed; schema behavior unchanged. | closed |
| T-12-03 | Tampering | `connectionEventRouter` writeToBuffer guard | accept | `filterIncludesUserScoped` guard verified correct for all 5 `RecipientFilter` variants plus `undefined` — no code change introduced, no new tamper surface. | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-12-01 | T-12-01 | Predicate refactor is a pure internal rename — `shouldHoldServerCommit(gate) === gate.isReplaying` is an invariant enforced by the implementation. No external trust boundary crossed, no data flow change. | gsd-secure-phase (auto) | 2026-04-23 |
| AR-12-02 | T-12-02 | Inline comment on an optional schema field reveals only that the field is reserved for future use. No auth, no PII, no secrets. Accepted as documentation-only change. | gsd-secure-phase (auto) | 2026-04-23 |
| AR-12-03 | T-12-03 | Guard logic was verified by exhaustive analysis of all 5 `RecipientFilter` variants — correct behaviour confirmed with no code change. Read-only verification pass creates no new tamper surface. | gsd-secure-phase (auto) | 2026-04-23 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-04-23 | 3 | 3 | 0 | gsd-secure-phase (auto) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-04-23
