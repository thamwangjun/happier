# Codebase Concerns

**Analysis Date:** 2026-04-18

## Tech Debt

**AcpBackend.ts — Pervasive `as any` Type Escape Hatches:**
- Issue: `apps/cli/src/agent/acp/AcpBackend.ts` contains 20+ `as any` casts to extract fields from external ACP SDK responses (e.g., `(update as any).currentModelId`, `(update as any).used`, `(update as any).cache_read_input_tokens`). These represent untyped integration points with the `@agentclientprotocol/sdk` where the SDK's TypeScript types do not expose all fields the runtime emits.
- Files: `apps/cli/src/agent/acp/AcpBackend.ts` (lines 296–1778)
- Impact: Any field rename or structural change in the ACP SDK will fail silently at runtime rather than at compile time. New fields are easily missed.
- Fix approach: Model the missing fields with discriminated union types; submit types upstream or maintain a local type-extension file alongside the import.

**Codebase-wide `as any` Usage (1,296 instances in non-test source):**
- Issue: 1,296 `as any` casts across non-test CLI source files. Files include `apps/cli/src/agent/acp/bridge/acpCommonHandlers.ts`, `apps/cli/src/agent/acp/bridge/createAcpAgentMessageForwarder.ts`, `apps/cli/src/mcp/startHappyServer.ts`, `apps/cli/src/daemon/controlServer.ts`, `packages/protocol/src/account/settings/accountSettings.ts`.
- Impact: Compiler cannot catch type regressions. The project's stated preference for "no untyped code" (`apps/cli/CLAUDE.md`) is substantially violated.
- Fix approach: Incrementally replace `as any` with proper discriminated unions or Zod-parsed types, starting with the highest-traffic paths (AcpBackend, sessionClient, daemonControlServer).

**`DeferredApiSessionClient` — Intentional Placeholder:**
- Issue: `apps/cli/src/agent/runtime/startup/DeferredApiSessionClient.ts` is explicitly marked as "intentionally introduced with placeholder behavior; it will be fully implemented via TDD in follow-up commits" (line 36–37). The class buffers writes to a deferred session but its flush and overflow handling is incomplete.
- Files: `apps/cli/src/agent/runtime/startup/DeferredApiSessionClient.ts`
- Impact: If the real session never attaches, buffered agent messages may be silently dropped (overflow = true). Error surfacing to users is not verified.
- Fix approach: Complete TDD implementation; add integration test verifying overflow is surfaced to the user.

**`printOfflineWarning` — Deprecated API Still Exported:**
- Issue: `apps/cli/src/api/offline/serverConnectionErrors.ts` line 354 marks `printOfflineWarning()` as `@deprecated` with no remaining callers in non-test source, but the export is still public.
- Files: `apps/cli/src/api/offline/serverConnectionErrors.ts`
- Impact: Future contributors may call the deprecated function rather than `connectionState.fail()`.
- Fix approach: Remove the export; make `connectionState.fail()` the only call site.

**`daemonPost` Return Type is Untyped:**
- Issue: `apps/cli/src/daemon/controlClient.ts` line 167 declares `daemonPost` as returning `Promise<{ error?: string } | any>`. The `| any` union defeats TypeScript's return-type checking for all callers of daemon HTTP endpoints.
- Files: `apps/cli/src/daemon/controlClient.ts`
- Impact: Callers cannot rely on typed response shapes; any field access is unchecked.
- Fix approach: Model a typed response envelope for each daemon endpoint and replace the return type accordingly.

**Settings Lock Uses Polling Busy-Wait:**
- Issue: `apps/cli/src/persistence.ts` (line 412) and `apps/cli/src/settings/accountSettings/accountSettingsCache.ts` (line 78) use a `while (attempts < MAX_LOCK_ATTEMPTS)` polling loop (100ms interval, up to 50 attempts = 5 seconds) to acquire a file-based advisory lock via `O_CREAT | O_EXCL`.
- Files: `apps/cli/src/persistence.ts`, `apps/cli/src/settings/accountSettings/accountSettingsCache.ts`
- Impact: Under contention the lock waiter burns CPU polling; on slow filesystems (NFS, network drives) lock acquisition may starve other processes silently.
- Fix approach: Introduce exponential backoff; consider using `proper-lockfile` or the Node.js `fs.watch` event to yield rather than poll.

## Known Bugs

**Caffeinate Spawned Per-Session AND by Daemon — Potential Runaway:**
- Symptoms: Multiple `caffeinate` processes can accumulate when both `apps/cli/src/daemon/startDaemon.ts` (line 269) and `apps/cli/src/backends/claude/runClaude.ts` (line 543) each call `startCaffeinate()`. If the per-session process exits abnormally without triggering cleanup, the caffeinate child continues.
- Files: `apps/cli/src/integrations/caffeinate.ts`, `apps/cli/src/daemon/startDaemon.ts`, `apps/cli/src/backends/claude/runClaude.ts`
- Trigger: Daemon-spawned sessions each call `startCaffeinate()` independently; the daemon also holds its own caffeinate. Abnormal termination of a session process may leave multiple caffeinate processes alive.
- Workaround: The daemon's CLAUDE.md explicitly documents this as a known issue. Manual `killall caffeinate` can clean up.

**Daemon `daemon.state.json` Hard-Deleted on Shutdown:**
- Symptoms: When the daemon exits or is stopped, `apps/cli/src/persistence.ts` (line 753) hard-deletes `daemon.state.json`. Post-shutdown, `happier daemon status` reports "daemon was never started" instead of "daemon stopped at X".
- Files: `apps/cli/src/daemon/startDaemon.ts`, `apps/cli/src/persistence.ts`
- Trigger: Any daemon stop or crash.
- Workaround: The daemon CLAUDE.md documents the desired fix: keep the file with a `state` and `stateReason` field. The fix has not been applied.

**Children PIDs Lost on Daemon Restart:**
- Symptoms: When the daemon restarts (e.g., auto-update), tracked child session PIDs are lost. Orphaned session processes cannot be recovered.
- Files: `apps/cli/src/daemon/startDaemon.ts`
- Trigger: Daemon version-mismatch auto-update cycle.
- Workaround: `happier doctor clean` to kill orphans. Documented in daemon CLAUDE.md as a known gap.

## Security Considerations

**Daemon HTTP Control Port — Only Partially Protected:**
- Risk: The daemon HTTP server listens on `127.0.0.1` (loopback only, good) but any local process that reads `daemon.state.json` can obtain the `controlToken` and port. If `controlToken` is absent (older daemon versions), all requests are accepted without auth.
- Files: `apps/cli/src/daemon/controlServer.ts`, `apps/cli/src/daemon/controlClient.ts`
- Current mitigation: `timingSafeEqual` comparison for the token (line 18–21 of `controlServer.ts`); loopback-only binding; optional token checked when present.
- Recommendations: Make the `controlToken` mandatory; remove the optional code path where no token is required (line 190 in `controlClient.ts`). The daemon CLAUDE.md mentions encrypting the payload as a future hardening step.

**`.env.dev`, `.env.dev-local-server`, `.env.integration-test` Present in Repo:**
- Risk: `apps/cli/.env.dev`, `apps/cli/.env.dev-local-server`, `apps/cli/.env.integration-test` are present. These may contain API keys or credentials if not templated.
- Files: `apps/cli/.env.dev`, `apps/cli/.env.dev-local-server`, `apps/cli/.env.integration-test`
- Current mitigation: Not inspected (forbidden by policy). Verify contents do not include live credentials; if they do, rotate and move to secrets manager.

**`claudeLocal.ts` PTY Interactive Mode — Broad Environment Passthrough:**
- Risk: `apps/cli/src/backends/claude/claudeLocal.ts` spawns Claude in an interactive PTY that inherits the full parent environment. Sensitive environment variables (tokens, keys) accessible to the CLI process are passed into the Claude subprocess without filtering.
- Files: `apps/cli/src/backends/claude/claudeLocal.ts`
- Current mitigation: Remote mode (`claudeRemoteAgentSdk.ts` lines 478–497) implements an explicit allowlist for env vars before spawning the subprocess.
- Recommendations: Apply the same allowlist approach to local PTY spawning, or document that local mode inherits the full environment by design.

## Performance Bottlenecks

**Settings File Lock — Up to 5 Seconds per Concurrent Access:**
- Problem: Each settings write holds an exclusive `O_EXCL` advisory lock with a 100ms polling interval and 50 retries. Under concurrent multi-session writes, any waiter can block for up to 5 seconds.
- Files: `apps/cli/src/persistence.ts` (line 402–437)
- Cause: Polling rather than event-driven lock acquisition; no exponential backoff.
- Improvement path: Use `fs.watch` to be notified when the lock file is deleted; add exponential backoff.

**Protocol Package `actionSpecs.ts` at 2,475 Lines:**
- Problem: `packages/protocol/src/actions/actionSpecs.ts` is a single 2,475-line file enumerating all action specifications. As the action catalog grows, this file becomes a merge conflict hotspot.
- Files: `packages/protocol/src/actions/actionSpecs.ts`
- Cause: Single-file action catalog design.
- Improvement path: Split into per-domain spec files (e.g., `actionSpecs.session.ts`, `actionSpecs.scm.ts`) and re-export from a barrel.

**`scenarioCatalog.ts` at 2,850 Lines:**
- Problem: `packages/tests/src/testkit/providers/scenarios/scenarioCatalog.ts` is 2,850 lines — the largest file in the repository. Test suite startup time and IDE performance are affected.
- Files: `packages/tests/src/testkit/providers/scenarios/scenarioCatalog.ts`
- Cause: All test scenarios colocated.
- Improvement path: Split into per-feature scenario modules and aggregate in a single barrel file.

## Fragile Areas

**`AcpBackend.ts` — 2,753-Line God File:**
- Files: `apps/cli/src/agent/acp/AcpBackend.ts`
- Why fragile: A 2,753-line class handles ACP SDK lifecycle, message parsing, tool call extraction, token usage tracking, stream management, permission bridging, and process supervision. Any change touches a large blast radius.
- Safe modification: Read the entire file before editing; trace each public method call chain. There are race condition comments at lines 2304, 2329, 2553, 2650 that describe delicate ordering requirements.
- Test coverage: `apps/cli/src/agent/acp/__tests__/` and `apps/cli/src/agent/acp/bridge/__tests__/` provide partial coverage; the prompt dispatch path (lines 2200–2450) lacks fine-grained unit tests.

**`startDaemon.ts` — 1,878-Line Daemon Lifecycle File:**
- Files: `apps/cli/src/daemon/startDaemon.ts`
- Why fragile: Manages daemon startup, machine registration, session tracking, heartbeat, auto-update, and shutdown in a single file. The shutdown path (lines 1288, 1519) has critical retry-loop dependencies on environment-variable-controlled max attempts.
- Safe modification: Any change to the heartbeat interval affects the version-mismatch auto-update timing and integration tests. The CLAUDE.md documents known gaps (caffeinate not tracked, PID loss on restart) that are load-bearing constraints.
- Test coverage: No dedicated unit tests found for `startDaemon.ts` itself; covered only by integration e2e tests.

**`rpcHandlers.sessionHandoff.ts` — 2,882 Lines:**
- Files: `apps/cli/src/api/machine/rpcHandlers.sessionHandoff.ts`
- Why fragile: The largest non-test source file handles the full session handoff protocol (direct peer and server-routed paths). Complex async state machines with race-condition comments throughout.
- Safe modification: Changes require reading the corresponding `rpcHandlers.sessionHandoff.test.ts` (6,881 lines) first to understand expected state transitions.

**File-Lock-Based Locking (Not Process-Crash-Safe on Windows):**
- Files: `apps/cli/src/workspaces/replication/state/workspaceReplicationFileLease.ts`, `apps/cli/src/workspaces/replication/state/workspaceReplicationJobLease.ts`, `apps/cli/src/workspaces/replication/state/workspaceReplicationScopeLease.ts`
- Why fragile: Lock files are created with `O_EXCL` and must be explicitly deleted on process exit. Each file handles `EEXIST | ENOTEMPTY | EPERM` retries for cross-platform compatibility (Windows surfaces `EPERM` for directory renames into existing dirs). Process crash without cleanup leaves stale locks requiring manual removal.
- Safe modification: Any replication flow change must verify the lock cleanup path is called on both normal and error exits.

## Scaling Limits

**Interactive Mode PTY Path — Single Global `claudeProcess`:**
- Current capacity: `apps/cli/src/backends/claude/claudeLocal.ts` manages one PTY child process at a time via module-level state. Multiple concurrent interactive sessions from the same daemon would conflict.
- Limit: One interactive PTY session per CLI process instance.
- Scaling path: Not currently a bottleneck (interactive sessions are user-terminal-bound), but becomes relevant if the daemon spawns multiple local sessions.

**Daemon HTTP Control Server — Unauthenticated `/session-started` Webhook:**
- Current capacity: Any local process on the machine that knows the daemon port can POST to `/session-started` and inject fake sessions into the daemon's tracked session map.
- Limit: Loopback-only binding provides OS-level isolation but no application-level auth on the webhook endpoint.
- Scaling path: Apply the `controlToken` preHandler (already used on other routes) to `/session-started`.

## Dependencies at Risk

**`@agentclientprotocol/sdk` — Opaque Type Surface:**
- Risk: The SDK does not fully type its runtime event payloads (evidenced by the 20+ `as any` casts required in `AcpBackend.ts`). Version upgrades may silently change field names or shapes.
- Impact: `apps/cli/src/agent/acp/AcpBackend.ts` — any ACP SDK upgrade requires manual audit of all `as any` field accesses.
- Migration plan: Pin the SDK version explicitly; build a typed adapter layer that absorbs ACP changes in one place rather than spreading casts through the backend.

**`node-pty` / PTY Dependencies — Windows Support Limited:**
- Risk: PTY-based interactive mode relies on platform-specific binary modules. The codebase has extensive `process.platform === 'win32'` branches throughout `apps/cli/src/backends/claude/`, suggesting Windows compatibility is actively maintained but fragile.
- Impact: Any OS update or Node version bump may require rebuilding native PTY modules.

## Missing Critical Features

**Permission Checking in MCP Bridge — Not Implemented:**
- Problem: The CLAUDE.md for `apps/cli/src/backends/claude/` documents: "Permission intercepting via MCP [Permission checking not implemented yet]". The MCP permission server (`apps/cli/src/backends/claude/mcp/`) intercepts tool permission requests but does not enforce policy decisions from the mobile app in all code paths.
- Blocks: Full remote session security model where the mobile user can deny specific tool calls from a remote agent.

**`DeferredApiSessionClient` Not Fully Implemented:**
- Problem: `apps/cli/src/agent/runtime/startup/DeferredApiSessionClient.ts` is explicitly marked as a placeholder pending TDD implementation.
- Blocks: Reliable buffering of agent messages during the startup handoff window; overflow scenarios are untested end-to-end.

**Daemon State File Not Preserved After Shutdown:**
- Problem: `daemon.state.json` is deleted on daemon exit, losing shutdown reason, exit time, and child PID information. The daemon CLAUDE.md specifies a desired `state` + `stateReason` field design that has not been implemented.
- Blocks: Post-mortem debugging of daemon crashes; `happier doctor` cannot distinguish a crashed daemon from one that was never started.

## Test Coverage Gaps

**`startDaemon.ts` — No Direct Unit Tests:**
- What's not tested: Startup sequence ordering, machine registration retry logic, caffeinate lifecycle, session re-attach on restart.
- Files: `apps/cli/src/daemon/startDaemon.ts`
- Risk: Regressions in daemon startup sequencing will only be caught by slow e2e tests.
- Priority: High

**53% of CLI Source Files Have No Matching Test File:**
- What's not tested: 899 of 1,691 non-test `.ts` files have no colocated `*.test.ts` counterpart. Many utility, configuration, and integration wrapper files are entirely uncovered by unit tests.
- Files: Various under `apps/cli/src/integrations/`, `apps/cli/src/utils/`, `apps/cli/src/cli/commands/`
- Risk: Silent regressions in helper code discovered only via e2e suite, which is slow to run.
- Priority: Medium

**`AcpBackend.ts` Prompt Dispatch Path — Insufficient Unit Tests:**
- What's not tested: The prompt response / first-update race handling (lines 2200–2450 in `apps/cli/src/agent/acp/AcpBackend.ts`).
- Files: `apps/cli/src/agent/acp/AcpBackend.ts`
- Risk: Race conditions between prompt ACK and first assistant update may produce incorrect state silently.
- Priority: High

---

*Concerns audit: 2026-04-18*
