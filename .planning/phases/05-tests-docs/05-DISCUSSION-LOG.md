# Phase 5: Tests & Docs - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-22
**Phase:** 05-tests-docs
**Areas discussed:** Test scope, Docs stale content, Docs example format

---

## Test scope

| Option | Description | Selected |
|--------|-------------|----------|
| Just run + verify they pass | Confirm existing 4 tests pass with vitest — no new test code needed | |
| Add new test block | Add a new describe block explicitly labelled for the 3-level lookup scenarios | ✓ |
| You decide | Leave test structure to the planner | |

**User's choice:** Add new test block

| Option | Description | Selected |
|--------|-------------|----------|
| Inside existing describe block | Add a nested describe inside buildIsSessionAgentToolEnabled | |
| Top-level describe block | New top-level describe block separate from existing tests | ✓ |

**User's choice:** Top-level describe block

**Notes:** The existing Phase 4 tests already cover the scenarios; the new top-level block is additive for traceability purposes.

---

## Docs: stale content

| Option | Description | Selected |
|--------|-------------|----------|
| Fix everything stale | Update predicate formula, function name, and add opt-in example | ✓ |
| DOCS-01 only | Add only the default: false opt-in example, leave stale content as-is | |

**User's choice:** Fix everything stale (predicate formula, function name, schema table, opt-in example)

---

## Docs: example format

| Option | Description | Selected |
|--------|-------------|----------|
| Prose + code block | Short paragraph explaining opt-in mode + copy-pasteable JSON | ✓ |
| Code block only | Just the JSON snippet, no surrounding explanation | |

**User's choice:** Prose + code block

| Option | Description | Selected |
|--------|-------------|----------|
| New Example E after existing examples | After Example D (disable all tools) | ✓ |
| New section: Global default | Separate dedicated section | |

**User's choice:** New Example E after existing examples

---

## Claude's Discretion

- Exact prose wording for Example E explanation paragraph
- Whether to include a `default: true` snippet alongside `default: false` in Example E

## Deferred Ideas

None.
