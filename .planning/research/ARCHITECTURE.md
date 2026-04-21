# Architecture: onReady → readyHandler Call Graph

**Project:** Happier CLI — Claude Remote Backend
**Researched:** 2026-04-19
**Confidence:** HIGH — all findings sourced directly from codebase, no inference

---

## Call Graph

```
claudeRemoteAgentSdk.ts: finalizeCurrentTurn()
  │
  ├─ [1] if (didFinalizeTurn) return   ← idempotency guard
  ├─ [2] didFinalizeTurn = true
  ├─ [3] awaitingNextTurnStart = true
  ├─ [4] activeTaskId = null
  ├─ [5] updateThinking(false)
  ├─ [6] flushStreamedTranscriptWriter('turn-end' | 'abort', ...)
  ├─ [7] logger.debug('[claudeRemoteAgentSdk] Turn summary', ...)
  ├─ [8] resetTurnDiagnostics()
  ├─ [9] opts.onCompletionEvent?.(params.completionEvent)  [conditional]
  ├─ [10] await opts.onReady()                             ← GATING TARGET
  └─ [11] scheduleNextMessagePump()

opts.onReady is the lambda at claudeRemoteLauncher.ts lines 992–995:
  async () => {
      await messageQueue.flush();   ← [A] drain outgoing queue first
      readyHandler();               ← [B] then signal ready
  }

readyHandler = createClaudeRemoteReadyHandler(...)  (line 847, claudeRemoteLauncher.ts)
  │
  ├─ Guard 1: if (params.getPending()) return  — no-op if a pending batch exists
  ├─ Guard 2: if (params.getQueueSize() !== 0) return  — no-op if session queue non-empty
  │
  ├─ Branch A (no pushSender):
  │   └─ session.sendSessionEvent({ type: 'ready' })
  │
  └─ Branch B (has pushSender):
      └─ sendReadyWithPushNotification(...)
          ├─ session.sendSessionEvent({ type: 'ready' })  ← always called first
          └─ [fire-and-forget] dispatchActivityNotificationAsync(...)
              └─ push notifications to mobile/webhook (best-effort, catch swallowed)
```

### Trigger sites for finalizeCurrentTurn() inside claudeRemoteAgentSdk.ts

| Site | Condition | Notes |
|------|-----------|-------|
| `message.type === 'result'` (line 1607) | Every normal turn end | Primary path |
| `message.type === 'result'` + `isCompactCommand` (line 1603) | /compact turn end | Sets completionEvent |
| `system.subtype === 'task_notification'` + status in `{stopped,failed,completed}` (line 1536) | Agent-teams task lifecycle | Subagent sub-turn end |
| `system.subtype === 'init'` + `isCompactCommand` (line 1554) | Compaction init boundary | Session ID reset path |

There is no existing `isSubagent` gate anywhere in `claudeRemoteAgentSdk.ts`.

---

## Side Effects

### [A] messageQueue.flush() — inside onReady lambda

- **File:** `apps/cli/src/backends/claude/utils/OutgoingMessageQueue.ts`
- **Effect:** Drains the outgoing queue of converted SDK messages to `session.client.sendClaudeSessionMessage`. This ensures all buffered tool-call messages are delivered to the server before the ready signal is sent.
- **Subagent relevance:** Subagent (sidechain) messages flow through `onMessage` → `messageQueue.enqueue` the same way as mainline messages. The flush must happen before any ready signal to prevent out-of-order delivery. This is independent of whether the ready event itself is sent.

### [B] session.sendSessionEvent({ type: 'ready' }) — core side effect

- **Effect:** Sends a WebSocket event to the relay server signaling the session is idle and waiting for input. The server uses this to update session state and unblock client delivery.
- **Local state mutations:** None. readyHandler only reads state (`getPending()`, `getQueueSize()`), it does not write local state.
- **Subagent relevance:** Sending ready for a subagent task_notification turn would incorrectly tell the mobile client "Claude is idle" mid-execution, causing premature UI transitions and potentially injecting a spurious user prompt.

### [B] dispatchActivityNotificationAsync — fire-and-forget push

- **Effect:** Sends push notifications to registered devices (Expo push, webhooks). All errors are swallowed via `.catch()`.
- **Subagent relevance:** Suppressing for subagent turns is correct — a sub-task completing is not a "waiting for your command" moment. This is a desirable side-benefit of gating.

### [11] scheduleNextMessagePump() — after onReady(), not inside it

- **Effect:** Starts an async loop that calls `opts.nextMessage()` and pushes the next user turn into the `PushableAsyncIterable`, unblocking the Claude Agent SDK for the next prompt.
- **Critical:** `scheduleNextMessagePump()` is on line 1180, unconditionally after `await opts.onReady()` on line 1179. It is sequential but independent. The pump does not depend on whether onReady sent a ready event or was a no-op.
- **Subagent relevance:** The multi-turn SDK loop continues regardless of whether onReady fires. Gating onReady does not block the next message pump.

### [2–4] Turn bookkeeping in finalizeCurrentTurn — before onReady()

These mutations happen before `opts.onReady()` is called and are unaffected by any gating:
- `didFinalizeTurn = true` — prevents double-finalization in the same turn
- `awaitingNextTurnStart = true` — gates the finalize guard reset until the next stream_event
- `activeTaskId = null` — required before the next task can be tracked

---

## Session Loop Safety

**Question:** Is there any state machine or loop that requires a ready signal after every turn (parent or subagent)?

**Answer: No. The ready signal is only needed at the end of top-level turns, not after subagent task legs.**

Evidence:

1. **scheduleNextMessagePump() does not depend on onReady().** The pump fires unconditionally on line 1180, after the awaited onReady on line 1179. A no-op onReady still resolves and lets the pump start.

2. **The `result` message path and the `task_notification` path are distinct.** When `task_notification` with `status === 'completed'` fires, this is a sub-task inside an agent-teams orchestration finishing. The top-level turn end still arrives via `message.type === 'result'`. The `didFinalizeTurn` guard prevents the result path from double-firing if task_notification already finalized.

3. **The `awaitingNextTurnStart` mechanism bridges turns correctly.** After finalization:
   - `awaitingNextTurnStart = true`, `didFinalizeTurn = true`
   - The loop watches for the next assistant or user stream_event (`clearFinalizeGuardForNextTurnStart()` at line 1249–1252)
   - On seeing one: `awaitingNextTurnStart = false; didFinalizeTurn = false` — the next turn can finalize normally

   This mechanism operates on `stream_event` messages, which are independent of whether readyHandler was called.

4. **The idempotency guard makes gating safe.** `finalizeCurrentTurn()` early-returns on `didFinalizeTurn === true`. If a subagent task_notification calls it first, the subsequent `result` message call is a no-op. The ready event would only fire once — from whichever site first ran the non-gated finalizeCurrentTurn.

5. **Push guards in readyHandler provide defense-in-depth.** Even if ready fires unexpectedly, the `getPending()` and `getQueueSize()` guards prevent it from firing while there is a queued user message. This would not help for subagent turns (the queue may be empty mid-session), so gating at the call site in finalizeCurrentTurn is the correct layer.

**Conclusion:** Gating `opts.onReady()` behind `if (!isSubagent)` in `finalizeCurrentTurn()` is safe from a session loop perspective. The pump, turn bookkeeping, and idempotency guard all operate independently of whether the ready event is sent.

---

## Integration Points

### Integration 1: messageQueue.flush() must run regardless of isSubagent

The `onReady` lambda wraps both the flush and the ready event:

```typescript
// claudeRemoteLauncher.ts lines 992–995
onReady: async () => {
    await messageQueue.flush();   // must always run
    readyHandler();               // conditionally run
},
```

The flush is not inside `readyHandler`. If gating on `isSubagent`, the correct pattern is:

```typescript
onReady: async () => {
    await messageQueue.flush();              // always flush — prevents out-of-order messages
    if (!isSubagent) readyHandler();         // only signal ready for top-level turns
},
```

Skipping the flush for subagent turns would risk messages arriving at the server after the eventual top-level ready signal, breaking message ordering.

### Integration 2: sendSessionEvent({ type: 'ready' }) — one per top-level turn

This is the only mechanism by which the server transitions the session to idle. It must fire exactly once per completed top-level turn. Subagent task_notification turns must not trigger it.

### Integration 3: scheduleNextMessagePump() — independent of onReady()

Line 1180 calls `scheduleNextMessagePump()` unconditionally after the await. The multi-turn SDK loop does not stall if `onReady()` is a no-op.

### Integration 4: didFinalizeTurn idempotency

`finalizeCurrentTurn()` line 1159: `if (didFinalizeTurn) return`. Multiple invocations in the same turn (e.g. task_notification then result) only execute the body once. The reset happens via `awaitingNextTurnStart = false; didFinalizeTurn = false` on the next stream_event.

### Integration 5: activeTaskId lifecycle

Set by `task_started`/`task_progress`, cleared by `task_notification`. `finalizeCurrentTurn()` resets it to `null` on line 1162 before calling `opts.onReady()`. Unaffected by gating.

### Integration 6: pending/queue guards in readyHandler

These guard against a racing queued next user message. They operate at the launcher level and are independent of isSubagent gating. For subagent turns they are insufficient (queue may be empty mid-session), so call-site gating is required.

---

## Sources

All findings are HIGH confidence from direct source inspection:

- `apps/cli/src/backends/claude/remote/claudeRemoteAgentSdk.ts` — lines 1158–1181 (finalizeCurrentTurn), 1519–1557 (task_notification path), 1583–1608 (result path), 1243–1253 (awaitingNextTurnStart reset)
- `apps/cli/src/backends/claude/claudeRemoteLauncher.ts` — lines 161–198 (createClaudeRemoteReadyHandler), 847–860 (readyHandler instantiation), 992–995 (onReady lambda)
- `apps/cli/src/agent/runtime/sendReadyWithPushNotification.ts` — full file (sendSessionEvent on line 47, fire-and-forget push on line 68)
- `apps/cli/src/agent/runtime/readyNotificationContext.ts` — full file (read-only helpers, no state mutations)
- `apps/cli/src/backends/claude/claudeRemoteLauncher.readyPushPolicy.test.ts` — confirms guard behavior (pending/queue no-op, ready event always precedes push)
