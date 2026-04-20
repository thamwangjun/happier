# Technology Stack Research: Parent vs Subagent Turn Completion

**Project:** Happier CLI — Claude backend (`claudeRemoteAgentSdk.ts`)
**Researched:** 2026-04-19
**Overall confidence:** HIGH (all findings sourced from installed SDK `.d.ts` and codebase)

---

## SDK Signals

### What the SDK actually exposes about subagent identity

**Confidence: HIGH** — sourced from the installed type definitions at
`apps/cli/node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts`.

#### The `SDKTaskNotificationMessage` type (the current heuristic trigger)

```typescript
export declare type SDKTaskNotificationMessage = {
    type: 'system';
    subtype: 'task_notification';
    task_id: string;
    tool_use_id?: string;           // links back to the Task tool call that spawned this subagent
    status: 'completed' | 'failed' | 'stopped';
    output_file: string;
    summary: string;
    usage?: { total_tokens: number; tool_uses: number; duration_ms: number };
    uuid: UUID;
    session_id: string;
};
```

The `task_notification` subtype is emitted **only by a subagent completing** — it is not emitted at the end of a parent (top-level) turn. The `SDKResultSuccess` / `SDKResultError` messages are emitted only for the parent turn.

**The current codebase already has the correct discriminant available without any SDK change.** The two distinct code paths in the `for await` loop are:

- `inboundType === 'result'` → parent agent turn ended → `finalizeCurrentTurn()` at line 1607
- `subtype === 'task_notification'` with terminal status → subagent turn ended → `finalizeCurrentTurn()` at line 1536

These are structurally disjoint. No additional SDK field is needed.

#### Hook-level signals (available but not used by the current loop)

The SDK also fires `SubagentStart` and `SubagentStop` hook events:

```typescript
export declare type SubagentStartHookInput = BaseHookInput & {
    hook_event_name: 'SubagentStart';
    agent_id: string;
    agent_type: string;
};

export declare type SubagentStopHookInput = BaseHookInput & {
    hook_event_name: 'SubagentStop';
    stop_hook_active: boolean;
    agent_id: string;
    agent_transcript_path: string;
    agent_type: string;
    last_assistant_message?: string;
};
```

These arrive via the hooks callback mechanism, not through the main message stream. The existing codebase builds hooks in `buildClaudeAgentSdkHooks` but does not use `SubagentStop` to trigger any ready-state logic. Using hook events would require cross-cutting state (hooks run on a parallel path from the message loop) and introduce synchronization complexity.

**Recommendation: Do not use `SubagentStop` hook. The message-stream discriminant (`task_notification` vs `result`) is cleaner and already present.**

#### `canUseTool` callback `agentID` field

```typescript
export declare type CanUseTool = (toolName: string, input, options: {
    signal: AbortSignal;
    ...
    agentID?: string;   // non-null when called from within a subagent
}) => Promise<PermissionResult>;
```

This is only relevant inside the permission callback, not for turn-completion signaling. Not applicable here.

#### No explicit `isSubagent` field on result messages

`SDKResultSuccess` and `SDKResultError` have no `parent_task_id`, `agentID`, or `is_subagent` field. The `result` message is only ever emitted for the top-level parent turn — the SDK never emits a `result` message for a subagent. This is a verified SDK invariant (confirmed via the type definitions): subagents complete via `task_notification`, parents complete via `result`.

---

## Parameter Pattern

### How to add `isSubagent: boolean` to `finalizeCurrentTurn()`

**Confidence: HIGH** — standard TypeScript patterns consistent with this codebase's conventions.

#### Current signature (line 1158 of `claudeRemoteAgentSdk.ts`)

```typescript
const finalizeCurrentTurn = async (params?: { completionEvent?: string }) => {
```

#### Recommended change

Extend the existing `params` bag — do not add a positional boolean:

```typescript
const finalizeCurrentTurn = async (params?: {
    completionEvent?: string;
    isSubagent?: boolean;
}) => {
```

Then gate the `onReady()` call:

```typescript
if (!params?.isSubagent) {
    await opts.onReady();
}
```

**Why a named bag, not a positional boolean:**

- `finalizeCurrentTurn(true)` vs `finalizeCurrentTurn(false)` is illegible at every call site.
- The codebase already uses this exact pattern for optional param extension (see `completionEvent` bag).
- Adding a key to an optional bag is backward-compatible with the three existing call sites (all pass `undefined` or `{ completionEvent }`, so `params?.isSubagent` safely defaults to `undefined` which is falsy — meaning parent behavior is preserved by default).

#### Call site changes required

There are **three** call sites in the file:

| Line | Path | `isSubagent` value |
|------|------|--------------------|
| 1536 | `task_notification` with terminal `status` | `true` |
| 1554 | `/compact` inside `system init` branch | `false` (parent compact boundary) |
| 1603–1607 | `result` message (parent) | `false` (or omit — falsy by default) |

The compact-inside-`task_notification` case (line 1554) is inside the `subtype === 'init'` branch, not the `task_notification` branch, so it correctly remains a parent-side completion. No subagent ambiguity there.

#### `onReady` -> `readyHandler` call graph

In `claudeRemoteLauncher.ts` (line 992–995):

```typescript
onReady: async () => {
    await messageQueue.flush();
    readyHandler();
},
```

`readyHandler` is created by `createClaudeRemoteReadyHandler()` (line 847) and calls `session.client.sendSessionEvent({ type: 'ready' })` which fires the ready event to all connected clients. Suppressing this on subagent completion (by skipping `opts.onReady()`) has no side effects on the message queue flush or session loop, because `scheduleNextMessagePump()` is called unconditionally after `onReady()` in `finalizeCurrentTurn()`. That call must remain outside the `isSubagent` gate — it schedules the next turn regardless.

**No session-loop regression risk from the guard.** The loop continues normally; only the network-level `ready` broadcast is suppressed.

---

## Risks

### Risk 1: `scheduleNextMessagePump()` must not be gated — HIGH severity if violated

`finalizeCurrentTurn()` calls both `opts.onReady()` and `scheduleNextMessagePump()`. Only `opts.onReady()` should be gated behind `!isSubagent`. If `scheduleNextMessagePump()` were also gated, the turn pump would deadlock after a subagent completes — no new messages would be picked up for the remainder of the parent session.

**Prevention:** The guard must wrap only `opts.onReady()`, not the subsequent `scheduleNextMessagePump()` call.

### Risk 2: `didFinalizeTurn` guard conflicts with subagent finalization — MEDIUM severity

The existing `didFinalizeTurn` boolean prevents double-finalization within one turn. A subagent `task_notification` calling `finalizeCurrentTurn({ isSubagent: true })` would set `didFinalizeTurn = true`, causing the subsequent parent `result` message to hit `if (didFinalizeTurn) { continue; }` at line 1597 and be silently skipped — the parent would never fire `onReady()`.

**Prevention:** Do not set `didFinalizeTurn = true` inside the subagent path. The simplest safe approach is to early-return from the `didFinalizeTurn` guard only when `!isSubagent`, and to not touch `didFinalizeTurn` at all in the subagent path:

```typescript
const finalizeCurrentTurn = async (params?: {
    completionEvent?: string;
    isSubagent?: boolean;
}) => {
    const isSubagent = params?.isSubagent ?? false;

    if (!isSubagent) {
        if (didFinalizeTurn) return;
        didFinalizeTurn = true;
        awaitingNextTurnStart = true;
    }

    activeTaskId = null;
    updateThinking(false);
    // ... flush, diagnostics, completionEvent ...

    if (!isSubagent) {
        await opts.onReady();
        scheduleNextMessagePump();
    }
};
```

This keeps subagent finalization as lightweight cleanup (thinking state, transcript flush, diagnostics reset) without disturbing the parent turn's `didFinalizeTurn` gate.

### Risk 3: Compact inside subagent (hypothetical) — LOW severity

If a subagent internally triggers a `/compact` event, line 1554 calls `finalizeCurrentTurn()` from inside the `system init` handler. That branch is not gated on any `task_id` match, so it fires as a parent turn today. If Anthropic ever introduces subagent-level compaction, this could become an issue. For the current SDK version this is not a real risk.

### Risk 4: SDK invariant not formally documented — LOW severity

The discriminant relies on `result` being parent-only and `task_notification` being subagent-only. This is an observed invariant from the type definitions, not a documented guarantee. If Anthropic changes the SDK to emit `result` messages for subagents, the discriminant would break. Mitigation: comment the invariant assumption explicitly in code.

---

## Sources

- `apps/cli/node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts` — installed SDK type definitions (HIGH confidence — authoritative for the installed version `@anthropic-ai/claude-agent-sdk ^0.2.34`)
- `apps/cli/src/backends/claude/remote/claudeRemoteAgentSdk.ts` — full file read, call site analysis (HIGH confidence)
- `apps/cli/src/backends/claude/claudeRemoteLauncher.ts` — full file read, `onReady` call graph verification (HIGH confidence)
