---
phase: quick-260501-kqj
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: []
autonomous: true
requirements: [QUICK-260501-kqj]
must_haves:
  truths:
    - "All 25 listed worktree-agent-* branches are deleted locally"
    - "Any of those branches that existed on origin are deleted from origin"
    - "No other branches are affected"
  artifacts: []
  key_links: []
---

<objective>
Delete all 25 listed worktree-agent-* branches both locally and from the remote (origin) if they exist there.

Purpose: Clean up stale GSD worktree agent branches that are no longer needed.
Output: Branches removed; git branch list contains no worktree-agent-* entries.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Delete all listed worktree-agent-* branches locally and from origin</name>
  <files>N/A — git operation only, no code files modified</files>
  <action>
Run the following steps in order:

1. Check which of the listed branches exist locally:
```
git branch | grep 'worktree-agent-'
```

2. Delete all listed branches locally (force-delete with -D to avoid "not fully merged" errors, since these are throwaway agent branches):
```
git branch -D \
  worktree-agent-a036f43c \
  worktree-agent-a06119e6 \
  worktree-agent-a0646808 \
  worktree-agent-a1eda632 \
  worktree-agent-a289b71a \
  worktree-agent-a2cef011 \
  worktree-agent-a34f84f9 \
  worktree-agent-a3e369b1 \
  worktree-agent-a4c0fe0b \
  worktree-agent-a6c8f07f \
  worktree-agent-a82fae56 \
  worktree-agent-a8967a63 \
  worktree-agent-a8e2d324 \
  worktree-agent-a9185aa6 \
  worktree-agent-aa00c061 \
  worktree-agent-ab96bd79 \
  worktree-agent-abb86c08 \
  worktree-agent-ad281c9f \
  worktree-agent-ad9bfd85 \
  worktree-agent-adf51840 \
  worktree-agent-ae355698 \
  worktree-agent-af498114 \
  worktree-agent-af4dbf3a \
  worktree-agent-afd32287 \
  worktree-agent-afeae8634545c7420
```
Branches that don't exist locally will produce a "not found" error — that is safe to ignore.

3. Check which of the listed branches exist on origin:
```
git ls-remote --heads origin 'refs/heads/worktree-agent-*'
```

4. For each branch that exists on origin, delete it:
```
git push origin --delete \
  worktree-agent-a036f43c \
  worktree-agent-a06119e6 \
  worktree-agent-a0646808 \
  worktree-agent-a1eda632 \
  worktree-agent-a289b71a \
  worktree-agent-a2cef011 \
  worktree-agent-a34f84f9 \
  worktree-agent-a3e369b1 \
  worktree-agent-a4c0fe0b \
  worktree-agent-a6c8f07f \
  worktree-agent-a82fae56 \
  worktree-agent-a8967a63 \
  worktree-agent-a8e2d324 \
  worktree-agent-a9185aa6 \
  worktree-agent-aa00c061 \
  worktree-agent-ab96bd79 \
  worktree-agent-abb86c08 \
  worktree-agent-ad281c9f \
  worktree-agent-ad9bfd85 \
  worktree-agent-adf51840 \
  worktree-agent-ae355698 \
  worktree-agent-af498114 \
  worktree-agent-af4dbf3a \
  worktree-agent-afd32287 \
  worktree-agent-afeae8634545c7420 2>/dev/null || true
```
Branches that don't exist on origin will be silently skipped.

SAFETY: Only delete branches from the explicit list above. Do NOT use wildcard deletion patterns that could affect other branches.
  </action>
  <verify>
    <automated>git branch | grep 'worktree-agent-' | wc -l</automated>
  </verify>
  <done>
    - `git branch | grep 'worktree-agent-'` returns 0 results (all listed local branches deleted)
    - `git ls-remote --heads origin 'refs/heads/worktree-agent-*'` returns 0 results (all listed remote branches deleted)
    - Current working branch (thamw-dev) and all other non-listed branches are unaffected
  </done>
</task>

</tasks>

<verification>
After task completes:

```bash
# Confirm no worktree-agent-* branches remain locally
git branch | grep 'worktree-agent-'

# Confirm none remain on origin
git ls-remote --heads origin 'refs/heads/worktree-agent-*'
```

Both commands should return empty output.
</verification>

<success_criteria>
- All 25 listed worktree-agent-* branches removed from local repo
- All of those branches that existed on origin removed from origin
- No other branches were deleted
</success_criteria>

<output>
After completion, create `.planning/quick/260501-kqj-remove-all-worktree-agent-branches/260501-kqj-01-SUMMARY.md`
</output>
