# Requirements: Happier — v1.1 Session Agent Tools Global Default

**Defined:** 2026-04-22
**Core Value:** A developer can start an AI coding session on their machine and seamlessly continue, monitor, and approve it from any device — with all data end-to-end encrypted.

## v1.1 Requirements

### Schema Extension

- [ ] **SCHEMA-01**: User can set `default: true` in `sessionAgentToolsSettingsV1` to explicitly enable all tools globally (equivalent to current implicit behavior)
- [ ] **SCHEMA-02**: User can set `default: false` in `sessionAgentToolsSettingsV1` to disable all tools by default, enabling opt-in mode
- [ ] **SCHEMA-03**: When `default` is absent, behavior is identical to existing opt-out model (`enabled: true` for any unconfigured tool)
- [ ] **SCHEMA-04**: Per-tool entry always overrides the global `default` regardless of direction (per-tool wins)

### Validation & Safety

- [ ] **VALID-01**: No-throw reader (`readSessionAgentToolsSettings`) handles the new `default` field gracefully without crashing on corrupt or missing values

### Tests

- [ ] **TEST-01**: Predicate returns `true` when tool has no per-tool entry and `default` is absent (backward compatibility)
- [ ] **TEST-02**: Predicate returns `false` when tool has no per-tool entry and `default: false`
- [ ] **TEST-03**: Predicate returns `true` when tool has `enabled: true` even when `default: false` (per-tool wins)
- [ ] **TEST-04**: Predicate returns `false` when tool has `enabled: false` even when `default: true` (per-tool wins)

### Documentation

- [ ] **DOCS-01**: `docs/mcp-tool-filtering.md` demonstrates `default: false` opt-in pattern with per-tool overrides

## Future Requirements

*(none identified)*

## Out of Scope

| Feature | Reason |
|---------|--------|
| Per-project `.mcp.json` overrides | Deferred from v1.0 — user-global settings first |
| Remote/server-side tool configuration | Server must not know tool state (E2E encrypted) |
| UI for editing settings | Hand-edit only for now |
| Per-backend `default` (different defaults per AI provider) | Not needed; single global default is sufficient for v1.1 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SCHEMA-01 | Phase 4 | Pending |
| SCHEMA-02 | Phase 4 | Pending |
| SCHEMA-03 | Phase 4 | Pending |
| SCHEMA-04 | Phase 4 | Pending |
| VALID-01 | Phase 4 | Pending |
| TEST-01 | Phase 5 | Pending |
| TEST-02 | Phase 5 | Pending |
| TEST-03 | Phase 5 | Pending |
| TEST-04 | Phase 5 | Pending |
| DOCS-01 | Phase 5 | Pending |

**Coverage:**
- v1.1 requirements: 10 total
- Mapped to phases: 10
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-22*
*Last updated: 2026-04-22 — traceability filled in after roadmap creation*
