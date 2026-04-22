---
phase: 04-schema-predicate
reviewed: 2026-04-22T00:00:00Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - apps/cli/src/settings/sessionAgentToolsSettings.ts
  - apps/cli/src/settings/sessionAgentToolsSettings.test.ts
  - apps/cli/src/mcp/startHappyServer.ts
  - apps/cli/src/persistence.ts
findings:
  critical: 0
  warning: 3
  info: 4
  total: 7
status: issues_found
---

# Phase 04: Code Review Report

**Reviewed:** 2026-04-22T00:00:00Z
**Depth:** standard
**Files Reviewed:** 4
**Status:** issues_found

## Summary

Four files were reviewed: the new `sessionAgentToolsSettings.ts` module and its test suite, the `startHappyServer.ts` caller, and `persistence.ts` which provides the `Settings` type and `readSettings()`.

The core logic in `sessionAgentToolsSettings.ts` is correct and well-tested. The schema, predicate builder, and unknown-name utility all behave as specified. The test suite is thorough: it covers the opt-out model, per-tool overrides, the `default` field, and all error paths.

Three warnings were found:

1. `DEFAULT_SESSION_AGENT_TOOLS_SETTINGS` is a mutable exported object returned directly by `readSessionAgentToolsSettings`. Any caller that mutates the returned value will corrupt the shared module constant and cause incorrect behavior for all subsequent callers in the same process.

2. `startHappyServer` wraps `server.listen(...)` in a Promise but registers no error listener on the `server` object. If the listen call fails (e.g. OS error), the Promise never resolves or rejects and the function hangs indefinitely.

3. `persistence.ts` has a bare `catch { }` block in the stale-lock detection path inside `updateSettings`. The outer lock-acquisition flow does retry, so this is not catastrophic, but the silent swallow makes stale-lock failures invisible in logs.

Four info-level items round out the review.

## Warnings

### WR-01: Mutable shared default object returned directly

**File:** `apps/cli/src/settings/sessionAgentToolsSettings.ts:28` and `:41`

**Issue:** `DEFAULT_SESSION_AGENT_TOOLS_SETTINGS` is declared as a plain `const` object and is returned by reference from `readSessionAgentToolsSettings` when the key is absent or `null`. Because the `tools` property is a mutable `{}` object, any caller that writes to `result.tools` will silently mutate the module-level constant. All future callers that receive the default will then observe the mutated state.

```ts
// Line 28 — shared mutable object:
export const DEFAULT_SESSION_AGENT_TOOLS_SETTINGS: SessionAgentToolsSettings = { v: 1, tools: {} };

// Line 41 — returned by reference:
return DEFAULT_SESSION_AGENT_TOOLS_SETTINGS;
```

**Fix:** Return a shallow copy so each caller owns their own object. The `tools` map is empty at the default so a shallow copy is sufficient:

```ts
// Option A — spread on return (minimal change):
return { ...DEFAULT_SESSION_AGENT_TOOLS_SETTINGS, tools: { ...DEFAULT_SESSION_AGENT_TOOLS_SETTINGS.tools } };

// Option B — freeze the exported constant so mutation throws in strict mode:
export const DEFAULT_SESSION_AGENT_TOOLS_SETTINGS: Readonly<SessionAgentToolsSettings> = Object.freeze({ v: 1 as const, tools: Object.freeze({}) as Record<string, { enabled: boolean }> });
// Then keep `return DEFAULT_SESSION_AGENT_TOOLS_SETTINGS;` — callers cannot mutate a frozen object.
```

Option B is recommended because it makes the intent explicit and catches accidental mutations at runtime.

---

### WR-02: `server.listen` Promise never rejects on error

**File:** `apps/cli/src/mcp/startHappyServer.ts:134`

**Issue:** The `server.listen(0, '127.0.0.1', callback)` call is wrapped in a `Promise` that resolves inside the `listening` callback, but no `error` event listener is registered on `server`. If the OS rejects the listen call (for example due to a permissions error or a resource limit), the `error` event is emitted, goes unhandled, and the Promise neither resolves nor rejects — `startHappyServer` hangs indefinitely. In Node.js an unhandled `error` event on an `EventEmitter` also throws an uncaught exception.

```ts
// Lines 134–139 — no reject path:
const baseUrl = await new Promise<URL>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
        const addr = server.address() as AddressInfo;
        resolve(new URL(`http://127.0.0.1:${addr.port}`));
    });
});
```

**Fix:** Pass `reject` to the Promise and register an `error` listener before calling `listen`:

```ts
const baseUrl = await new Promise<URL>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
        server.removeListener('error', reject);
        const addr = server.address() as AddressInfo;
        resolve(new URL(`http://127.0.0.1:${addr.port}`));
    });
});
```

---

### WR-03: Silent `catch { }` in stale-lock stat path hides errors

**File:** `apps/cli/src/persistence.ts:435`

**Issue:** The stale-lock detection block inside `updateSettings` catches all errors silently without logging:

```ts
// Lines 430–436:
try {
    const stats = await stat(lockFile);
    if (Date.now() - stats.mtimeMs > STALE_LOCK_TIMEOUT_MS) {
        await unlink(lockFile).catch(() => { });
    }
} catch { }
```

While the outer retry loop eventually times out gracefully, a permission error or unexpected filesystem condition is swallowed with no trace in logs. This makes stale-lock incidents very hard to diagnose.

**Fix:** Log at debug level inside the catch:

```ts
} catch (err) {
    logger.debug('[updateSettings] Could not stat lock file during stale-lock check:', err);
}
```

---

## Info

### IN-01: `DEFAULT_SESSION_AGENT_TOOLS_SETTINGS` lacks `Readonly` type annotation

**File:** `apps/cli/src/settings/sessionAgentToolsSettings.ts:28`

**Issue:** The constant is exported as `SessionAgentToolsSettings` rather than `Readonly<SessionAgentToolsSettings>`. Per the project conventions in `CLAUDE.md`, immutable shapes should use `Readonly<{}>`. This is a separate concern from WR-01 (mutability at runtime) — the type annotation alone does not fix WR-01 but is required by project convention.

**Fix:** Change the type annotation (and freeze the object per WR-01's Option B):

```ts
export const DEFAULT_SESSION_AGENT_TOOLS_SETTINGS: Readonly<SessionAgentToolsSettings> = Object.freeze({ v: 1 as const, tools: {} });
```

---

### IN-02: `migrateSettings` uses untyped `any` parameters

**File:** `apps/cli/src/persistence.ts:147`

**Issue:** `function migrateSettings(raw: any, fromVersion: number): any` uses `any` for both input and output. Project conventions in `CLAUDE.md` and `CLAUDE.md` (root) state strict typing with no untyped code. Migration functions are a known exception in practice, but the return type is at minimum constrainable to `Partial<Settings> & { schemaVersion: number }`.

**Fix:** At minimum, add a return type annotation and narrow `raw`:

```ts
function migrateSettings(raw: Record<string, unknown>, fromVersion: number): Record<string, unknown> {
```

---

### IN-03: Unnecessary `Promise.resolve()` wrapping in cleanup

**File:** `apps/cli/src/mcp/startHappyServer.ts:110`

**Issue:** `await Promise.resolve(mcp.close())` wraps a call that likely already returns a `Promise`. `Promise.resolve(promise)` returns the same promise; the wrapping adds noise without value.

```ts
// Line 110:
await Promise.resolve(mcp.close());
```

**Fix:**

```ts
await mcp.close();
```

If `mcp.close()` is typed as `void | Promise<void>`, a simple `Promise.resolve(...)` wrap is a valid idiom — in that case, add a comment explaining the type:

```ts
// mcp.close() may return void or Promise<void>; resolve() normalizes both.
await Promise.resolve(mcp.close());
```

---

### IN-04: `releaseDaemonLock` swallows errors without logging

**File:** `apps/cli/src/persistence.ts:844-853`

**Issue:** Both `lockHandle.close()` and the `unlinkSync` in `releaseDaemonLock` are caught with empty blocks:

```ts
try {
    await lockHandle.close();
} catch { }

try {
    if (existsSync(configuration.daemonLockFile)) {
        unlinkSync(configuration.daemonLockFile);
    }
} catch { }
```

These are best-effort cleanup operations so silent swallowing is defensible, but a debug log would help diagnose daemon-shutdown issues.

**Fix:** Add `logger.debug` calls:

```ts
try {
    await lockHandle.close();
} catch (err) {
    logger.debug('[releaseDaemonLock] Error closing lock handle:', err);
}
```

---

_Reviewed: 2026-04-22T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
