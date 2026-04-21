---
phase: quick
plan: 260420-bpn
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/cli/src/backends/claude/claudeRemoteLauncher.ts
  - apps/cli/src/backends/claude/remote/claudeRemoteAgentSdk.ts
autonomous: true
requirements: []

must_haves:
  truths:
    - "thamw-turn-fix commits are present in thamw-dev history"
    - "Working tree is clean after merge"
    - "No merge conflicts exist"
  artifacts:
    - path: "apps/cli/src/backends/claude/claudeRemoteLauncher.ts"
      provides: "Updated launcher with turn-fix changes"
    - path: "apps/cli/src/backends/claude/remote/claudeRemoteAgentSdk.ts"
      provides: "Updated SDK with turn-fix changes and new tests"
  key_links:
    - from: "thamw-turn-fix"
      to: "thamw-dev"
      via: "git merge --no-ff"
      pattern: "merge commit in git log"
---

<objective>
Merge branch thamw-turn-fix into the current branch thamw-dev.

Purpose: Bring turn-completion fixes and the associated test suite (claudeRemoteAgentSdk baseline + subagent turn completion tests) into the main development branch.
Output: A merge commit on thamw-dev containing all 42 changed files from thamw-turn-fix, with no conflicts.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md

Pre-analysis confirmed:
- Merge base (last common commit): 5da31d3cd — same as HEAD of thamw-dev
- Dry-run result: "Automatic merge went well; stopped before committing as requested" — zero conflicts
- 42 files changed total: .planning/ docs, claudeRemoteLauncher.ts (10 lines), claudeRemoteAgentSdk.ts (27 lines), two new test files
</context>

<tasks>

<task type="auto">
  <name>Task 1: Merge thamw-turn-fix into thamw-dev</name>
  <files>
    apps/cli/src/backends/claude/claudeRemoteLauncher.ts
    apps/cli/src/backends/claude/remote/claudeRemoteAgentSdk.ts
  </files>
  <action>
Run the merge from the thamw-dev branch:

  git merge thamw-turn-fix --no-ff -m "merge(thamw-turn-fix): bring turn-completion fixes and SDK tests into thamw-dev"

The dry-run confirmed zero conflicts. The merge introduces:
- claudeRemoteLauncher.ts: 10-line change (turn-fix logic)
- claudeRemoteAgentSdk.ts: 27-line change (turn-fix logic)
- Two new test files: baseline and subagent turn completion tests
- .planning/ doc artifacts from the fix branch

After the merge completes, verify the working tree is clean and the merge commit appears in git log.
  </action>
  <verify>
    <automated>git log --oneline -5 && git status</automated>
  </verify>
  <done>
- git log shows the merge commit at HEAD referencing thamw-turn-fix
- git status reports "nothing to commit, working tree clean"
- apps/cli/src/backends/claude/remote/claudeRemoteAgentSdk.ts contains turn-fix changes
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| local git repo | Merge only touches local history; no remote push in this plan |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-bpn-01 | Tampering | git merge | accept | Dry-run confirmed zero conflicts; merge is deterministic at this commit pair |
</threat_model>

<verification>
After the merge task completes:

1. `git log --oneline -5` — top commit is the merge commit referencing thamw-turn-fix
2. `git status` — working tree clean
3. `git diff thamw-turn-fix thamw-dev` — empty (branches are identical post-merge)
</verification>

<success_criteria>
- Merge commit exists on thamw-dev with thamw-turn-fix as a parent
- Working tree is clean (no uncommitted changes, no conflicts)
- Both modified source files reflect turn-fix changes
</success_criteria>

<output>
After completion, create `.planning/quick/260420-bpn-merge-thamw-turn-fix-into-current-branch/260420-bpn-SUMMARY.md`
</output>
