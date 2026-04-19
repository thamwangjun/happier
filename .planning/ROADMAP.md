# Roadmap: Happier — v1.0 MCP Tool Configuration

## Overview

This milestone adds per-tool enable/disable configuration for the Happier MCP bridge. A developer hand-edits `~/.happier-dev/settings.json` to suppress specific MCP tools; the CLI reads that config once at startup and registers only the allowed tools. Three phases: define the schema and reader, wire it into startup and tool registration, then add validation feedback for unknown tool names.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Schema & Reader** - Define the settings schema and implement the file reader
- [ ] **Phase 2: Startup Wiring & Tool Filtering** - Read settings at startup and apply the tool filter during registration
- [ ] **Phase 3: Validation Feedback** - Warn on unknown tool names at startup

## Phase Details

### Phase 1: Schema & Reader
**Goal**: The `mcpToolsSettingsV1` settings shape is defined and readable from disk
**Depends on**: Nothing (first phase)
**Requirements**: SCHEMA-01, SCHEMA-02
**Plans**: 1 plan
**Success Criteria** (what must be TRUE):
  1. A developer can write `{ "mcpToolsSettingsV1": { "v": 1, "tools": { "change_title": { "enabled": false } } } }` in `~/.happier-dev/settings.json` and the reader parses it without error
  2. A tool name absent from the `tools` map is treated as enabled (opt-out, not opt-in) — removing a key re-enables the tool without further edits
  3. The schema rejects a blob that fails validation and returns a typed null/fallback rather than throwing

Plans:
- [ ] 01-01-PLAN.md — Define McpToolsSettingsV1Schema, reader function, and extend Settings interface

### Phase 2: Startup Wiring & Tool Filtering
**Goal**: MCP server startup reads the config once and only registers tools the developer has left enabled
**Depends on**: Phase 1
**Requirements**: STARTUP-01, STARTUP-02, STARTUP-03, TOOLS-01
**Plans**: TBD
**Success Criteria** (what must be TRUE):
  1. After editing `settings.json` to disable a tool, restarting the daemon causes that tool to disappear from the MCP tool list (verified via any MCP client or inspector)
  2. A developer with no `settings.json` (or no `mcpToolsSettingsV1` key) sees all tools available — no behavior change from pre-feature state
  3. A developer with a corrupt or schema-invalid `mcpToolsSettingsV1` value sees all tools available and finds a warning in the daemon log; the daemon does not crash
  4. Tool visibility is determined once at startup, not re-evaluated per MCP request

### Phase 3: Validation Feedback
**Goal**: The startup log tells developers which tool names in their config are unrecognized, preventing silent misconfiguration
**Depends on**: Phase 2
**Requirements**: TOOLS-02, VALID-01
**Plans**: TBD
**Success Criteria** (what must be TRUE):
  1. A developer who misspells a tool name (e.g., `change-title` instead of `change_title`) sees a `warn`-level log entry at startup identifying the unrecognized name
  2. A config containing only valid tool names produces no warning log entries related to unknown names
  3. Unknown tool names do not prevent startup or alter the behavior of correctly-named entries

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Schema & Reader | 0/1 | Not started | - |
| 2. Startup Wiring & Tool Filtering | 0/TBD | Not started | - |
| 3. Validation Feedback | 0/TBD | Not started | - |
