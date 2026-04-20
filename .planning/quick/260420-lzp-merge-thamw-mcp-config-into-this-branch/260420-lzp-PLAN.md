---
id: 260420-lzp
slug: merge-thamw-mcp-config-into-this-branch
description: Merge thamw-mcp-config into this branch
date: 2026-04-20
status: planned
---

# Quick Task 260420-lzp: Merge thamw-mcp-config into this branch

## Task

Merge branch `thamw-mcp-config` into `thamw-dev`. Two conflicts require manual resolution.

## Conflict Analysis

### docs/mcp-tool-filtering.md
Both branches modified Example D independently. `thamw-mcp-config` is authoritative — it:
- Removes invalid tool names (`session_spawn_new`, `session_target_primary_set`, `session_target_tracked_set`) that were removed from the protocol
- Fixes Example B (replaces `session_spawn_new` with `review_start`)
- Reorders Example D entries to a more logical grouping

Resolution: take `thamw-mcp-config`'s version.

### .planning/STATE.md
`thamw-dev` has more up-to-date milestone metadata (v1.1 complete, 100%).
`thamw-mcp-config` has two additional quick task rows (260420-iyc, 260420-luh).

Resolution: keep `thamw-dev`'s metadata, add the two new quick task rows.

## Tasks

### Task 1: Run merge and resolve docs/mcp-tool-filtering.md
- Action: `git merge thamw-mcp-config`, then `git checkout --theirs docs/mcp-tool-filtering.md`
- Files: `docs/mcp-tool-filtering.md`
- Verify: file matches thamw-mcp-config version, no conflict markers

### Task 2: Resolve .planning/STATE.md
- Action: Keep thamw-dev's metadata, add 260420-iyc and 260420-luh rows to Quick Tasks table
- Files: `.planning/STATE.md`
- Verify: STATE.md has v1.1 complete metadata AND both new quick task rows

### Task 3: Complete merge commit
- Action: `git add` resolved files, `git merge --continue`
- Verify: clean working tree, merge commit in log
