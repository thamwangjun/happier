---
id: 20260501-fix
status: complete
date: "2026-05-01"
commit: b3fd28577
---

# Summary

Fixed `sessionAgentToolsSettings` having no effect in the STDIO bridge.

Replaced `HAPPIER_ENABLED_SESSION_AGENT_TOOLS` env var logic with a direct
`readSettings` + `readSessionAgentToolsSettings` + `buildIsSessionAgentToolEnabled`
call — the same pattern used by `startHappyServer`. Type-check passed cleanly.
