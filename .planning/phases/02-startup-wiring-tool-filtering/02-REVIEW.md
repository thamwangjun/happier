---
phase: 02-startup-wiring-tool-filtering
reviewed: 2026-04-19T00:00:00Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - apps/cli/src/settings/sessionAgentToolsSettings.ts
  - apps/cli/src/settings/sessionAgentToolsSettings.test.ts
  - apps/cli/src/persistence.ts
  - apps/cli/src/mcp/server/registerHappierMcpBuiltInTools.ts
  - apps/cli/src/mcp/server/registerHappierMcpBuiltInTools.test.ts
  - apps/cli/src/mcp/createHappierMcpServer.ts
  - apps/cli/src/mcp/createHappierMcpServer.test.ts
  - apps/cli/src/mcp/startHappyServer.ts
  - apps/cli/src/mcp/startHappyServer.integration.test.ts
findings:
  critical: 0
  warning: 4
  info: 5
  total: 9
status: issues_found
---

# Phase 02: Code Review Report

**Reviewed:** 2026-04-19
**Depth:** standard
**Files Reviewed:** 9
**Status:** issues_found

## Summary

This phase wires `sessionAgentToolsSettingsV1` from `persistence.ts` / `settings/sessionAgentToolsSettings.ts` through `startHappyServer` into `createHappierMcpServer` and `registerHappierMcpBuiltInTools`. The implementation is well-structured: the predicate is computed once at startup (STARTUP-01), forwarded as a function reference (D-04), and the opt-out model (SCHEMA-02) is clearly documented and tested.

No critical/security issues were found. Four warnings relate to logic gaps that could cause subtle runtime misbehaviour: a stale-lock silent drop in `updateSettings`, an unprotected lock-file read, an unchecked `keepAliveIntervalMs` type, and a `toolNamesSnapshot` divergence from what the MCP server actually registers. Five info items cover error-handling verbosity, dead code, and naming inconsistency.

## Warnings

### WR-01: `updateSettings` silently drops the update when the lock is never acquired

**File:** `apps/cli/src/persistence.ts:441-443`
**Issue:** After the retry loop exhausts all attempts, `fileHandle` is `undefined` and the function throws a descriptive error — but only _after_ the loop exits. However if every iteration hits `EEXIST` and the stale-lock cleanup path at line 432 unlinks the file _and_ the loop continues (`attempts++` happens before the unlink check), `attempts` may reach `MAX_LOCK_ATTEMPTS` while a fresh acquisition on the _next_ iteration would have succeeded. The off-by-one is that `attempts++` increments before the stale-lock removal, so the very last attempt (when `attempts === MAX_LOCK_ATTEMPTS - 1`) still retries, but then `attempts` becomes `MAX_LOCK_ATTEMPTS` before the re-acquisition at the top of the loop; the `while` condition fails and we exit with `fileHandle = undefined`. In practice this means a legitimately-stale lock evicted on the final attempt causes the update to fail even though the lock is now free.
**Fix:** Move `attempts++` after the stale-lock cleanup so the freed slot gets a retry attempt, or restructure to `continue` without incrementing when a stale lock was removed:
```typescript
if (Date.now() - stats.mtimeMs > STALE_LOCK_TIMEOUT_MS) {
    await unlink(lockFile).catch(() => {});
    // do NOT increment attempts — this was a stale lock, not a real contention hit
    continue;
}
```

---

### WR-02: Unprotected `readFileSync` in `acquireDaemonLock` can throw and swallow the EEXIST error path

**File:** `apps/cli/src/persistence.ts:806-810`
**Issue:** The `readFileSync(configuration.daemonLockFile, 'utf-8')` call at line 806 is outside a try-catch. If the lock file is deleted between the `EEXIST` catch and the `readFileSync` (race window), Node throws `ENOENT`, which propagates out of the inner block unhandled. The outer `catch` at line 829 will fall through to the retry/return-null path, but only because it happens to be the right catch scope. The intent is clearly a TOCTOU-safe pattern, but the unprotected read means any filesystem error in that block silently becomes a `null` return after `maxAttempts`, which could leave the daemon unstarted with no warning.
**Fix:** Wrap the inner `readFileSync` in its own try-catch (a separate one from the existing one at line 824) so the unlink/retry path is always reached on read failure:
```typescript
try {
    const lockPid = readFileSync(configuration.daemonLockFile, 'utf-8').trim();
    // ... existing logic ...
} catch {
    // File was deleted between EEXIST and read — treat as free, retry
    continue;
}
```

---

### WR-03: `keepAliveIntervalMs` treated as truthy but `0` is a valid falsy number

**File:** `apps/cli/src/mcp/startHappyServer.ts:134`
**Issue:** `startMcpSseKeepAlive` guards with `if (!keepAliveIntervalMs)` to skip the keepalive when the feature is disabled. `keepAliveIntervalMs` is typed `number | null`. The guard correctly handles `null`, but also silently disables the feature for `0` (which `setInterval(fn, 0)` is valid for burst-testing). More importantly, configuration could theoretically be set to `0` (not `null`) intending "as fast as possible" and the feature would silently no-op. The convention in this codebase is to use `null` for "disabled", but that guarantee lives entirely in `configuration`. A caller passing a non-null `0` would get surprising behaviour.
**Fix:** Use an explicit null-check to align with the type:
```typescript
if (keepAliveIntervalMs === null) {
    return () => {};
}
```

---

### WR-04: `toolNamesSnapshot` in `startHappyServer` and the per-request `toolNames` from `createHappierMcpServer` can diverge

**File:** `apps/cli/src/mcp/startHappyServer.ts:44-46`
**Issue:** `toolNamesSnapshot` is computed by filtering `listBuiltInHappierTools` with `isSessionAgentToolEnabled`. Each HTTP request then calls `createHappierMcpServer`, which calls `registerHappierMcpBuiltInTools`, which also calls `listBuiltInHappierTools` and filters with the same predicate. If `listBuiltInHappierTools` is not a pure function (e.g. it reads environment state or a module-level registry that changes), the snapshot and the live server can diverge. Even if `listBuiltInHappierTools` is pure today, the snapshot is re-deriving the same set in two places, creating an implicit coupling that is fragile. The `toolNames` returned by `startHappyServer` is used by callers to advertise available tools; divergence leads to the host advertising tools that are not actually registered.
**Fix:** Derive `toolNamesSnapshot` from the return value of a single `createHappierMcpServer` call (e.g. on the first request, or by accepting a `dryRun` mode), or expose a dedicated helper that returns the filtered name list so the snapshot and the registered list share one code path. At minimum, add a comment acknowledging the two-place derivation and the invariant that must hold.

---

## Info

### IN-01: `as any` cast on `mcp` passed to `registerHappierMcpResources` and `registerHappierMcpBuiltInTools`

**File:** `apps/cli/src/mcp/createHappierMcpServer.ts:163, 177`
**Issue:** `mcp` (typed `McpServer`) is cast to `any` before being passed to both registration helpers. The `ToolRegistrar` interface in `registerHappierMcpBuiltInTools.ts` is intentionally narrow, which is good, but the `as any` cast bypasses the structural check entirely. If `McpServer.registerTool` signature changes, this will fail at runtime rather than compile time.
**Fix:** Either widen `ToolRegistrar` to match `McpServer` structurally, or import `McpServer` in the helper and use it directly. Alternatively, keep the narrow interface but cast to the interface type rather than `any`:
```typescript
registerHappierMcpBuiltInTools(mcp as unknown as Parameters<typeof registerHappierMcpBuiltInTools>[0], { ... });
```

---

### IN-02: Dead import `OutgoingHttpHeaders` in `startHappyServer.ts`

**File:** `apps/cli/src/mcp/startHappyServer.ts:1`
**Issue:** `OutgoingHttpHeaders` is imported from `node:http` but is never referenced in the file. This is an unused import.
**Fix:** Remove `OutgoingHttpHeaders` from the import statement:
```typescript
import { createServer, type ServerResponse } from "node:http";
```

---

### IN-03: `empty catch` in `bestEffortChmod` / `bestEffortChmodSync` swallows all errors without logging

**File:** `apps/cli/src/persistence.ts:22-28, 30-37`
**Issue:** Both helpers catch all errors silently with a bare `catch { // best-effort }`. This is intentional for permission hardening, but on non-Windows platforms an unexpected error (e.g. EROFS) is indistinguishable from a no-op. A debug-level log line would help diagnosis during development without changing production behaviour.
**Fix:** Add a `logger.debug` call in the catch block (per project logging convention — file logs only, never stdout):
```typescript
} catch (err) {
    logger.debug(`[persistence] bestEffortChmod failed for ${path}:`, err);
}
```

---

### IN-04: `migrateSettings` comment references a future migration slot that has now passed

**File:** `apps/cli/src/persistence.ts:236-238`
**Issue:** The comment `// Future migrations go here: // if (fromVersion < 6) { ... }` was left after the v5→v6 migration was added. The v6 block immediately above it already implements the migration; the placeholder comment now refers to a version that exists, creating minor confusion for the next developer adding v7.
**Fix:** Update or remove the stale comment:
```typescript
// Add future migrations here (e.g. if (fromVersion < 7) { ... })
```

---

### IN-05: Test file `sessionAgentToolsSettings.test.ts` creates a temp directory and sets filesystem env vars but never exercises filesystem paths

**File:** `apps/cli/src/settings/sessionAgentToolsSettings.test.ts:13-27`
**Issue:** Each test in this file creates a temp directory and sets `HAPPIER_HOME_DIR`, `HAPPIER_SERVER_URL`, and `HAPPIER_WEBAPP_URL`. However, `readSessionAgentToolsSettingsV1` and `buildIsSessionAgentToolEnabled` are pure functions that accept a `Settings` object — they never touch the filesystem or read environment variables. The setup is therefore dead scaffolding that adds test runtime overhead without providing any isolation benefit.
**Fix:** Remove the `createTempDir`/`removeTempDir` scaffolding and the env-var snapshot/restore. The tests remain correct and faster without it. If future tests in this file do require filesystem access, the scaffolding can be re-introduced at that point.

---

_Reviewed: 2026-04-19_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
