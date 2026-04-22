# Phase 4: Schema & Predicate - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-22
**Phase:** 04-schema-predicate
**Areas discussed:** Field name, Schema version, Opt-in terminology

---

## Field Name

| Option | Description | Selected |
|--------|-------------|----------|
| default | Matches the literal key users write in settings.json | ✓ |
| toolDefault | More explicit, avoids reserved-word concern | |
| fallbackEnabled | Clearly communicates fallback semantics, but verbose | |

**User's choice:** `default`
**Notes:** Valid as a JS/TS object property key; matches what users type in settings.json.

---

## Schema Version

| Option | Description | Selected |
|--------|-------------|----------|
| Keep v: 1 | Backward-compatible — existing files without 'default' continue to work | ✓ |
| Bump to v: 2 | Initially selected, then reversed | |

**User's choice:** Keep `v: 1`
**Notes:** User initially selected "Bump to v: 2" then corrected to retain `v: 1`. Also added: rename all V1 code identifiers (type, schema, functions) to un-versioned form — but preserve the settings.json JSON key `sessionAgentToolsSettingsV1` to avoid breaking existing user configs.

---

## Opt-in Terminology

| Option | Description | Selected |
|--------|-------------|----------|
| opt-in mode | Natural contrast to existing "opt-out model" JSDoc | ✓ |
| allowlist mode | Security-oriented framing | |
| Claude's discretion | Leave to implementer | |

**User's choice:** opt-in mode
**Notes:** Consistent with existing language in the file.

---

## Claude's Discretion

- Test placement: add new tests inside existing describe blocks in the test file.

## Deferred Ideas

None.
