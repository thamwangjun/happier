---
phase: quick-260420-iyc
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - docs/mcp-tool-filtering.md
autonomous: true
requirements:
  - QUICK-260420-iyc
must_haves:
  truths:
    - "docs/mcp-tool-filtering.md contains a new Example D section after Example C"
    - "The new example includes all 38 filterable tool names each set to enabled: false"
    - "The example is preceded by a brief prose sentence explaining the use case"
  artifacts:
    - path: "docs/mcp-tool-filtering.md"
      provides: "Updated user guide with disable-all-tools example"
      contains: "Example D"
  key_links: []
---

<objective>
Add a "disable all tools" example (Example D) to the Examples section of docs/mcp-tool-filtering.md.

Purpose: Give users a ready-to-paste settings.json block that disables every filterable Happier MCP tool — useful for running the agent in a locked-down mode with no Happier tools exposed.
Output: One new subsection added to docs/mcp-tool-filtering.md immediately after Example C.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@docs/mcp-tool-filtering.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add Example D — disable all tools</name>
  <files>docs/mcp-tool-filtering.md</files>
  <action>
Insert the following block into docs/mcp-tool-filtering.md immediately after the closing code fence of Example C (after line 99, before the blank line that leads into "### Error handling").

The new content to insert:

---
#### Example D — Disable all tools

Run the agent with no Happier tools exposed. This is useful for locked-down sessions where you want the agent to rely solely on its built-in capabilities and any tools you provide through other MCP servers:

```json
{
  "sessionAgentToolsSettingsV1": {
    "v": 1,
    "tools": {
      "change_title": { "enabled": false },
      "action_execute": { "enabled": false },
      "execution_run_start": { "enabled": false },
      "action_options_resolve": { "enabled": false },
      "action_spec_get": { "enabled": false },
      "action_spec_search": { "enabled": false },
      "agents_backends_list": { "enabled": false },
      "agents_models_list": { "enabled": false },
      "execution_run_action": { "enabled": false },
      "execution_run_get": { "enabled": false },
      "execution_run_list": { "enabled": false },
      "execution_run_send": { "enabled": false },
      "execution_run_stop": { "enabled": false },
      "execution_run_wait": { "enabled": false },
      "memory_ensure_up_to_date": { "enabled": false },
      "memory_get_window": { "enabled": false },
      "memory_search": { "enabled": false },
      "review_start": { "enabled": false },
      "session_activity_get": { "enabled": false },
      "session_archive": { "enabled": false },
      "session_history_get": { "enabled": false },
      "session_list": { "enabled": false },
      "session_message_send": { "enabled": false },
      "session_messages_recent_get": { "enabled": false },
      "session_model_set": { "enabled": false },
      "session_permission_mode_set": { "enabled": false },
      "session_permission_respond": { "enabled": false },
      "session_spawn_new": { "enabled": false },
      "session_status_get": { "enabled": false },
      "session_stop": { "enabled": false },
      "session_target_primary_set": { "enabled": false },
      "session_target_tracked_set": { "enabled": false },
      "session_title_set": { "enabled": false },
      "session_unarchive": { "enabled": false },
      "session_user_action_answer": { "enabled": false },
      "session_wait_idle": { "enabled": false },
      "subagents_delegate_start": { "enabled": false },
      "subagents_plan_start": { "enabled": false },
      "voice_agent_start": { "enabled": false }
    }
  }
}
```
---

The tool list is sourced directly from the "Tool Name Reference" table in the same file: 3 core tools (change_title, action_execute, execution_run_start) plus all 35 action-backed tools — 38 entries total. Do not add or remove any tool names; use only the names that appear in that table.

Insert exactly one blank line between the closing ``` of Example C and the new `####` heading, and exactly one blank line between the closing ``` of Example D and `### Error handling`.
  </action>
  <verify>
    <automated>grep -c '"enabled": false' /home/thamw/development/happier/happier/docs/mcp-tool-filtering.md</automated>
  </verify>
  <done>
- `docs/mcp-tool-filtering.md` contains an `#### Example D` section after Example C and before the "Error handling" section.
- The JSON block contains exactly 38 entries, every one set to `"enabled": false`.
- `grep -c '"enabled": false' docs/mcp-tool-filtering.md` returns 38.
- The file reads naturally: prose intro line, then the JSON block.
  </done>
</task>

</tasks>

<verification>
grep -c '"enabled": false' /home/thamw/development/happier/happier/docs/mcp-tool-filtering.md
# Expected: 38

grep -n "Example D" /home/thamw/development/happier/happier/docs/mcp-tool-filtering.md
# Expected: one match, line number between the Example C block and "### Error handling"
</verification>

<success_criteria>
- Example D section exists in docs/mcp-tool-filtering.md after Example C.
- All 38 filterable tool names appear in the JSON block, each with `"enabled": false`.
- The existing document structure (Error handling, When does filtering take effect?, Part 2, Tool Name Reference) is undisturbed.
</success_criteria>

<output>
After completion, create `.planning/quick/260420-iyc-add-disable-all-tools-example-to-docs-mc/260420-iyc-01-SUMMARY.md`
</output>
