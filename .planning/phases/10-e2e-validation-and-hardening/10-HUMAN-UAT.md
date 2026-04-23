---
status: partial
phase: 10-e2e-validation-and-hardening
source: [10-VERIFICATION.md]
started: 2026-04-23T08:17:47Z
updated: 2026-04-23T08:17:47Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Android Doze QA — Physical Device Execution (VALID-04)

expected: All three checklist scenarios pass on a physical Android device — (1) `ack-update` arrives at server within 5s of backgrounding, (2) `onReconnected` fires and new `reconnect-resume` reaches server on foreground return, (3) `reconnect-resume` carries persisted `lastAckedSeq` after Doze exit and `replay-complete` is received
result: [pending]

**Steps to execute:**
- Checklist: `docs/android-doze-qa-checklist.md`
- Scenario 1: Background the app mid-session, verify `ack-update` arrives at server within 5s
- Scenario 2: Background for 30s, return to foreground — verify `onReconnected` fires and new `reconnect-resume` reaches server
- Scenario 3: `adb shell dumpsys deviceidle force-idle`, wait 5min, exit Doze — verify `reconnect-resume` carries persisted `lastAckedSeq` and `replay-complete` is received with no missing messages

## Summary

total: 1
passed: 0
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps
