---
phase: 03-validation-feedback
reviewed: 2026-04-19T00:00:00Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - apps/cli/src/settings/sessionAgentToolsSettings.ts
  - apps/cli/src/settings/sessionAgentToolsSettings.test.ts
  - apps/cli/src/mcp/startHappyServer.ts
  - apps/cli/src/mcp/startHappyServer.integration.test.ts
findings:
  critical: 0
  warning: 3
  info: 3
  total: 6
status: issues_found
---

# Phase 03: Code Review Report

**Reviewed:** 2026-04-19T00:00:00Z
**Depth:** standard
**Files Reviewed:** 4
**Status:** issues_found

## Summary

Reviewed the four files implementing `sessionAgentToolsSettingsV1` tool-filtering for the MCP server. The core settings module (`sessionAgentToolsSettings.ts`) and its unit tests are well-written, with correct opt-out semantics, safe fallback handling, and comprehensive coverage. The integration test suite (`startHappyServer.integration.test.ts`) provides solid end-to-end coverage of the filtering feature.

The main concern is in `startHappyServer.ts`: the `server.listen()` Promise never rejects, so any `'error'` event from the underlying TCP socket (e.g. no available ports, EADDRINUSE) causes the startup Promise to hang indefinitely. This is a silent reliability issue, not a crash, but it would manifest as an unresponsive CLI session with no error surfaced to the caller.

Two additional warning-level issues exist: the integration test's `process.env` mutation pattern is not safely restored on test failure, and the keepalive header detection logic in `startMcpSseKeepAlive` has a misleading guard condition. Three info-level issues cover `as any` casts and a minor inconsistency in the preprocess function's null handling.

---

## Warnings

### WR-01: `server.listen()` Promise never rejects — startup hangs silently on TCP errors

**File:** `apps/cli/src/mcp/startHappyServer.ts:134-139`
**Issue:** The `Promise<URL>` passed to `baseUrl` only resolves (in the `'listening'` callback) and never rejects. If `server.listen()` emits an `'error'` event — for example when the OS has no ephemeral ports available or a race on port 0 occurs — the Promise hangs forever. The caller `await startHappyServer(...)` never settles, leaving the session stuck with no error propagated.
**Fix:**
```typescript
const baseUrl = await new Promise<URL>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, "127.0.0.1", () => {
        server.removeListener('error', reject);
        const addr = server.address() as AddressInfo;
        resolve(new URL(`http://127.0.0.1:${addr.port}`));
    });
});
```

---

### WR-02: Integration test `process.env` mutation not restored on test failure

**File:** `apps/cli/src/mcp/startHappyServer.integration.test.ts:20-21` and `beforeEach` at line 76-80
**Issue:** `const env = process.env` captures a reference at module scope, and `beforeEach` replaces `process.env` with a shallow spread copy (`process.env = { ...env }`). There is no corresponding restoration in `afterEach` for the outer `describe` block. If a test in that block throws before `afterEach` runs its cleanup, env mutations (e.g. `delete process.env.HAPPIER_ACTIONS_SETTINGS_V1`) are not undone. This can cause cross-test contamination, especially for tests that check env-driven configuration. The inner `sessionAgentToolsSettingsV1 filtering` describe block correctly uses `snapshotEnvValues`/`restoreEnvValues` but the outer block does not.
**Fix:** Add `afterEach` restoration to the outer `describe` block:
```typescript
afterEach(() => {
    process.env = env;
    reloadConfiguration();
});
```

---

### WR-03: Misleading guard in `maybeStartFromHeader` passes empty string header names

**File:** `apps/cli/src/mcp/startHappyServer.ts:207-212`
**Issue:** The guard `if (headerName && headerName !== 'content-type') return;` is intended to filter out all headers except `content-type`. However, because the condition short-circuits on falsy values, a `headerName` of `''` (empty string) is falsy, so the guard does **not** return — the empty-string case falls through to the `text/event-stream` check. This means a call like `res.setHeader('', 'text/event-stream')` would incorrectly start the keepalive. While this cannot happen in practice with a well-behaved HTTP server, the logic is confusing and inconsistent with the stated intent.
**Fix:** Invert the guard to explicitly allowlist `content-type`:
```typescript
const maybeStartFromHeader = (name: unknown, value: unknown) => {
    if (stopped || started) return;
    const headerName = typeof name === 'string' ? name.toLowerCase() : '';
    if (headerName !== 'content-type') return;
    const serialized = Array.isArray(value) ? value.map((v) => String(v)).join(',') : String(value ?? '');
    if (!serialized.includes('text/event-stream')) return;
    startKeepAlive();
};
```

---

## Info

### IN-01: `server.close()` in `stop()` is fire-and-forget — callers cannot await shutdown

**File:** `apps/cli/src/mcp/startHappyServer.ts:144-147`
**Issue:** `stop()` calls `server.close()` synchronously and returns `void`. `server.close()` is asynchronous — it stops accepting new connections but existing connections remain open until they close. Callers that need to know when the server has fully shut down (e.g. integration tests, process exit handlers) cannot await this. In the current test suite `server.stop()` is called in `finally` blocks without awaiting, which is acceptable for tests but could cause port-reuse races in longer-lived scenarios.
**Fix:** Return a Promise and promisify `server.close()`:
```typescript
stop: () => new Promise<void>((resolve, reject) => {
    logger.debug('[happierMCP] Stopping server');
    server.close((err) => err ? reject(err) : resolve());
}),
```

---

### IN-02: Repeated `as any` casts on `Client.close()` in integration tests

**File:** `apps/cli/src/mcp/startHappyServer.integration.test.ts:289, 339, 439, 489, 543, 599, 639`
**Issue:** Every `finally` block calls `await (client as any)?.close?.()`. The double cast through `as any` and optional chaining indicates that `Client` from `@modelcontextprotocol/sdk` does not expose `close()` in its public TypeScript type but the method exists at runtime. This pattern is repeated seven times. If the SDK renames the method, all seven call sites silently become no-ops (the optional chain returns `undefined`) without any type error.
**Fix:** Declare a typed close helper once:
```typescript
async function closeClient(client: Client | null): Promise<void> {
    // SDK type omits close(); cast once here.
    await (client as unknown as { close?: () => Promise<void> })?.close?.();
}
```
Then call `await closeClient(client)` in each `finally`.

---

### IN-03: `z.preprocess` coerces `null` to `{}` even though the reader guards `null` before parsing

**File:** `apps/cli/src/settings/sessionAgentToolsSettings.ts:15-18`
**Issue:** The preprocess function at line 16 converts `null` to `{}` (because `null` is falsy, so `!raw` is true). Meanwhile, `readSessionAgentToolsSettingsV1` already handles `null` with an early return on line 39 before calling `safeParse`. The two layers are consistent in outcome but inconsistent in contract: the schema's own preprocess claims to handle `null` by producing `{}`, while the intended handling for `null` is "return defaults without parsing". This creates a subtle mismatch — if the schema is ever called directly (bypassing the reader), a `null` input produces `{ v: 1, tools: {} }` rather than signalling absence. The doc comment on line 33 says "Absent key → returns DEFAULT_SESSION_AGENT_TOOLS_SETTINGS (silent)", which is correct for the reader function, but the schema itself silently coerces null to a valid object.
**Fix:** Remove `null` from the preprocess coercion if the intent is that `null` is always handled by the caller:
```typescript
export const SessionAgentToolsSettingsV1Schema = z.preprocess(
    (raw) => {
        if (typeof raw !== 'object' || Array.isArray(raw) || raw === null) return {};
        return raw;
    },
    z.object({
        v: z.literal(1).default(1 as const),
        tools: z.record(z.string(), z.object({ enabled: z.boolean() })).default({}),
    }),
);
```
(This preserves the existing behavior but makes the `null` path explicit — it still produces `{}`, which Zod then populates with defaults, yielding the same `{ v: 1, tools: {} }`. The change is documentation-clarity only; no runtime difference.)

---

_Reviewed: 2026-04-19T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
