# Phase 12: Address Remaining v1.3 Audit Items - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-23
**Phase:** 12-address-remaining-v1-3-audit-items-wire-shouldholdservercomm
**Areas discussed:** shouldHoldServerCommit wiring, writeToBuffer guard status, ackSeq inert annotation, VALID-04 Android Doze

---

## shouldHoldServerCommit wiring

| Option | Description | Selected |
|--------|-------------|----------|
| Replace direct access with function call | `replayGate && shouldHoldServerCommit(replayGate)` in pendingQueueV2.ts:347 | ✓ |
| Broader audit of isReplaying direct accesses | Also check sync.ts and all other call sites | |

**User's choice:** Replace direct access with function call (pendingQueueV2.ts only).  
**Notes:** User asked what the functional difference is — clarified it's zero behavioral change today; the value is architectural (centralizes the gate predicate, makes the export live). User confirmed simple replacement.

---

## writeToBuffer guard status

| Option | Description | Selected |
|--------|-------------|----------|
| Already done — verify and document | Guard added in Phase 11; Phase 12 confirms coverage | ✓ |
| There's still a gap | Something missing | |

**User's choice:** Already done — verify and document.  
**Notes:** Guard at connectionEventRouter.ts lines 72–82 covers all five RecipientFilter variants correctly.

---

## ackSeq inert annotation

| Option | Description | Selected |
|--------|-------------|----------|
| Test file title references PROTO-04 — rename/remove | updates.ackSeq.test.ts describe label | |
| Add a comment on the field noting it's reserved/unused | Inline comment on ackSeq in UpdateContainerSchema | ✓ |
| I know exactly what it is | User-specified location | |

**User's choice:** Add inline comment on the `ackSeq` field in `packages/protocol/src/updates.ts`.  
**Notes:** No existing comment on the field; the "inert comment" means adding one to make the reserved/unused status explicit.

---

## VALID-04 Android Doze

| Option | Description | Selected |
|--------|-------------|----------|
| Document as deferred — update checklist header | Add a note about physical execution pending | |
| Results available — fill them in | Physical testing done | |
| Nothing — leave as-is | Blank checklist accurately represents deferred state | ✓ |

**User's choice:** Leave as-is.  
**Notes:** Blank results table already accurately documents the deferred status.

---

## Claude's Discretion

- Exact wording of the ackSeq comment (keep short, reference PROTO-04)

## Deferred Ideas

None.
