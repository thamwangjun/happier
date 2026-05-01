---
id: 260501-hv4
slug: add-regression-tests-for-happymcpstdiobr
title: Add regression tests for happyMcpStdioBridge tool filter (settings vs env var)
date: "2026-05-01"
status: in-progress
---

# Quick Task: Regression tests for STDIO bridge tool filter

## Goal

Write `apps/cli/src/backends/codex/happyMcpStdioBridge.toolFilter.test.ts` — tests that
FAIL against the old env-var code (commit 65df8a468) and PASS with the current fix (commit
b3fd28577).

## Background

The fix replaced env-var tool filtering in `happyMcpStdioBridge.ts`:

**Old (broken):** read `HAPPIER_ENABLED_SESSION_AGENT_TOOLS` env var — empty string fell
through `trim() !== ''` guard → `isToolEnabled = undefined` → all tools shown.

**New (fixed):** call `readSettings()` → `readSessionAgentToolsSettings()` →
`buildIsSessionAgentToolEnabled()` — always produces a function; honors `default: false`.

## Plan

### Task 1: Write happyMcpStdioBridge.toolFilter.test.ts

**File:** `apps/cli/src/backends/codex/happyMcpStdioBridge.toolFilter.test.ts`

**Approach:**
- `vi.resetModules()` in `beforeEach` so each test gets a fresh module import
- Mock `@/persistence` → control `readSettings` return value
- Mock `./registerHappierMcpBridgeTools` → capture `isToolEnabled` argument the bridge passes
- Mock MCP SDK modules so `main()` can complete without a real server
- Set `process.env.HAPPIER_HTTP_MCP_URL` to bypass the URL exit guard
- Use `vi.waitUntil` to wait for the async `main()` to call the mock

**Test cases:**

| ID | Settings | Expected |
|----|----------|----------|
| BRIDGE-01 | `change_title: { enabled: false }` | `isToolEnabled('change_title') === false` |
| BRIDGE-02 | `default: false` (all-disabled edge case) | all tools return false |
| BRIDGE-03 | no `sessionAgentToolsSettings` | all tools return true (backward compat) |

Also assert `readSettings` was called in each test (old code never calls it → assertion fails).

**Why tests fail without fix:**
- Old code: `isToolEnabled` passed to `registerHappierMcpBridgeTools` is `undefined`
- Tests call `capturedIsToolEnabled('change_title')` → TypeError (not a function) → FAIL
- Also `expect(readSettings).toHaveBeenCalledOnce()` fails because old code never calls it

**After writing, run:**
```
cd apps/cli && yarn vitest run src/backends/codex/happyMcpStdioBridge.toolFilter.test.ts
```

Tests must pass green.
