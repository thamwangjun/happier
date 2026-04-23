# Phase 12: Address Remaining v1.3 Audit Items - Context

**Gathered:** 2026-04-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Close the four remaining v1.3 milestone audit items: wire the dead `shouldHoldServerCommit` export into production code, verify the `writeToBuffer` guard is complete, add a clarifying comment on the inert `ackSeq` field, and treat VALID-04 Android Doze as leave-as-is (blank checklist is accurate).

No new features. No behavior changes. Pure correctness and documentation.

</domain>

<decisions>
## Implementation Decisions

### shouldHoldServerCommit (MOB-07)

- **D-01:** Replace direct field access `replayGate?.isReplaying` in `pendingQueueV2.ts:347` with `replayGate && shouldHoldServerCommit(replayGate)`. Import `shouldHoldServerCommit` from `./replayGate` (or the appropriate relative path). This makes the export live and centralizes the gate predicate.
- **D-02:** No broader audit needed — this is the only production call site that reads `isReplaying` for the commit-hold decision. `sync.ts` uses `isReplaying` for other purposes (setting the flag, getter) and is not subject to this change.

### writeToBuffer guard (WR-03)

- **D-03:** Guard is already in place in `connectionEventRouter.ts` lines 72–82 (`filterIncludesUserScoped` check). Phase 12 should verify it covers all five `RecipientFilter` variants and document the item as closed. No code changes expected.
- **D-04:** All five variants confirmed correct: `all-user-authenticated-connections`, `all-interested-in-session`, `user-scoped-only` → buffer; `machine-scoped-only`, `machine-only` → skip buffer. The `machine-scoped-only` naming note (includes `user-scoped:*` room for socket fanout) does not affect buffering intent — those messages target daemons and should not enter the user reconnect buffer.

### ackSeq annotation (PROTO-04)

- **D-05:** Add an inline comment on the `ackSeq` field in `UpdateContainerSchema` (`packages/protocol/src/updates.ts:243`) explaining that it is parsed for schema compatibility but the piggybacking use case is not implemented. Example: `// Reserved for future piggybacking (PROTO-04) — parsed but not consumed by any production code.`
- **D-06:** No other changes to `ackSeq`. The field remains in the schema (backward compat), the test file `updates.ackSeq.test.ts` stays as-is.

### VALID-04 Android Doze

- **D-07:** Leave `docs/android-doze-qa-checklist.md` blank results as-is. The empty Results Summary table accurately represents deferred physical execution. No Phase 12 changes to this file.

### Claude's Discretion
- Exact comment wording for D-05 (keep it short, reference PROTO-04).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Core files to modify
- `apps/ui/sources/sync/engine/pending/pendingQueueV2.ts` — line 347, direct `isReplaying` access to replace
- `apps/ui/sources/sync/engine/resilience/replayGate.ts` — exports `shouldHoldServerCommit`; import source for the fix
- `packages/protocol/src/updates.ts` — `UpdateContainerSchema`, line 243, `ackSeq` field to annotate
- `apps/server/sources/app/events/connectionEventRouter.ts` — `emitUpdate()` lines 72–82, `filterIncludesUserScoped` guard to verify

### Reference files (read-only context)
- `apps/server/sources/app/events/eventPayloadTypes.ts` — `RecipientFilter` union type (5 variants)
- `.planning/v1.3-MILESTONE-AUDIT.md` — full audit with all tech_debt items and context

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `shouldHoldServerCommit(gate: ReplayGate): boolean` — already in `replayGate.ts:9`; just needs to be called
- `replayGate` param in `pendingQueueV2` is typed `{ isReplaying: boolean; waitForReplayComplete(): Promise<void> }` — compatible with `ReplayGate` type

### Established Patterns
- Optional-chaining guard pattern: `replayGate && shouldHoldServerCommit(replayGate)` (mirrors existing optional param handling in the codebase)
- Inline `//` comments for schema field annotations are the pattern in `updates.ts`

### Integration Points
- `pendingQueueV2.ts` calls `replayGate.waitForReplayComplete()` immediately after the gate check — the fix must preserve that call on the same `replayGate` reference

</code_context>

<specifics>
## Specific Ideas

- No "you decide" options were given on wording — keep the ackSeq comment short and reference PROTO-04

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 12-address-remaining-v1-3-audit-items-wire-shouldholdservercomm*
*Context gathered: 2026-04-23*
