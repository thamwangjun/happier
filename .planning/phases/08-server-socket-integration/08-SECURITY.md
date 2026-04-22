---
phase: 08
slug: server-socket-integration
status: verified
threats_open: 0
asvs_level: 1
created: 2026-04-22
---

# Phase 08 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| socket event → resilienceHandler | Untrusted Socket.IO event payload crosses into server handler | `reconnect-resume` / `ack-update` payloads (sessionId, lastAckedSeq, seq) |
| server → UnackedMessage DB table | Server writes/reads buffer rows; connectionKey is server-derived | UpdatePayload rows (message content + seq numbers) |
| emitUpdate() → writeToBuffer | Fire-and-forget side-effect on outbound event path | UpdatePayload written to SQLite/Postgres depending on env |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-8-01 | Elevation of Privilege | readBuffer / ackBuffer scoping in resilienceHandler | mitigate | `connectionKey = \`user-scoped:${userId}\`` derived server-side from JWT in socket middleware (`auth.verifyToken`); userId is never accepted from client payload; readBuffer/ackBuffer scoped to authenticated userId | closed |
| T-8-02 | Tampering | ReconnectResumeRequest.lastAckedSeq | mitigate | `ReconnectResumeRequestSchema.safeParse(data)` enforces `z.number().int().min(0)` before any DB access; malformed or negative values are dropped silently (resilienceHandler.ts:24–26) | closed |
| T-8-03 | Tampering | AckUpdateRequest.seq | mitigate | `AckUpdateRequestSchema.safeParse(data)` enforces `z.number().int().min(0)`; negative or non-integer seq values rejected before ackBuffer call (resilienceHandler.ts:70–72) | closed |
| T-8-04 | Denial of Service | reconnect-resume burst flooding | accept | Buffer capped at `RELAY_BUFFER_CAP_DEFAULT = 500` messages per user (config/backends.ts:52); no per-connection rate limiting in v1.3 scope — acceptable risk given fixed cap bounds DB growth | closed |
| T-8-05 | Information Disclosure | replay of another user's buffer | mitigate | readBuffer query uses `userId` from JWT authentication — cross-user read is structurally impossible; connectionKey `user-scoped:${userId}` is derived entirely server-side (resilienceHandler.ts:30) | closed |
| T-8-06 | Tampering | CLI/machine sockets receiving buffer writes | mitigate | resilienceHandler registered only when `!metadata.clientType \|\| metadata.clientType === 'user-scoped'` (socket.ts:323); writeToBuffer only called when `filterIncludesUserScoped` is true (connectionEventRouter.ts:73–80) — double enforcement | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-8-01 | T-8-04 | No per-connection rate limiting on `reconnect-resume` events in v1.3 scope. Acceptable because the buffer cap (500 messages) bounds DB growth per user regardless of reconnect frequency. Future milestone may add rate limiting if abuse patterns emerge. | GSD Phase Plan (08-02-PLAN.md) | 2026-04-22 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-04-22 | 6 | 6 | 0 | gsd-security-auditor (inline verification) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log (AR-8-01 for T-8-04)
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-04-22
