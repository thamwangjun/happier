# Feature Behavior: Parent vs Subagent Turn Completion

**Project:** Happier — v1.1 distinguish parent vs subagent turn completion
**Researched:** 2026-04-19
**Confidence:** HIGH (all findings from direct codebase inspection)

---

## Ready Signal Semantics

### What `opts.onReady()` does (call graph, verified)

In `claudeRemoteAgentSdk.ts`, `finalizeCurrentTurn()` (line 1158) calls `opts.onReady()` as its last substantive action before `scheduleNextMessagePump()`. The internal work before `opts.onReady()`:

1. Set `didFinalizeTurn = true`, `awaitingNextTurnStart = true`, `activeTaskId = null`
2. Call `updateThinking(false)` — stops the thinking spinner
3. Flush `streamedTranscriptWriter` (transcript committed to server)
4. Log turn diagnostics and reset them via `resetTurnDiagnostics()`
5. Optionally emit a `completionEvent` string to the mobile UI

`opts.onReady()` is wired in `claudeRemoteLauncher.ts` (line 992):

```typescript
onReady: async () => {
    await messageQueue.flush();
    readyHandler();
},
```

`readyHandler` is created by `createClaudeRemoteReadyHandler()` (line 847). That function (line 161) does:

1. **Guard check:** if `pending` is non-null or `session.queue.size() !== 0`, return immediately without sending anything. The ready signal is suppressed when new messages are already queued.
2. If no `pushSender`, call `session.sendSessionEvent({ type: 'ready' })` directly.
3. If `pushSender` exists, call `sendReadyWithPushNotification()` which calls `sendSessionEvent({ type: 'ready' })` AND optionally sends a push notification to all registered devices.

### Where does `{ type: 'ready' }` go?

`sendSessionEvent` is an RPC call over the existing Socket.IO session client. The relay server receives it and fans it out to all connected clients (mobile app, web UI, Tauri desktop) as a session event message.

On the mobile/web UI side, `sync.ts` (line 3500) processes incoming messages through the reducer. The `messageToEventConversion.ts` phase (line 48) detects `msg.role === 'event' && msg.content.type === 'ready'`:

- The message is **filtered out of the transcript** — it creates no visible chat bubble
- It sets `hasReadyEvent = true` and records `readyAt` (the message timestamp)
- This propagates back to `sync.ts` (line 3500-3503):

```typescript
if (result.hasReadyEvent) {
    voiceHooks.onReady(sessionId, m);
    notifyActivityReady(sessionId, m);
}
```

`notifyActivityReady` feeds into `ActivityLocalNotificationRuntime` which fires a local OS notification (Tauri or Expo) if the user is not currently viewing that session.

### What the `ready` event does NOT do directly

The `ready` event does not itself flip `session.thinking` to `false`. That is done separately through the task lifecycle path (`turn_aborted` / `task_complete` agent messages handled in `sync.ts` line 2558). The thinking state update and the `ready` signal are independent flows. The `ready` event's job is specifically:

1. Signal that the agent is awaiting user input (enables input field in UI)
2. Trigger push notifications to the user's devices
3. Trigger local OS notifications on the active device if the user is not viewing the session
4. Trigger voice session hooks for ElevenLabs/LiveKit voice turn management

The reducer also uses `readyAt` to cancel any tool calls still marked as running (spinners), as defensive cleanup for dropped events during reconnects (reducer.ts lines 542-549).

---

## User-Visible Impact

### When the parent agent completes a turn (correct behavior)

The parent agent emitting `SDKResultMessage` (or a `task_notification` with `status: completed` for the root task) means the entire Claude Code session has finished processing and is waiting for user input. At this point:

- The input field in the mobile/web UI should become enabled (no longer blocked by "agent is thinking")
- The thinking spinner stops
- Push notifications are sent to all paired devices ("Claude is ready")
- Local OS notifications fire if the user is not viewing the session
- Voice session hooks fire for voice turn handoff
- The message queue is flushed so all pending conversation messages are delivered before the ready signal

This is the correct moment to call `readyHandler()`.

### When a subagent completes (premature behavior, current bug)

When Claude Code uses agent teams (`claudeCodeExperimentalAgentTeamsEnabled`), it spawns subagents as tasks. A `task_notification` with `status: completed` or `stopped` fires for each subagent that finishes — before the parent agent has completed its own turn.

`finalizeCurrentTurn()` is called on that `task_notification` path (claudeRemoteAgentSdk.ts lines 1535-1537):

```typescript
} else if (subtype === 'task_notification') {
    ...
    if (status === 'stopped' || status === 'failed' || status === 'completed') {
        await finalizeCurrentTurn();
    }
}
```

Currently this calls `opts.onReady()` unconditionally, meaning all of the above user-visible actions fire while the parent agent is still running.

---

## Premature Ready Consequences

### Consequence 1: False "done" push notifications (HIGH severity)

The user receives a device push notification saying Claude is finished, taps into the app, and sees the agent still running. This is a broken UX trust signal. If a multi-agent run uses several subagents, the user receives spam notifications during what should be a single uninterrupted turn.

**Source:** `sendReadyWithPushNotification` is called via `readyHandler()` — which fires on every `finalizeCurrentTurn()` call that passes the guard.

### Consequence 2: Premature input enablement (HIGH severity)

The mobile UI receives `{ type: 'ready' }` from the server. The reducer sets `hasReadyEvent = true`. Any UI that gates user input on thinking/ready state displays the input field as active while the parent agent is still executing.

If the user sends a message, the daemon's `waitForMessagesOrPending` picks it up and pushes it into the `PushableAsyncIterable` feeding the Claude Agent SDK — injecting a user message into an in-flight turn, which causes context corruption or unexpected Claude behavior.

### Consequence 3: Suppressed legitimate parent-completion ready (HIGH severity)

This is the most insidious consequence. The `readyHandler` guard (lines 175-176):

```typescript
if (params.getPending()) return;
if (params.getQueueSize() !== 0) return;
```

Additionally, `finalizeCurrentTurn()` sets `didFinalizeTurn = true` on line 1160. The parent's `result` message path checks this guard at line 1597:

```typescript
if (didFinalizeTurn) {
    continue;
}
```

This means: if the subagent completion fires `finalizeCurrentTurn()` first and sets `didFinalizeTurn = true`, the parent's `result` message is silently skipped. **The parent-completion ready never fires.** The user never receives the legitimate "Claude is done" notification for the actual turn boundary.

This is why `didFinalizeTurn = true` must also be gated behind `if (!isSubagent)` in the fix — not just `opts.onReady()`.

### Consequence 4: Voice session hooks fire at wrong time (MEDIUM severity)

`voiceHooks.onReady(sessionId, m)` is called in `sync.ts` when `hasReadyEvent` is true. This advances the voice conversation turn state. Firing on subagent completion incorrectly signals voice turn end, which may cut off the voice assistant's listening state or advance to the next turn prompt prematurely.

### Consequence 5: Redundant transcript flushes and diagnostic resets (LOW severity)

`flushStreamedTranscriptWriter('turn-end')` and `resetTurnDiagnostics()` fire in `finalizeCurrentTurn()`. On subagent completion, the transcript flush is legitimate (subagent output should be committed). However `resetTurnDiagnostics()` resets counters mid-parent-turn, so parent-turn diagnostics logged at actual turn end reflect only post-subagent activity, not the full turn. This is a logging/observability issue, not a user-facing correctness issue.

### What does NOT break

The transcript itself is correct. Subagent messages flow through the sidechain mechanism (`parent_tool_use_id`) and the main-chain transcript is unaffected by `finalizeCurrentTurn()` being called prematurely on the content side.

---

## Fix Constraints

### `isSubagent` must gate both `opts.onReady()` AND `didFinalizeTurn = true`

Gating only `opts.onReady()` is insufficient. The `didFinalizeTurn` flag prevents the parent's `result` message from triggering a second `finalizeCurrentTurn()` call (line 1597 guard). Without also gating `didFinalizeTurn`, the real parent completion boundary is silently dropped and `opts.onReady()` never fires for the parent turn.

The correct approach:

```typescript
const finalizeCurrentTurn = async (isSubagent: boolean, params?: { completionEvent?: string }) => {
    if (!isSubagent) {
        if (didFinalizeTurn) return;
        didFinalizeTurn = true;
        awaitingNextTurnStart = true;
    }
    activeTaskId = null;
    updateThinking(false);
    // ... flush transcript, log diagnostics, reset diagnostics ...
    if (params?.completionEvent) {
        opts.onCompletionEvent?.(params.completionEvent);
    }
    if (!isSubagent) {
        await opts.onReady();
    }
    scheduleNextMessagePump();
};
```

### `scheduleNextMessagePump()` must still run on subagent completion

The message pump must stay active while the parent is still running. `scheduleNextMessagePump` is idempotent (`if (nextMessagePump) return;`) so calling it on subagent events is safe and necessary.

### Call sites

From code inspection, three call sites of `finalizeCurrentTurn()`:

1. **`task_notification` with `stopped/failed/completed` status (line 1536):** Subagent path. Use `finalizeCurrentTurn(true)`.
2. **`result` message path (line 1607):** Parent agent completing its turn. Use `finalizeCurrentTurn(false)`.
3. **Compact command paths (lines 1554, 1603):** Session-level operation, parent context. Use `finalizeCurrentTurn(false)`.

---

## Sources

All findings are from direct codebase inspection (HIGH confidence):

- `apps/cli/src/backends/claude/remote/claudeRemoteAgentSdk.ts` — `finalizeCurrentTurn()` body, `task_notification` handler, `result` message handler, `didFinalizeTurn` guard
- `apps/cli/src/backends/claude/claudeRemoteLauncher.ts` — `createClaudeRemoteReadyHandler()`, `onReady` wiring, `readyHandler` guard logic
- `apps/ui/sources/sync/reducer/phases/messageToEventConversion.ts` — `ready` event filtering, `hasReadyEvent` / `readyAt` propagation
- `apps/ui/sources/sync/reducer/reducer.ts` — `cancelRunningTools` on `readyAt`
- `apps/ui/sources/sync/sync.ts` — `notifyActivityReady()` and `voiceHooks.onReady()` on `hasReadyEvent`
- `apps/ui/sources/activity/notifications/runtime/ActivityLocalNotificationRuntime.tsx` — local OS notification on ready
- `apps/ui/sources/activity/notifications/runtime/activityLocalNotificationBus.ts` — notification bus definition
- `apps/cli/src/api/session/sessionMessageTypes.ts` — `SessionEventMessage` type including `{ type: 'ready' }`
- `apps/cli/src/backends/claude/claudeRemoteLauncher.readyPushPolicy.test.ts` — test confirming push + `sendSessionEvent` both fire on `onReady()`
