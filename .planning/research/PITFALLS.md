# Domain Pitfalls: Suppressing Subagent ready Notifications in Happier CLI Claude Backend

**Domain:** Happier CLI — `claudeRemoteAgentSdk.ts` / `finalizeCurrentTurn()` boolean discriminant
**Researched:** 2026-04-19
**Confidence:** HIGH (all claims grounded in direct code inspection)

---

## Misclassification Risks

### Pitfall 1: `isSubagent` passed as `false` for a real subagent turn

**What goes wrong:** `onReady()` fires on a subagent completion. The session unlocks and begins accepting the next user message before the parent agent has itself completed. The UI shows the session as "ready" mid-task — a phantom ready state.

**Why it happens:**
- The call sites of `finalizeCurrentTurn()` are spread across three distinct trigger points inside the `for await` loop (lines 1536, 1554, 1607):
  1. `task_notification` with `status === 'stopped' | 'failed' | 'completed'`
  2. `system.init` + `isCompactCommand`
  3. `result` message (the standard turn-end path)
- Adding `isSubagent` means every one of those call sites must independently receive the correct value. If one is missed, or if the value is computed once at the top of the function and cached while message context changes mid-stream, the wrong classification can silently propagate.

**Consequences:**
- The session appears idle while Claude is still processing subagent work inside agent-teams mode.
- `scheduleNextMessagePump()` runs: if a message is already queued in `opts.nextMessage()`, it gets injected into the underlying Claude subprocess at the wrong moment, corrupting the conversation state.
- Transcript continuity breaks because `flushStreamedTranscriptWriter('turn-end')` is called early, closing out a transcript segment before subagent output has finished streaming.

**Prevention:** The `isSubagent` value must be derived from the message currently being processed (i.e., from `parent_tool_use_id` or from `task_id !== activeTaskId`), not from a captured closure at an outer scope. Compute it inside each call site, not outside the loop.

**Detection:** After a multi-subagent task, the session shows "ready" before the final parent assistant message is emitted. The turn diagnostic log (`[claudeRemoteAgentSdk] Turn summary`) fires more than once per user prompt.

---

### Pitfall 2: `isSubagent` passed as `true` for the parent turn

**What goes wrong:** `onReady()` is suppressed for the turn the user is actually waiting on. The session hangs — it never returns to the "ready" state and the user cannot send a follow-up message.

**Why it happens:**
- If the heuristic for subagent detection is too broad (e.g., checking only whether `parent_tool_use_id` is non-null, when in fact the parent turn's `result` message can itself have a non-null `parent_tool_use_id` in certain agent-team topologies), the final parent `result` is misclassified.
- Alternatively, if `activeTaskId` is not cleared correctly before the final `task_notification` for the parent fires, the comparison `taskId === activeTaskId` can still be true when processing the parent's own completion event.

**Consequences:**
- Permanent hang: `scheduleNextMessagePump()` is never called, so `opts.nextMessage()` is never drained, so the session queue stalls. The underlying Claude subprocess may continue running or wait for input that never arrives.
- If the caller has a timeout, this surfaces as a session timeout error rather than a subagent classification bug — hard to debug.

**Prevention:** The parent turn's `result` message should be the canonical, unconditional path to `onReady()`. Any subagent suppression must only apply to turn-end signals that arrive before the final `result`, specifically `task_notification` events that match a task launched by a subagent (i.e., `taskId !== activeTaskId` or `parent_tool_use_id !== null` on the originating `task_started` event).

**Detection:** After sending a user prompt, the session never emits an `onReady()` callback. In tests, `onReady` mock has zero calls after a full message sequence completes.

---

### Pitfall 3: `task_notification` heuristic misidentifying parent turn as subagent

**What goes wrong:** The existing `task_notification` branch at line 1529 already gates on `taskId === activeTaskId`, meaning it only finalizes the turn when the notification matches the task Claude Code registered for this turn. A subagent's `task_notification` arrives with a different `taskId` and is currently ignored. This is already correct behavior — but the proposed change may introduce a new condition on top of this that contradicts it.

**Specifically:** If `isSubagent` is computed based on `parent_tool_use_id` from the `task_notification` system message, this field is not guaranteed to be present on system messages in all agent-teams topologies. The `parent_tool_use_id` field is a property of streamed `assistant`/`user` content messages (the sidechain routing key), not of `system` control messages.

**Consequences:** A `task_notification` for the parent task (where `taskId === activeTaskId`) gets incorrectly treated as a subagent notification, suppressing `onReady()` on the turn the user is waiting on. Identical outcome to Pitfall 2.

**Prevention:** Do not use `parent_tool_use_id` on `system` messages to detect subagents. The correct indicator on a `task_notification` is whether `taskId !== activeTaskId` (not matching the parent task). The Codex backend's approach — comparing `notificationThreadId !== activeTurn.threadId` at line 943 in `runtime.ts` — is the right analogy: use the registered identifier for the current turn, not a field that may be absent on control messages.

**Detection:** In an end-to-end agent-teams test, a parent task completion fails to trigger `onReady()` even though no subagent was involved.

---

## Bookkeeping Edge Cases

### Edge Case 1: `didFinalizeTurn` guard blocks parent finalization if set by subagent

**What goes wrong:** `finalizeCurrentTurn()` begins with `if (didFinalizeTurn) return;` which prevents double-firing. However, if the implementation sets `didFinalizeTurn = true` at the top before the `isSubagent` branch, a subagent finalization permanently locks out the parent turn's finalization.

**Root cause of the trap:** The natural refactor looks correct but is subtly wrong:
```typescript
const finalizeCurrentTurn = async (params?: { isSubagent?: boolean }) => {
    if (didFinalizeTurn) return;
    didFinalizeTurn = true; // set here, before isSubagent check
    // ...
    if (!params?.isSubagent) {
        await opts.onReady();
        scheduleNextMessagePump();
    }
};
```
When a subagent notification calls this, `didFinalizeTurn` becomes `true`. The parent `result` message then calls `finalizeCurrentTurn()`, hits `if (didFinalizeTurn) return`, and exits without calling `onReady()`. Session hangs permanently.

**Prevention:** Track `didEmitReady` separately from `didFinalizeTurn`. Use `didFinalizeTurn` to gate bookkeeping (thinking state, transcript flush, diagnostics) that must run exactly once. Use `didEmitReady` to gate `onReady()` and `scheduleNextMessagePump()` independently. A subagent finalization sets `didFinalizeTurn` but not `didEmitReady`, allowing the parent to complete Phase A bookkeeping only if needed, and always run Phase B.

---

### Edge Case 2: `scheduleNextMessagePump()` must not run for subagent completions

**What goes wrong:** The last line of `finalizeCurrentTurn()` (line 1181) is `scheduleNextMessagePump()`. This starts a concurrent async task that calls `opts.nextMessage()`, dequeues the next user prompt, and injects it into the underlying Claude subprocess. For a subagent completion, this must not happen — the parent agent is still running.

**Consequence:** A queued user message from the Happier server gets injected mid-task, corrupting the transcript. Claude responds to the user before finishing agent work. The `result` message routing is confused because the turn counter has advanced.

**Prevention:** Both `onReady()` and `scheduleNextMessagePump()` must be inside the same `if (!isSubagent)` guard. They are causally linked — do not gate one without the other.

---

### Edge Case 3: `flushStreamedTranscriptWriter` must still run for subagent turns

**What goes wrong:** The `streamedTranscriptWriter` flush (lines 1167-1170) closes out a streamed transcript segment. For subagent completions, this flush still needs to happen to commit sidechain transcript data before the next sidechain segment begins. If the flush is accidentally placed inside `if (!isSubagent)`, sidechain transcript data is lost or arrives out of order.

**Prevention:** Transcript flush, `updateThinking(false)`, turn diagnostics reset, and `completionEvent` emission are bookkeeping that must run for all completions (parent and subagent). Only `onReady()` and `scheduleNextMessagePump()` should be gated on `!isSubagent`.

---

### Edge Case 4: `activeTaskId = null` cleared prematurely by subagent finalization

**What goes wrong:** At line 1162, `activeTaskId = null` is reset unconditionally inside `finalizeCurrentTurn`. If `finalizeCurrentTurn(isSubagent=true)` is called, `activeTaskId` is cleared. The parent task's subsequent `task_notification` (with the parent's `taskId`) will not match the equality check `taskId === activeTaskId` (which is now null), so the parent turn finalization via `task_notification` will silently not fire.

**Current safeguard:** The existing code at line 1532 (`if (typeof taskId === 'string' && taskId === activeTaskId)`) means `finalizeCurrentTurn` is only called from `task_notification` when `taskId === activeTaskId`. A subagent's `task_notification` has a different `taskId` and does not call `finalizeCurrentTurn` at all under the current code. The hazard only materializes if the new implementation calls `finalizeCurrentTurn(isSubagent=true)` from inside the `task_notification` handler even when `taskId !== activeTaskId`, which would be the wrong design anyway.

**Prevention:** Only call `finalizeCurrentTurn(isSubagent=true)` when the notification genuinely belongs to a subagent task. The `task_notification` branch at line 1529 should remain the single location that calls `finalizeCurrentTurn`, with `isSubagent` derived from whether `taskId !== activeTaskId`. Do not add a separate call path for subagent notifications that bypasses the existing equality guard.

---

### Edge Case 5: `awaitingNextTurnStart` / `didFinalizeTurn` state machine interaction

**What goes wrong:** These two flags gate the "clear finalize guard for next turn" logic at lines 1249-1253 and 1507-1513. After a parent finalization, `awaitingNextTurnStart = true` and `didFinalizeTurn = true`. The next turn's first `stream_event` or `assistant` message clears both flags. If a subagent finalization incorrectly sets `awaitingNextTurnStart = true`, the next subagent stream event will prematurely clear the guard, causing the main loop to incorrectly believe a new user-initiated turn has started.

**Prevention:** `awaitingNextTurnStart` must also be gated behind `if (!isSubagent)` inside `finalizeCurrentTurn`. It is part of Phase B (notification), not Phase A (bookkeeping).

---

## Test Strategy

### Test 1: Subagent `task_notification` does not fire `onReady()`

Yield a sequence via the `createQuery` test seam:
1. `system` with `subtype: 'task_started'`, `task_id: 'subtask-1'` (note: `activeTaskId` is null or a different parent task id)
2. `system` with `subtype: 'task_notification'`, `task_id: 'subtask-1'`, `status: 'completed'`
3. `result` message

Assert `onReady` mock is called exactly once (triggered by `result`, not by `task_notification`).

This is the primary regression guard for Pitfall 1.

---

### Test 2: Parent `task_notification` still fires `onReady()` exactly once

Yield:
1. `system` with `subtype: 'task_started'`, `task_id: 'parent-task'`
2. `system` with `subtype: 'task_notification'`, `task_id: 'parent-task'`, `status: 'completed'`

Assert `onReady` mock is called exactly once. Verifies Pitfall 2 is not introduced.

---

### Test 3: `result` message always fires `onReady()` regardless of subagent state

Yield only a `result` message (no preceding `task_notification`).

Assert `onReady` is called exactly once. This is the baseline non-regression test.

---

### Test 4: Two subagent `task_notification` events followed by `result` produce exactly one `onReady()`

Yield:
1. `task_notification` for subtask-1 (subagent)
2. `task_notification` for subtask-2 (subagent)
3. `result` message

Assert `onReady` called exactly once. Catches the `didFinalizeTurn` lockout from Edge Case 1.

---

### Test 5: `scheduleNextMessagePump` is not invoked on subagent finalization

Provide a `nextMessage` mock that records invocation count and timing. Assert the mock is not called until after the `result` message triggers `onReady`. Catches Edge Case 2.

---

### Test 6: `streamedTranscriptWriter.flushAll` is called for subagent `task_notification`

Provide a `streamedTranscriptWriter` mock. Yield a subagent `task_notification`, then `result`.

Assert `flushAll` is called at least twice (once for the subagent, once for the parent). Assert `onReady` is called exactly once (from the `result`). Catches Edge Case 3.

---

### Test 7: End-to-end agent-teams sequence completes cleanly

Yield:
1. `task_started` for subagent-1
2. `task_notification` completed subagent-1
3. `task_started` for subagent-2
4. `task_notification` completed subagent-2
5. `result` message

Assert:
- `onReady` called exactly once
- `nextMessage` consumed only once (after `result`)
- All transcript flushes occurred

Integration-style regression guard for the full happy path.

---

### Test 8: Existing tests continue to pass without modification

The existing test files (`claudeRemoteAgentSdk.streamEvents.test.ts`, `claudeRemoteAgentSdk.checkpoints.test.ts`, etc.) must pass without changes. None of those tests involve `task_notification` sequences, so they exercise the `result`-only path (Test 3 baseline). Any regression here indicates a structural change to `finalizeCurrentTurn` broke the common case.

---

## Prevention Steps

1. **Compute `isSubagent` from the current message, not from a closure.** For the `task_notification` path, the correct indicator is `taskId !== activeTaskId`. For the `result` path, the result message is never a subagent signal — it is always the parent turn completing. Do not add `isSubagent` to the `result` handler.

2. **Separate bookkeeping (Phase A) from notification (Phase B).** Phase A runs unconditionally: thinking reset, transcript flush, diagnostics, `completionEvent`. Phase B runs only for parent completions: `onReady()`, `scheduleNextMessagePump()`, `awaitingNextTurnStart = true`. Introduce `didEmitReady` to guard Phase B independently of `didFinalizeTurn`.

3. **Do not use `parent_tool_use_id` on system messages as the subagent indicator.** That field is not defined on `system` control messages. Use `taskId !== activeTaskId` instead.

4. **Audit all three call sites before merging.** The `result` path (line 1607) should never pass `isSubagent=true`. The `task_notification` path (line 1536) should pass `isSubagent = (taskId !== activeTaskId)`. The compact `init` path (line 1554) is a special case that should remain unchanged.

5. **Model the Codex reference.** The Codex `runtime.ts` pattern at lines 939-964 (`notificationMatchesPendingTurn` returning false for child `threadId`) is the architecturally correct analogy. It routes child-thread notifications to `finalizeSyntheticSubagentThread` and only routes parent-thread notifications to `finishPendingTurn`. Apply the same separation in the Claude backend: subagent `task_notification` goes to a dedicated handler, parent `task_notification` goes to `finalizeCurrentTurn`.

6. **Write Tests 1-3 before implementing.** They define the contract and will catch the most common misclassification mistakes during development.

---

## Sources

All findings are based on direct inspection of:
- `/apps/cli/src/backends/claude/remote/claudeRemoteAgentSdk.ts` — lines 768, 1158-1181, 1519-1556, 1583-1608 (HIGH confidence)
- `/apps/cli/src/backends/codex/appServer/runtime.ts` — lines 824-912, 939-964, 1033-1057 (HIGH confidence, reference pattern)
- `/apps/cli/src/backends/claude/remote/claudeRemoteAgentSdk.streamEvents.test.ts` — test harness patterns (HIGH confidence)
- `/apps/cli/src/backends/claude/remote/claudeRemoteAgentSdk.testkit.ts` — `makeMode` helper (HIGH confidence)

No external sources required. All findings are internal code analysis.
