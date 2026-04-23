# Android Doze QA Checklist

**Purpose:** Validate the v1.3 resilience behaviors (MOB-05, MOB-06, and Doze socket resurrection) on a physical Android device.

**ADB required:** No — all scenarios use the device UI. ADB simulation commands are included in each scenario for optional automation reference only.

---

## Test Environment

| Field | Value |
|-------|-------|
| Device model | |
| Android OS version | |
| App version / build | |
| Test date | |
| Tester | |

---

## Scenario 1: Background / Ack Flush (MOB-05)

**Behavior under test:** When the app moves to background, pending acks are flushed synchronously before the socket can be killed by Android — `ack-update` arrives at the server while the app is backgrounding.

### Prerequisites
- App is in foreground with an active session
- Server is running with resilience buffer enabled
- Server debug logging is enabled (or Charles Proxy is running)

### Steps

- [ ] 1. Open the app and navigate to an active session
- [ ] 2. Trigger at least 3 messages to arrive (or send 3 messages from CLI)
- [ ] 3. Confirm messages are displayed in the UI
- [ ] 4. Press **Home** to background the app
- [ ] 5. Wait 5 seconds
- [ ] 6. Check server logs for `ack-update` event received from this client

### Pass Criteria

| Check | Expected | Pass/Fail |
|-------|----------|-----------|
| `ack-update` event in server log within 5s of backgrounding | Present | |
| Server buffer cleared up to the last applied `seq` | Buffer entries ≤ last seq removed | |

### ADB Reference (for automation — not required for manual test)

```bash
# Confirm ack-update arrived in server logs after backgrounding:
# (Substitute your server log path)
grep "ack-update" .logs/*.log | tail -5
```

---

## Scenario 2: Foreground / Reconnect (MOB-06)

**Behavior under test:** When the app returns to foreground, the socket disconnects and reconnects regardless of the current `socket.connected` state — a zombie connection is never trusted.

**Critical:** Do NOT verify this by checking `socket.connected === true`. After Doze or extended background time, the socket can appear connected in memory while being dead. Verify that `onReconnected` was called (mobile debug log) and that a new `reconnect-resume` event arrived at the server.

### Prerequisites
- App was backgrounded for at least 30 seconds (long enough for the OS to potentially kill the socket keepalive)
- Server debug logging is enabled

### Steps

- [ ] 1. Background the app (press Home)
- [ ] 2. Wait 30 seconds
- [ ] 3. Return the app to foreground
- [ ] 4. Check mobile debug log for `onReconnected` call
- [ ] 5. Check server logs for a new `reconnect-resume` event from this client after the foreground transition

### Pass Criteria

| Check | Expected | Pass/Fail |
|-------|----------|-----------|
| Mobile log shows `onReconnected` called after foreground resume | Present | |
| New `reconnect-resume` event in server log after foreground time | Present | |
| `reconnect-resume` carries a `lastAckedSeq` value (not null/undefined) | `lastAckedSeq` is a number | |

### ADB Reference (for automation — not required for manual test)

```bash
# Send app to background via ADB:
adb shell input keyevent KEYCODE_HOME

# Wait 30 seconds, then bring app to foreground:
adb shell monkey -p <your.package.name> -c android.intent.category.LAUNCHER 1

# Watch server logs for reconnect-resume:
tail -f .logs/*.log | grep "reconnect-resume"
```

---

## Scenario 3: Doze / Socket Resurrection

**Behavior under test:** After Android Doze mode kills the socket, the client reconnects on Doze exit and emits `reconnect-resume` with the `lastAckedSeq` value persisted to MMKV — the value survives process suspension and matches what the server expects.

### Prerequisites
- App has an active session with at least one acked message (so MMKV has a non-zero `lastAckedSeq`)
- ADB access is available for Doze simulation
- Server debug logging is enabled

### Steps

- [ ] 1. Open the app and confirm an active session with messages
- [ ] 2. Note the current `lastAckedSeq` from mobile debug log before engaging Doze
- [ ] 3. Run ADB command to force Doze: `adb shell dumpsys deviceidle force-idle`
- [ ] 4. Wait 5 minutes (allow OS to kill socket keepalive)
- [ ] 5. Exit Doze: `adb shell dumpsys deviceidle unforce`
- [ ] 6. Bring app to foreground if needed
- [ ] 7. Check server logs for `reconnect-resume` event with `lastAckedSeq` matching the value noted in step 2
- [ ] 8. Confirm `replay-complete` event received after reconnect
- [ ] 9. Confirm no messages are missing from the UI after reconnect

### Pass Criteria

| Check | Expected | Pass/Fail |
|-------|----------|-----------|
| `reconnect-resume` arrives at server after Doze exit | Present | |
| `lastAckedSeq` in `reconnect-resume` matches MMKV-persisted value from step 2 | Values match | |
| `replay-complete` received by client after reconnect | Present in mobile log | |
| No messages missing from UI after reconnect | All messages visible | |
| No duplicate messages visible in UI | Zero duplicates | |

### ADB Reference

```bash
# Force Doze mode (requires USB debugging):
adb shell dumpsys deviceidle force-idle

# Verify device is in Doze:
adb shell dumpsys deviceidle | grep "mState"

# Exit Doze:
adb shell dumpsys deviceidle unforce

# Watch server logs for reconnect-resume with lastAckedSeq:
tail -f .logs/*.log | grep "reconnect-resume"
```

**Note on Doze simulation:** `force-idle` bypasses the normal Doze entry prerequisites (screen off, stationary, unplugged). On real devices in normal use, Doze engages after approximately 1 hour of inactivity. The ADB command lets QA reproduce the condition without waiting.

---

## Results Summary

| Scenario | Pass | Fail | Notes |
|----------|------|------|-------|
| 1: Background / Ack Flush | | | |
| 2: Foreground / Reconnect | | | |
| 3: Doze / Socket Resurrection | | | |

**Overall result:** PASS / FAIL

**Issues found:**
<!-- List any issues, unexpected behaviors, or log anomalies here -->
