# Phase 6: Protocol Contract - Context

**Gathered:** 2026-04-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Create the shared typed Zod schemas and update `docs/protocol.md` for all new resilience Socket.IO events. No runtime behavior is introduced — this is the contract that Phases 7-10 depend on.

</domain>

<decisions>
## Implementation Decisions

### Schema File Organization
- **D-01:** New `packages/protocol/src/socketResilience.ts` flat file — mirrors `socketRpc.ts` naming convention. Contains `ReconnectResumeRequestSchema`, `AckUpdateRequestSchema`, resilience event name constants, and `ACK_DEBOUNCE_MS`. Wired into `packages/protocol/src/index.ts` exports.
- **D-02:** `UpdateContainerSchema` extended with optional `ackSeq: z.number().int().min(0).optional()` field inline in the existing `packages/protocol/src/updates.ts` — not a new file, not a versioned schema, just an additive optional field on the existing object.

### Protocol Documentation
- **D-03:** v1.3 resilience changes documented as a new section appended to `docs/protocol.md`. No separate `PROTOCOL_CHANGES.md` file — the existing `docs/protocol.md` already catalogs all Socket.IO events and is the correct home for new event definitions.

### Constants
- **D-04:** `ACK_DEBOUNCE_MS = 500` exported from `packages/protocol/src/socketResilience.ts` — the only cross-cutting timing constant that both server and mobile must agree on. Follows the `BUG_REPORT_DEFAULT_CONTEXT_WINDOW_MS` precedent in `packages/protocol`.
- **D-05:** `RELAY_BUFFER_CAP` and `RELAY_BUFFER_TTL_MS` default values (`500` and `120000`) are server-only concerns — defined inline in the server's env config module (Phase 7). They are not exported from `packages/protocol` since mobile never reads them.

### Claude's Discretion
- Event name string values for the resilience events (e.g. `'reconnect-resume'`, `'ack-update'`, `'replay-complete'`, `'buffer-overflow'`) — names are specified in REQUIREMENTS.md; collector naming in the constants object is Claude's call.
- Whether to group the event names in a `SOCKET_RESILIENCE_EVENTS` const object (mirroring `SOCKET_RPC_EVENTS`) or export individually — Claude decides based on consistency with `socketRpc.ts`.
- Exact export wiring in `index.ts` (named re-exports vs. wildcard) — follow existing pattern.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` §Protocol Contract — PROTO-01 through PROTO-05 (authoritative requirement IDs for this phase)

### Roadmap
- `.planning/ROADMAP.md` §Phase 6 — success criteria (5 criteria including backward-compat test for `ackSeq`, env var fallback behavior, `ackDebounceMs` documentation requirement)

### Existing Protocol Files to Modify
- `packages/protocol/src/updates.ts` — `UpdateContainerSchema` definition to extend with optional `ackSeq`
- `packages/protocol/src/socketRpc.ts` — naming pattern to mirror for new `socketResilience.ts`
- `packages/protocol/src/index.ts` — export wiring pattern for new file
- `docs/protocol.md` — existing protocol doc to append v1.3 section to

### Codebase Conventions
- `.planning/codebase/CONVENTIONS.md` — monorepo naming and export conventions
- `.planning/codebase/ARCHITECTURE.md` — protocol package role and consumers

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/protocol/src/socketRpc.ts`: Direct template for `socketResilience.ts` — exports a `SOCKET_RPC_EVENTS` const object and a derived type. Mirror this pattern exactly.
- `packages/protocol/src/updates.ts`: `UpdateContainerSchema` at line 238 — extend with `.extend({ ackSeq: z.number().int().min(0).optional() })` or add the field directly to the object; both preserve backward compat via `.passthrough()` already present.
- `packages/protocol/src/index.ts`: Inspect existing export patterns before adding new exports.

### Established Patterns
- Constants in protocol package: co-located in the domain file, not a separate `constants.ts`. See `BUG_REPORT_DEFAULT_CONTEXT_WINDOW_MS` in `packages/protocol/src/features/payload/capabilities/bugReportsCapabilities.ts`.
- Schema naming: `XxxSchema` (Zod schema) + `export type Xxx = z.infer<typeof XxxSchema>` (derived type). Both must be exported.
- Backward compat: `UpdateContainerSchema` already uses `.passthrough()` — optional fields added to it will not break existing consumers.

### Integration Points
- `apps/server` and `apps/ui` both import from `packages/protocol` — the new exports will be available to both without any workspace config changes.
- Phase 7 (server storage) and Phase 9 (mobile reconnect) will import `ReconnectResumeRequestSchema`, `AckUpdateRequestSchema`, event name constants, and `ACK_DEBOUNCE_MS` from `packages/protocol/src/socketResilience.ts`.

</code_context>

<specifics>
## Specific Ideas

- The `ackSeq` field on `UpdateContainerSchema` is specifically for the server to piggyback ack hints on outbound payloads — success criteria 3 requires that a client omitting `ackSeq` receives no TypeScript or Zod error, so the field must be `.optional()`.
- `docs/protocol.md` v1.3 section should document: new client→server events (`reconnect-resume`, `ack-update`), new server→client events (`replay-complete`, `buffer-overflow`), the `ackSeq` addition to the `update` envelope, and `ackDebounceMs` as the authoritative mobile client constant.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 06-protocol-contract*
*Context gathered: 2026-04-21*
