# State: Happier (Fork)

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-04-18)

**Core value:** Control AI coding agent sessions remotely from any device, with end-to-end encryption.
**Current focus:** v1.0 — MCP Tool Configuration via `~/.happier-dev/settings.json`

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-04-18 — Milestone v1.0 started

## Status

- **Initialization:** ✓ Complete
- **Requirements:** In progress
- **Active phases:** 0

## Accumulated Context

- MCP bridge already has surface-based filtering and `HAPPIER_ACTIONS_SETTINGS_V1` env var mechanism
- `ActionsSettingsV1Schema` from `@happier-dev/protocol` defines the per-action enable/disable shape
- Tools registered in `apps/cli/src/mcp/server/registerHappierMcpBuiltInTools.ts`
- Tool catalog at `apps/cli/src/agent/tools/happierTools/catalog.ts`
- User chose `~/.happier-dev/settings.json` as the config location (user-global, not per-project)

---
*Last updated: 2026-04-18 — Milestone v1.0 started*
