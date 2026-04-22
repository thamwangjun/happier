# Roadmap: Happier (Fork)

## Milestones

- ✅ **v1.0 MCP Tool Configuration** — Phases 1-3 (shipped 2026-04-19)
- 🚧 **v1.1 Session Agent Tools — Global Default** — Phases 4-5 (in progress)

## Phases

<details>
<summary>✅ v1.0 MCP Tool Configuration (Phases 1-3) — SHIPPED 2026-04-19</summary>

- [x] Phase 1: Schema & Reader (1/1 plans) — completed 2026-04-19
- [x] Phase 2: Startup Wiring & Tool Filtering (3/3 plans) — completed 2026-04-19
- [x] Phase 3: Validation Feedback (1/1 plan) — completed 2026-04-19

</details>

### 🚧 v1.1 Session Agent Tools — Global Default (In Progress)

**Milestone Goal:** Add a `default?: boolean` field to `sessionAgentToolsSettingsV1` so developers can set a baseline enabled/disabled state for all tools not individually configured.

- [x] **Phase 4: Schema & Predicate** - Extend the settings schema and predicate to support a global default field — completed 2026-04-22
- [ ] **Phase 5: Tests & Docs** - Verify all lookup scenarios with unit tests and document the opt-in pattern

## Phase Details

### Phase 4: Schema & Predicate
**Goal**: Users can set a global `default` boolean in their settings file and the daemon correctly applies it as the fallback for any tool not individually configured
**Depends on**: Phase 3 (v1.0 complete)
**Requirements**: SCHEMA-01, SCHEMA-02, SCHEMA-03, SCHEMA-04, VALID-01
**Plans**: 1 plan

Plans:
- [x] 04-01-PLAN.md — Extend schema with default?: boolean and update predicate to 3-level lookup (per-tool → default → true)

**Success Criteria** (what must be TRUE):
  1. A settings file with `default: false` causes all tools without a per-tool entry to be disabled (opt-in mode is active)
  2. A settings file with `default: true` causes all tools without a per-tool entry to be enabled (explicit opt-out model unchanged in behavior)
  3. A settings file without `default` behaves identically to before the change — no behavior change for existing users
  4. A per-tool entry `enabled: true` takes effect even when `default: false` is set (per-tool always wins over the global default)
  5. Corrupt or missing `default` field does not crash the daemon at startup — the no-throw reader handles it gracefully

### Phase 5: Tests & Docs
**Goal**: The predicate's lookup order is verified by passing unit tests across all three scenarios, and users can read a worked example of the `default: false` opt-in pattern in the docs
**Depends on**: Phase 4
**Requirements**: TEST-01, TEST-02, TEST-03, TEST-04, DOCS-01
**Plans**: 1 plan

Plans:
- [ ] 05-01-PLAN.md — Add 3-level lookup describe block (TEST-01..04) and update docs/mcp-tool-filtering.md (Example E + stale Part 2 fixes)

**Success Criteria** (what must be TRUE):
  1. All four predicate unit tests pass: backward-compat (no default key), default-false disables unset tools, per-tool enabled:true overrides default:false, per-tool enabled:false overrides default:true
  2. `docs/mcp-tool-filtering.md` contains a `default: false` example configuration with per-tool overrides that a user can copy directly into their settings file

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Schema & Reader | v1.0 | 1/1 | Complete | 2026-04-19 |
| 2. Startup Wiring & Tool Filtering | v1.0 | 3/3 | Complete | 2026-04-19 |
| 3. Validation Feedback | v1.0 | 1/1 | Complete | 2026-04-19 |
| 4. Schema & Predicate | v1.1 | 1/1 | Complete | 2026-04-22 |
| 5. Tests & Docs | v1.1 | 0/1 | Not started | - |
