# Phase 6: Protocol Contract - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-21
**Phase:** 06-protocol-contract
**Areas discussed:** Schema file organization, PROTOCOL_CHANGES.md placement, Constants as code vs. docs-only

---

## Schema file organization

| Option | Description | Selected |
|--------|-------------|----------|
| A: `resilience/` subdomain folder | New `packages/protocol/src/resilience/` folder with index.ts. Mirrors session/, sessionControl/ subdomain pattern. | |
| B: `socketResilience.ts` flat file | New top-level file alongside socketRpc.ts. ackSeq added inline to updates.ts. | ✓ |
| C: Inline into updates.ts + socketResilience.ts | All new schemas in updates.ts plus a socketResilience.ts for event request types. | |

**User's choice:** B — `socketResilience.ts` flat file  
**Notes:** Mirrors `socketRpc.ts` naming convention directly. New schemas are cross-cutting socket event contracts, not domain model types — flat file is the correct category.

---

## PROTOCOL_CHANGES.md placement

| Option | Description | Selected |
|--------|-------------|----------|
| Project root (.) | Maximum visibility for merge reviewers | |
| `packages/protocol/` | Co-located with Zod schemas | |
| `apps/server/` | Close to relay implementation | |
| `docs/` new folder | Clean separation, conventional | |
| Section in `docs/protocol.md` | Append to existing protocol doc | ✓ |

**User's choice:** Section in `docs/protocol.md`  
**Notes:** User asked to check existing codebase pattern first. Found that `docs/` already exists with `docs/protocol.md` documenting all Socket.IO events — the natural home for new event definitions. A separate file is unnecessary.

---

## Constants as code vs. docs-only

| Option | Description | Selected |
|--------|-------------|----------|
| A: All three as shared constants in protocol | ACK_DEBOUNCE_MS + RELAY_BUFFER_CAP_DEFAULT + RELAY_BUFFER_TTL_MS_DEFAULT all in packages/protocol | |
| B: ACK_DEBOUNCE_MS in protocol only | Only the cross-cutting timing constant in protocol; server buffer defaults stay server-side | ✓ |
| C: Docs-only | Values documented only, no shared import | |

**User's choice:** B — `ACK_DEBOUNCE_MS` only in `socketResilience.ts`  
**Notes:** User initially asked about all three in one file, then raised whether it made sense to co-locate server operational defaults with a shared protocol constant. Agreed the clean split is: `ACK_DEBOUNCE_MS` is genuinely cross-cutting (mobile and server both need the same value), while `RELAY_BUFFER_CAP_DEFAULT` / `RELAY_BUFFER_TTL_MS_DEFAULT` are server-only env var fallbacks with no mobile relevance.

---

## Claude's Discretion

- Exact event name string values and grouping in constants object (follow `SOCKET_RPC_EVENTS` pattern)
- Export wiring in `index.ts`
- Whether to use `.extend()` or inline field addition for `ackSeq` in `UpdateContainerSchema`

## Deferred Ideas

None.
