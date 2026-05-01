---
id: 20260501-fix
slug: fix-stdio-bridge-reads-settings-directly
title: Fix STDIO bridge to read sessionAgentToolsSettings directly
date: "2026-05-01"
status: in-progress
---

# Fix: STDIO bridge reads sessionAgentToolsSettings as source of truth

## Problem

The previous fix (260430-wbf) wired tool filtering via `HAPPIER_ENABLED_SESSION_AGENT_TOOLS`
env var — an empty string (all-disabled case) falls through the `trim() !== ''` guard,
leaving `isToolEnabled` undefined and all tools visible.

The deeper issue: the env var is a derived value, not the source of truth.
`sessionAgentToolsSettings` in `~/.happier/settings.json` is the source of truth.

## Fix

Replace the env var block in `happyMcpStdioBridge.ts` with a direct call to
`readSettings` + `readSessionAgentToolsSettings` + `buildIsSessionAgentToolEnabled`,
exactly as `startHappyServer.ts` does it.

## Files changed

| File | Change |
|------|--------|
| `apps/cli/src/backends/codex/happyMcpStdioBridge.ts` | Replace env var logic with direct settings read |
