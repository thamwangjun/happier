# Phase 4: Restructure finalizeCurrentTurn() - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-19
**Phase:** 04-restructure-finalizecurrentturn
**Areas discussed:** onReady callback contract, didFinalizeTurn guard on subagent path, Test file location

---

## onReady callback contract

| Option | Description | Selected |
|--------|-------------|----------|
| Pass isSubagent into onReady(isSubagent) — launcher gates readyHandler internally | finalizeCurrentTurn always calls opts.onReady(isSubagent). Minimal interface change. | |
| Add opts.onSubagentFlush?() — keep onReady() parent-only | finalizeCurrentTurn calls opts.onSubagentFlush?.() for subagent, opts.onReady() for parent. | ✓ |
| You decide | Trust Claude to pick | |

**User's choice:** `opts.onSubagentFlush?: () => Promise<void>` added to opts object. `onReady` stays parent-only. `onSubagentFlush` called every time on subagent path — no additional guard.

**Follow-up: completionEvent placement**
| Option | Selected |
|--------|----------|
| Move to Phase B — fire only for parent | ✓ |
| Leave in Phase A — fire unconditionally | |

**Follow-up: launcher wiring scope**
| Option | Selected |
|--------|----------|
| Wire onSubagentFlush in live launcher too (Phase 4) | ✓ |
| Test harness only — defer to Phase 5 | |

**Follow-up: test harness updates**
| Option | Selected |
|--------|----------|
| Update readyPushPolicy.test.ts and other harnesses in Phase 4 | ✓ |
| Defer to Phase 5 | |

**Notes:** User clarified the role of `onSubagentFlush` — it exists to ensure `messageQueue.flush()` runs after subagent turns without triggering `readyHandler()`.

---

## didFinalizeTurn guard on subagent path

| Option | Description | Selected |
|--------|-------------|----------|
| Skip guard for subagent — let Phase A run every time | Change guard to `if (!isSubagent && didFinalizeTurn) return` | ✓ |
| Keep guard but reset with a subagentDidFinalize flag | More defensive, adds unnecessary state | |

**User's choice:** Guard becomes `if (!isSubagent && didFinalizeTurn) return`. Subagent path has no guard — Phase A always runs.

**Follow-up: deferredInterruptedReason and resetTurnDiagnostics**
| Option | Selected |
|--------|----------|
| Run both unconditionally in Phase A | ✓ |
| Gate resetTurnDiagnostics behind !isSubagent | |

---

## Test file location

| Option | Description | Selected |
|--------|-------------|----------|
| New file: claudeRemoteAgentSdk.subagentTurnCompletion.test.ts | Clean separation, easier to find | ✓ |
| Add to existing: claudeRemoteAgentSdk.optionsAndHooks.test.ts | Fewer files but already 1600+ lines | |

**User's choice:** New file `claudeRemoteAgentSdk.subagentTurnCompletion.test.ts`.

---

## Claude's Discretion

- Boolean coercion style for `isSubagent` (`?? false` vs `!!`)
- Internal variable naming inside `finalizeCurrentTurn`

## Deferred Ideas

- Codex-style dedicated `finalizeSyntheticSubagentThread` function — future milestone
- Gate `resetTurnDiagnostics()` behind `!isSubagent` for full-turn diagnostics — Future Requirements
