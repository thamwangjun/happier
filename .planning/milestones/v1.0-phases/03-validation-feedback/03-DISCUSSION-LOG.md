# Phase 3: Validation Feedback - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-19
**Phase:** 03-validation-feedback
**Areas discussed:** Log level, Validation placement, Warning message format

---

## Log level

| Option | Description | Selected |
|--------|-------------|----------|
| warn at startup + debug at processing time | Once at daemon start: warn. At runtime filtering: debug (silent by default). Honors both TOOLS-02 and VALID-01. | ✓ |
| warn at startup only | Single warn at startup; TOOLS-02 'debug-level' intent treated as superseded by VALID-01. | |
| warn at startup, no processing-time log | Startup warn only; no per-use logging at all. | |

**User's choice:** warn at startup + debug at processing time
**Notes:** TOOLS-02 and VALID-01 describe different moments (startup vs runtime filtering), not a contradiction. Startup warn fires once per daemon start; per-use debug is silent in default log setups so config files survive tool renames across versions.

---

## Validation placement

| Option | Description | Selected |
|--------|-------------|----------|
| New export in sessionAgentToolsSettings.ts, known-names injected as param | e.g. findUnknownSessionAgentToolNames(settings, knownNames). Consistent with Phase 2 pattern; unit-testable. | ✓ |
| Inline in startHappyServer.ts | Both ingredients already present there; no new exports. Loses testability and Phase 2 co-location pattern. | |
| New standalone module | Max separation; overkill for a single function. | |

**User's choice:** New export in sessionAgentToolsSettings.ts with known-names injected
**Notes:** Follows the Phase 2 precedent of putting settings-domain logic (buildIsSessionAgentToolEnabled) in the settings module as testable exports. Injecting knownNames keeps the settings module free of listBuiltInHappierTools dependency.

---

## Warning message format

| Option | Description | Selected |
|--------|-------------|----------|
| One aggregated warn listing all unknown names | Single line; consistent with existing warn pattern. | |
| One warn per unknown name | Loop; each line independently grep-able. | |
| Aggregated warn + list valid tool names inline | Single message with both unknown names and the full valid catalog. | ✓ |

**User's choice:** Aggregated warn + list valid tool names inline
**Notes:** Valid names are already available from listBuiltInHappierTools({ surface: 'session_agent' }) in startHappyServer.ts — no extra import needed. Developer can self-correct without opening docs or source.

---

## Claude's Discretion

- Whether `findUnknownSessionAgentToolNames` returns names or emits the warn itself
- Exact warn message wording and array formatting
- Whether processing-time `debug` log (TOOLS-02) is in the same plan or a follow-up

## Deferred Ideas

None.
