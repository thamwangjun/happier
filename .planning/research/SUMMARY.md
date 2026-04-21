# Research Summary: v1.1 Distinguish Parent vs Subagent Turn Completion

**Project:** Happier CLI — Claude backend (`claudeRemoteAgentSdk.ts`)
**Researched:** 2026-04-19
**Confidence:** HIGH

---

## Implementation Approach

Refactor `finalizeCurrentTurn()` to split bookkeeping cleanup (Phase A, always runs) from turn-completion notification (Phase B, parent only). Gate Phase B behind `!isSubagent`.

The discriminant already exists in the SDK: `result` messages are emitted only by the parent turn; `task_notification` messages are emitted only by subagent tasks. No SDK changes or new fields are required.

Extend the existing `params` bag with `isSubagent?: boolean` — backward-compatible with all three existing call sites.

---

## Critical Constraints

1. **`didFinalizeTurn = true` and `awaitingNextTurnStart = true` must be inside the `!isSubagent` gate.** Setting these on a subagent completion permanently locks out the parent's `result` message from ever calling Phase B.

2. **`scheduleNextMessagePump()` must be inside the same `!isSubagent` gate as `opts.onReady()`.** Running the pump on a subagent completion injects a queued user message into an in-flight parent turn, corrupting the transcript.

3. **`messageQueue.flush()` must run unconditionally.** It lives in the `onReady` lambda in `claudeRemoteLauncher.ts`. Ensure it always executes; only `readyHandler()` is conditioned on `!isSubagent`.

4. **Phase A bookkeeping runs for subagent completions too.** `updateThinking(false)`, `flushStreamedTranscriptWriter('turn-end')`, `resetTurnDiagnostics()`, and `activeTaskId = null` are unconditional.

5. **Subagent indicator is `taskId !== activeTaskId`, not `parent_tool_use_id`.** The latter is defined on content messages, not `system` control messages.

---

## Two-Step Plan

### Step 1 — Restructure `finalizeCurrentTurn()`

```typescript
const finalizeCurrentTurn = async (params?: {
    completionEvent?: string;
    isSubagent?: boolean;
}) => {
    const isSubagent = params?.isSubagent ?? false;

    // Phase A: bookkeeping — always runs
    activeTaskId = null;
    updateThinking(false);
    await flushStreamedTranscriptWriter('turn-end');
    resetTurnDiagnostics();
    if (params?.completionEvent) opts.onCompletionEvent?.(params.completionEvent);

    // Phase B: turn-completion notification — parent only
    if (!isSubagent) {
        if (didFinalizeTurn) return;
        didFinalizeTurn = true;
        awaitingNextTurnStart = true;
        await opts.onReady();
        scheduleNextMessagePump();
    }
};
```

### Step 2 — Update call sites

| Location | Trigger | Value |
|----------|---------|-------|
| Line ~1536 | `task_notification` (subagent) | `{ isSubagent: true }` |
| Line ~1554 | `system.init` compact boundary | `{}` (parent, default) |
| Lines ~1603–1607 | `result` message | `{}` (parent, default) |

**Codex reference:** `apps/cli/src/backends/codex/appServer/runtime.ts` routes child-thread notifications to `finalizeSyntheticSubagentThread` — same intent, different implementation.

---

## Watch Out For

1. **`didFinalizeTurn` lockout trap** — placing the guard check/assignment before the `isSubagent` branch silently drops the parent's `onReady()`. Both the guard check and the assignment must live inside `if (!isSubagent)`.
2. **`scheduleNextMessagePump()` outside the gate** — injects next user message into a live parent turn.
3. **`messageQueue.flush()` being skipped** — subagent messages use the same outgoing queue; skipping risks out-of-order delivery.
4. **SDK invariant not formally documented** — `result` = parent-only and `task_notification` = subagent-only is observed, not guaranteed. Add an inline comment.

---

## Open Questions

1. **`resetTurnDiagnostics()` scope** — unconditional (Phase A) means parent-turn diagnostics reflect only post-subagent activity. Gating behind `!isSubagent` gives full-turn stats. Decide during implementation.
2. **Voice hooks** — suppressing `onReady()` also suppresses `voiceHooks.onReady()` in `sync.ts`. Correct behavior (subagent completion is not a voice turn boundary), but verify against voice session tests.
3. **Long-term** — boolean flag is sufficient for v1.1; flag a future refactor to a dedicated subagent handler if agent-teams becomes a primary code path.

---

## Suggested Phases

| # | Phase | Goal |
|---|-------|------|
| 4 | Restructure `finalizeCurrentTurn()` | Split Phase A/B, gate notification behind `!isSubagent`, write tests first |
| 5 | Update call sites + verify | Pass `{ isSubagent: true }` at `task_notification` path; confirm no regression |

---

*Research completed: 2026-04-19*
