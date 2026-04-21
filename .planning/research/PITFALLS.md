# Pitfalls Research: Socket.IO Request Resilience

**Project:** Happier v1.3 Request Resilience
**Domain:** Adding retry/ack/deduplication to an existing Socket.IO system
**Researched:** 2026-04-21
**Confidence:** HIGH (core Socket.IO pitfalls verified against official docs and GitHub issues)

---

## Server-Side Pitfalls

### CRITICAL: Unbounded Per-Client Message Buffer

**What goes wrong:** The server retains unacked messages in memory per connected client with no size cap. A slow or silent mobile client that stays connected but never acks causes the buffer to grow without bound. At 10,000 concurrent sessions with modest message rates, this will OOM a server within hours.

**Why it happens:** The natural implementation stores pending messages in a `Map<socketId, Message[]>` and only evicts on ack. No one wires a size cap during initial implementation because load testing happens later, if at all.

**Consequences:** Server OOM kill; all in-flight sessions disrupted; worst possible failure mode because it silently grows until crash.

**Prevention:**
- Enforce a hard per-client message cap (e.g., 500 messages). When the cap is hit, either drop the oldest unacked message or disconnect the client.
- Set a max retention window (e.g., 10 minutes). Flush any message older than TTL even if not acked.
- Log a warning when per-client buffer exceeds a soft threshold (e.g., 50 messages) so ops can detect runaway clients before the hard limit.

**Detection:** Prometheus gauge `retained_message_buffer_size_by_socket` per client. Alert at 80% of hard cap.

**Confidence:** HIGH — Socket.IO GitHub issues #3477, #2775, #4451 document real in-production memory accumulation patterns. Official docs confirm the default client buffer is unbounded until reconnect.

---

### CRITICAL: TTL Clock Skew Between Retention Buffer and Client Reconnect Window

**What goes wrong:** The retention TTL is set to `maxDisconnectionDuration` (e.g., 5 minutes), but the mobile client's reconnect logic allows reconnecting up to 10 minutes after disconnect (aggressive retry backoff). The server has already evicted the retained messages. The client reconnects, sends its last known offset, and the server cannot find matching retained messages — falling back to a cold resync. The user sees messages re-render or appear out of order.

**Why it happens:** TTL and reconnect timeout are configured independently in different files by different team members. No enforcement that `maxDisconnectionDuration >= client max reconnect window`.

**Consequences:** Users experience apparent message loss or stale state even though no data was actually lost — just the fast-path recovery failed silently, falling through to the cold HTTP catch-up path.

**Prevention:**
- Document a single source of truth for the retention TTL (e.g., `RETENTION_TTL_MS` constant shared between server config and client reconnect config).
- Set `maxDisconnectionDuration` to at least `client_max_reconnect_window * 1.5` to account for server-side clock drift and slow reconnect attempts.
- Emit a metric when `socket.recovered === false` despite reconnect being within expected window — this is the observable signal for TTL mismatch.

**Confidence:** HIGH — Verified against Socket.IO connection state recovery docs and GitHub issue #5282 (long-lived connection recovery failure due to buffer purge).

---

### CRITICAL: Redis Adapter Incompatibility with Connection State Recovery

**What goes wrong:** The standard Redis Pub/Sub adapter (`@socket.io/redis-adapter`) does NOT support connection state recovery. If you enable `connectionStateRecovery` on a server using the Redis Pub/Sub adapter, recovery silently fails for every reconnect — `socket.recovered` always returns `false` — because the Redis adapter does not persist session state between reconnects.

**Why it happens:** The Happier server already uses `@socket.io/redis-streams-adapter` (confirmed in `startServer.ts`), which does support connection state recovery. However, any future adapter migration (e.g., to the sharded Redis adapter for Redis 7.0) must be audited for this compatibility. Light mode (SQLite) uses the in-memory adapter, which supports recovery fine.

**Consequences:** Complete silent failure of server-to-client recovery in full deployment mode if the wrong adapter is configured.

**Prevention:**
- Keep the Redis Streams adapter as the exclusive production adapter. Do not switch to `@socket.io/redis-adapter` (Pub/Sub) without verifying recovery support.
- Add an integration test that asserts `socket.recovered === true` after a simulated disconnect on the Redis-backed server.

**Confidence:** HIGH — Verified in official Socket.IO connection state recovery docs (adapter compatibility table).

---

### MODERATE: Retention Buffer Skips Sessions That Receive No Events

**What goes wrong:** Socket.IO connection state recovery requires that the server sends at least one event to initialize the offset on the client side. A client that connects, receives no events (e.g., a session with no recent activity), and disconnects will have no offset initialized. On reconnect, recovery fails even if the session is within the TTL window.

**Why it happens:** The Socket.IO recovery mechanism stores the offset of the last sent packet. If no packet was ever sent, there is no offset to recover from. This is not immediately obvious.

**Consequences:** Clients that connect to idle sessions always get cold resyncs, even when connected recently. This is a correctness issue in the recovery path, not a data-loss issue — but it causes unnecessary HTTP load and can appear as "recovery not working."

**Prevention:**
- Send a synthetic "heartbeat" or "session-open" event to every session socket immediately after connection to seed the offset.
- Alternatively, track connection time independently from message offset and use that as the fallback recovery anchor.

**Confidence:** HIGH — Documented in Socket.IO GitHub issue #5282 and confirmed as the known root cause.

---

### MODERATE: State Divergence Between In-Memory and Redis-Streams Retention

**What goes wrong:** In light mode (SQLite + in-memory Socket.IO adapter) and full mode (Postgres + Redis Streams), the retention buffers have different semantics: in-memory does not survive server restarts; Redis Streams does (within its TTL). A client that reconnects after a server restart in light mode will always fall back to cold resync, but the client code treats both modes identically. This creates invisible behavior differences between environments.

**Why it happens:** Light mode is explicitly a "no external deps" configuration. Expecting Redis-style persistence in SQLite mode is an architectural mismatch.

**Consequences:** Integration tests that pass against full mode (with Redis Streams surviving the test harness restart) may not catch light-mode cold-resync edge cases.

**Prevention:**
- Document explicitly: light mode provides in-session resilience (within the server process lifetime), not cross-restart resilience.
- Write integration tests in both SQLite and Postgres/Redis modes to catch behavioral divergence early.

**Confidence:** MEDIUM — Inferred from the server startup code (`startServer.ts`) and Socket.IO adapter documentation. No direct post-mortem source, but the architectural risk is well-understood.

---

## Client-Side Pitfalls

### CRITICAL: iOS Kills WebSocket in Background — Ack Never Arrives

**What goes wrong:** iOS suspends apps aggressively when they go to the background, often within seconds on older devices. If the app is mid-ack (the server has sent a message, the client is processing it, and the app moves to background before the ack is emitted), the TCP connection is silently killed. The server never receives the ack. The server's ack timeout fires, it considers the delivery failed, and retries — but the client is now suspended. On foreground return, the client reconnects and may receive the same message again.

**Why it happens:** iOS NAT mappings expire in as little as 30 seconds. The server is unaware the connection is dead until it attempts to send and gets no ACK at the TCP layer, which can take minutes without keepalive tuning.

**Consequences:** Duplicate messages delivered to the user; or worse, the retry arrives while the client is mid-session-replay, causing out-of-order display.

**Prevention:**
- Deduplication on the client is mandatory, not optional. Every message must carry a stable ID that the client checks against a local set of seen IDs before processing.
- On `AppState` change to `'background'` in React Native: flush any pending acks synchronously before suspension, or explicitly disconnect the socket (forcing a clean reconnect on foreground rather than relying on a zombie connection).
- On foreground return: do not assume the existing socket is live. Reconnect explicitly and run the state recovery / catch-up flow regardless of `socket.connected` state.

**Confidence:** HIGH — Multiple official Apple Developer Forum threads and React Native WebSocket issues confirm iOS kills connections without notifying the app. WebSocket.org troubleshooting guide corroborates.

---

### CRITICAL: Android Doze Mode Breaks Heartbeats — Silent Disconnect

**What goes wrong:** Android Doze mode (API 23+) suspends network access for background apps. If the Happier mobile app is backgrounded and the device enters Doze, Socket.IO heartbeats (PING/PONG) stop. The server's heartbeat timeout fires, the server disconnects the socket server-side, and begins the retention TTL countdown. The Android app may not know it was disconnected until it comes back to foreground — by which point the retention TTL may have expired.

**Why it happens:** Doze mode is not consistently triggered in development (requires stationary, unplugged, screen-off device). This is invisible during desk testing.

**Consequences:** Messages sent during Doze period are retained server-side until TTL. If the user is offline for longer than TTL (e.g., overnight), messages are lost from the retention buffer and must be fetched via cold HTTP catch-up. If the catch-up path is not implemented, those messages are silently missed.

**Prevention:**
- The cold HTTP catch-up path (`afterSeq`-based catch-up, already present in `sessionClient.ts`) is the correct mitigation — Doze recovery is exactly the scenario it handles.
- Set the server-side heartbeat timeout (`pingTimeout`, `pingInterval`) to at least 60 seconds to survive brief Doze windows.
- Test explicitly by enabling Doze mode on a physical Android device (not emulator) with `adb shell dumpsys deviceidle force-idle`.

**Confidence:** HIGH — Android documentation on Doze, Ably developer blog on Android WebSockets, and Socket.IO reconnection docs confirm this pattern.

---

### CRITICAL: Zustand Offline Queue and New Retry Layer — Double Processing

**What goes wrong:** The existing mobile Zustand offline queue already retains and retries client-to-server messages. If the new retry layer also retries those same messages (because the ack didn't arrive fast enough), the server receives two copies of the same outbound message. If the server's deduplication is keyed on socket ID + counter (the Socket.IO tutorial pattern), a reconnect after the Zustand retry will produce a new socket ID — invalidating the deduplication key — and the duplicate will be processed.

**Why it happens:** The existing offline queue was built before the resilience layer. It uses `localId` as its idempotency key. The new retry layer would use a different ID scheme (e.g., `socketId-counter`). These two systems are not aware of each other.

**Consequences:** Duplicate user messages sent to the AI agent, causing the agent to see repeated prompts and respond twice; or duplicate server-side writes.

**Prevention:**
- Use a single, stable idempotency key for all outbound messages: the `localId` already assigned by the mobile Zustand queue. Do not invent a new ID scheme for the retry layer.
- The server must check `localId` uniqueness against the database (or a short-lived deduplication cache) before processing any inbound message — regardless of which path (Socket.IO retry or Zustand queue) delivered it.
- Do not operate both the Zustand queue and the Socket.IO retry mechanism on the same message. Decide which layer owns retries for each message class and enforce that boundary.

**Confidence:** MEDIUM — Inferred from reading `pendingQueueV2Transport.ts` (uses `localId`) and the Socket.IO tutorial deduplication pattern (uses `socketId-counter`). The conflict is structural; confirmed by Socket.IO discussion #5434 on duplicate emit prevention.

---

### MODERATE: Race Condition on Reconnect — Events Emitted Before State Recovery Completes

**What goes wrong:** The client reconnects. The server begins replaying retained messages. Simultaneously, the client's reconnect handler emits queued outbound events (from the Zustand queue). The server receives the outbound events before it has finished replaying inbound messages. The AI backend processes the new user message before the replayed context arrives, breaking transcript coherence.

**Why it happens:** Socket.IO reconnect and state recovery are not transactional. The `connect` event fires immediately; retained message replay happens asynchronously as a sequence of `emit` calls.

**Consequences:** AI agent responds to a user message without the immediately preceding context that was being replayed — creates confusing or incorrect agent responses.

**Prevention:**
- Gate all outbound message sends (from the Zustand queue) until `socket.recovered === true` or the catch-up fetch completes (whichever path runs).
- Expose a `readyForOutbound` signal from the reconnect handler that the outbound queue listens to before resuming.

**Confidence:** MEDIUM — Inferred from Socket.IO reconnect event ordering and the existing `materializeNextPendingQueueV2Message` pattern. No single source documents this exact race; it is a structural consequence of the reconnect architecture.

---

### MODERATE: Client-Side Pending Events Lost on Tab Refresh / App Force Quit

**What goes wrong:** Socket.IO buffers pending events in JavaScript memory. If the user force-quits the React Native app (or refreshes a web tab) before receiving an ack, those buffered events are gone. The new session starts fresh with no knowledge of the lost events. The existing Zustand offline queue partially mitigates this for outbound messages (they are persisted to MMKV), but the retry tracking state (how many retries attempted, which events are awaiting ack) is in-memory only.

**Why it happens:** In-memory state is inherently ephemeral. This is documented explicitly in Socket.IO delivery guarantees docs: "any pending event will be lost if the user refreshes its tab."

**Consequences:** Messages the user typed but not yet acked by the server are lost on force quit. The user has no feedback.

**Prevention:**
- The Zustand queue (MMKV-backed) must be the authoritative source for pending outbound messages — not the Socket.IO in-memory buffer.
- On reconnect, replay from MMKV, not from Socket.IO's internal buffer.
- For inbound messages: track the last confirmed server offset in MMKV so the catch-up can restart from the correct point after a force quit.

**Confidence:** HIGH — Official Socket.IO delivery guarantees docs state this explicitly.

---

### MINOR: Exponential Backoff Spike on Mass Reconnect

**What goes wrong:** A server restart or brief network outage disconnects all clients simultaneously. Without jitter in the reconnect backoff, all clients attempt to reconnect at the same interval — creating a thundering herd that overwhelms the server exactly when it is recovering.

**Prevention:** Ensure the mobile Socket.IO client uses `reconnectionDelayMax` with jitter (`randomizationFactor`). Socket.IO client already supports `reconnectionDelay`, `reconnectionDelayMax`, and `randomizationFactor` options. Verify these are configured.

**Confidence:** MEDIUM — Standard resilience pattern, confirmed in Socket.IO client options docs.

---

## E2E Encryption Integration Pitfalls

### CRITICAL: Deduplication Cannot Use Ciphertext Comparison

**What goes wrong:** A natural deduplication instinct is "if we've seen this ciphertext before, it's a duplicate." This is wrong for two reasons: (1) NaCl/libsodium box encryption is probabilistic — each encryption of the same plaintext produces a different ciphertext (due to random nonce). Two encryptions of the same message will have different ciphertexts. Ciphertext comparison would never detect duplicates. (2) Even if it could, ciphertext deduplication leaks information about which plaintexts are identical — a known side-channel attack.

**Why it happens:** Developers unfamiliar with authenticated encryption assume ciphertexts are deterministic.

**Consequences:** If someone implements ciphertext-based deduplication, it will never fire, and the fallback behavior (process all copies) will result in duplicate message processing at 100% rate.

**Prevention:** Deduplication must be keyed on the plaintext `localId` / message ID, which is generated by the client before encryption and included as metadata in the encrypted envelope or as a separate plaintext field in the Socket.IO event payload. The `localId` pattern already used in `pendingQueueV2Transport.ts` is the correct approach — do not change it.

**Confidence:** HIGH — Confirmed by libsodium/tweetnacl documentation (probabilistic encryption), and the 2024 injection attack research against WhatsApp's ciphertext deduplication confirms the security risk.

---

### CRITICAL: Retry Delivers Ciphertext the Server Cannot Inspect for Deduplication

**What goes wrong:** The server stores ciphertext blobs only — it cannot decrypt them to compare payloads. This means server-side deduplication must be based on a plaintext message identifier, not on the message content. If the retry layer re-encrypts the same plaintext (generating a new ciphertext with a new nonce), the server sees two different ciphertexts and cannot know they represent the same logical message without the plaintext `localId`.

**Why it happens:** The zero-knowledge design is a security strength, but it creates a constraint: the server must be given a plaintext deduplication key alongside the ciphertext.

**Consequences:** Without a plaintext `localId`, every retry creates a new, undetectable duplicate on the server. The server's database accumulates duplicate ciphertext blobs; the mobile app decrypts and displays the same message multiple times.

**Prevention:**
- Every encrypted message must include a plaintext `localId` in the Socket.IO event payload (not inside the ciphertext). This is already the pattern in `pendingQueueV2Transport.ts` — preserve it.
- The server applies a unique constraint on `localId` per session (already present in the v2 pending queue schema). The resilience layer must not bypass this constraint.
- Never re-encrypt a message during retry. The same ciphertext blob from the original send must be the one retried — or the `localId` must remain constant across retry attempts.

**Confidence:** HIGH — Confirmed by reading `pendingQueueV2Transport.ts` (plaintext `localId` + ciphertext pattern) and libsodium probabilistic encryption properties.

---

### MODERATE: Key Availability Assumption During Retry

**What goes wrong:** Encryption keys are on-device, generated from the user's keypair. If the mobile app is suspended mid-retry and the OS evicts in-memory keys (e.g., after a very long background period), the retry loop cannot re-encrypt the message for the retry attempt (though as noted above, re-encryption should not happen — the same ciphertext is retried). However, the mobile client cannot decrypt newly arriving server messages if the decryption key is not loaded into memory.

**Why it happens:** This is an edge case — keys are normally available whenever the app is in foreground — but aggressive key eviction on low-memory devices (older iPhones, budget Androids) can trigger it.

**Consequences:** The client shows an error or blank message instead of the actual content; the user sees a corrupted session.

**Prevention:**
- Key loading must be part of the foreground-return / reconnect sequence, before any message decryption is attempted.
- Do not retry decryption in a loop if the key is unavailable — surface a "reconnecting" state and wait for the key to be re-loaded.

**Confidence:** LOW — Based on general secure-enclave behavior and React Native memory management. No direct source documents this specific failure mode for this codebase.

---

### MINOR: Retained Ciphertext Metadata Reveals Session Activity Patterns

**What goes wrong:** Even though the server stores ciphertext only, the metadata it must retain for resilience (timestamps, sequence numbers, message counts per session) reveals when sessions are active and how many messages were exchanged. This is a metadata leakage concern — not a content leak, but still a privacy consideration.

**Why it happens:** Retention requires metadata to enable re-delivery ordering. There is no way to retain ordered messages without some timing metadata.

**Consequences:** A server operator or attacker with database access can infer user activity patterns from retention metadata, even without decrypting messages.

**Prevention:** This is an accepted trade-off in the existing design (the server already has session metadata). Minimize the metadata retained with each message: store only sequence number, session ID, and timestamp. Do not store socket IDs or device fingerprints alongside retained messages.

**Confidence:** MEDIUM — Informed by the 2024 Cornell injection attacks paper on E2E encrypted metadata side-channels.

---

## Upstream Compatibility Pitfalls

### CRITICAL: New Event Names or Payload Fields Break the Upstream Mobile App

**What goes wrong:** This is a fork of `happier-dev/happier`. The upstream mobile app (not this fork) connects to the same server protocol. If the resilience layer introduces new Socket.IO event names or new required fields on existing events, the upstream mobile app (which does not have the corresponding client changes) will receive events it does not understand or fail to send required fields.

**Why it happens:** Protocol changes made only in the fork, not upstream, create a forked protocol. The server must support both old and new clients during the transition period — which is never finite when upstream merges happen at arbitrary intervals.

**Consequences:** After a merge from upstream that ships new mobile code, the server's protocol expectations may not match. The mobile app breaks silently (events are ignored) or explicitly (ack callbacks not called, timeouts fire).

**Prevention:**
- All new event types must be additive and optional at the server. The server must handle the case where a client does not send new resilience fields (treat missing `lastSeenOffset` as 0, not as an error).
- All new server-to-client events must be silently ignored by older clients. Do not require the client to ack a new event type before sending further messages.
- Document the protocol additions in a `PROTOCOL_CHANGES.md` in the fork so upstream merges can identify what needs to be forward-ported.

**Confidence:** MEDIUM — Inferred from the project's stated constraint ("changes must remain compatible with the upstream mobile app") and standard forked-protocol management practices.

---

### MODERATE: AcpBackend.ts and startDaemon.ts — Fragile Touch Points

**What goes wrong:** `AcpBackend.ts` (2,753 lines, 20+ `as any` casts) and `startDaemon.ts` (1,878 lines) are identified tech-debt files. If the resilience layer requires changes to session message routing that touch these files, the risk of introducing a regression in the existing session path is high — the files lack test coverage and have opaque type safety.

**Why it happens:** Large files with `as any` casts indicate accumulated complexity without refactoring. Any new touch point becomes load-bearing without a safety net.

**Consequences:** A subtle change to message routing inside `AcpBackend.ts` could break ACP agent sessions silently. `startDaemon.ts` changes could break daemon lifecycle for all backends.

**Prevention:**
- The resilience layer must be implemented as an additive wrapper around the existing Socket.IO emit path, not as a modification of the existing path.
- If a change is unavoidable, add a focused unit test for the specific behavior being changed before touching either file.
- Prefer adding a new event emission hook (e.g., an event middleware / interceptor) over modifying the call site inside the tech-debt file.

**Confidence:** HIGH — Confirmed by reading the project's `PROJECT.md` known tech debt section. The risk of touching untested large files is universally accepted.

---

### MINOR: Upstream May Ship Its Own Resilience Layer

**What goes wrong:** The upstream `happier-dev/happier` project is in "alpha preview stage." If upstream ships a resilience feature (their own ack/retry/deduplication implementation) in a future commit, and this fork has already built its own, the upstream merge will create a conflict in the Socket.IO layer that is non-trivial to resolve.

**Prevention:**
- Watch the upstream repository for activity in the Socket.IO / session transport layer before starting implementation.
- Design the fork's resilience layer to be extractable into a clean module (e.g., `packages/connection-supervisor/` already exists as a shared package) so that if upstream ships a conflicting implementation, the fork's approach can be compared and one superseded cleanly.

**Confidence:** LOW — Speculative; no evidence upstream is working on this.

---

## Deduplication Pitfalls

### CRITICAL: Socket ID Used as Deduplication Namespace — Invalidated on Reconnect

**What goes wrong:** The Socket.IO tutorial uses `${socket.id}-${counter++}` as the deduplication key. The socket ID changes on every reconnect. If a client sends a message with key `abc123-5`, disconnects, reconnects (gets new socket ID `xyz789`), and the Socket.IO retry mechanism re-sends that message as `xyz789-5`, the server sees it as a new message — not a duplicate — and processes it twice.

**Why it happens:** The tutorial example is designed for within-session deduplication only. It does not account for reconnect scenarios where the socket ID changes.

**Consequences:** Any message that was in-flight at disconnect is processed twice if the client retries it after reconnect. For an AI session, this means the AI sees a duplicate user message and responds twice.

**Prevention:**
- Do not use socket ID as part of the deduplication key for messages that survive reconnect.
- Use the `localId` (UUID generated at message creation time on the client) as the sole deduplication key. The `localId` is stable across reconnects because it is generated once before the message enters the retry queue.
- The server's unique constraint on `localId` per session is the correct deduplication mechanism — not in-memory socket-ID-based tracking.

**Confidence:** HIGH — Directly confirmed by reading Socket.IO discussion #5434 on duplicate emit prevention and the `${socket.id}-${counter}` pattern in the tutorial step 8 docs.

---

### CRITICAL: Deduplication Window Too Short — Replayed Messages Accepted as New

**What goes wrong:** The server keeps a short-lived in-memory deduplication cache (e.g., TTL of 60 seconds) of recently seen `localId` values. If a mobile client is offline for longer than 60 seconds (completely normal on mobile), reconnects, and replays a message the server previously attempted to process (but the client never acked), the deduplication cache no longer contains that `localId` and the server accepts the duplicate.

**Why it happens:** In-memory TTL caches are sized for "normal" retry intervals (seconds), not mobile offline periods (minutes to hours).

**Consequences:** Duplicate messages processed; AI agent responds to same message twice.

**Prevention:**
- Deduplication must be backed by the database, not an in-memory cache. The unique constraint on `localId` in the database is permanent (until the message is pruned by the retention worker). This is the correct mechanism.
- Do not add an in-memory deduplication cache as a "fast path" unless the database constraint is the authoritative final check.

**Confidence:** HIGH — Inferred from the structural analysis of the v2 pending queue (database-backed `localId` unique constraint) and the known pitfall of in-memory dedup caches expiring before mobile reconnect windows.

---

### MODERATE: Sequence Gap Detection — Missing Events Silently Dropped

**What goes wrong:** The client tracks the last received sequence number (`lastObservedMessageSeq`, confirmed in `sessionClient.ts` tests). On reconnect, it requests messages `afterSeq=N`. If the server's retention buffer has been partially evicted (messages with sequence 101–150 are gone, but 151–200 are present), the client receives sequences 151–200 without knowing sequences 101–150 are missing. The client increments its cursor to 200, and the missing range is permanently lost.

**Why it happens:** The sequence-based catch-up protocol assumes the server's retention is contiguous from the requested offset. If the buffer has gaps (due to TTL eviction, server restart in light mode, or partial retention failure), the client has no way to detect the gap.

**Consequences:** Message loss that is invisible to the client — the app shows a complete history with a gap the user cannot see.

**Prevention:**
- The server must return a "retention start" sequence number along with the catch-up payload, indicating the earliest sequence it can serve. The client compares `retentionStart` to its `lastObservedMessageSeq + 1`. If there is a gap, the client falls back to a full session reload (or surfaces a "some messages may be missing" indicator).
- Do not assume the retention buffer is contiguous.

**Confidence:** MEDIUM — Inferred from the `afterSeq` pattern in `sessionClient.afterSeqCatchUp.test.ts` and general sequence-gap detection principles. No direct Socket.IO source documents this exactly.

---

### MODERATE: Startup Catch-Up Retry Uses Stale Initial Offset

**What goes wrong:** The `startupMessageCatchUpInitialAfterSeq` is set at client startup and used for all subsequent retry attempts. If a local echo (an optimistic update) advances `lastObservedMessageSeq` before the catch-up completes, a naive implementation would retry from the wrong (advanced) offset, missing messages in between.

**Why it happens:** The optimistic update path and the catch-up retry path share the same cursor variable. Confirmed in `sessionClient.startupCatchUpRetry.test.ts` — the test explicitly validates that the retry always uses `startupMessageCatchUpInitialAfterSeq`, not the live cursor.

**Consequences:** Messages between the initial offset and the optimistic echo position are permanently missed after a reconnect if the catch-up retries from the wrong offset.

**Prevention:** This is already guarded in the existing codebase (the test confirms the correct behavior). The resilience layer must not change how `startupMessageCatchUpInitialAfterSeq` is set or reset — it must remain frozen at the value observed at client startup, not updated by optimistic echoes during the catch-up window.

**Detection warning:** This is a regression risk for the new resilience layer — any change to how the startup cursor is initialized must be tested against this specific scenario.

**Confidence:** HIGH — Directly confirmed by reading `sessionClient.startupCatchUpRetry.test.ts`.

---

### MINOR: ID Collision Risk in Counter-Based Schemes

**What goes wrong:** Counter-based IDs (`socketId-counter`) reset to 0 on reconnect. Two different clients (or two browser tabs for the same user) may generate the same `socketId-counter` combination if socket IDs share a prefix pattern.

**Prevention:** Use UUIDs (or `crypto.randomUUID()`) for `localId` generation. Counters are acceptable within a single connection lifetime but must not be used as the stable message identity across reconnects.

**Confidence:** MEDIUM — Standard distributed systems deduplication principle. Socket.IO tutorial acknowledges this by using `Math.random().toString(36)`.

---

## Prevention Summary

| Pitfall | Phase | Prevention |
|---------|-------|------------|
| Unbounded per-client buffer | Phase 1 (Server retention) | Hard cap per client; per-message TTL; Prometheus gauge |
| TTL / reconnect window mismatch | Phase 1 (Server retention) | Single source-of-truth TTL constant; TTL >= 1.5x client max reconnect window |
| Redis Pub/Sub adapter incompatibility | Phase 1 (Server retention) | Keep Redis Streams adapter; integration test `socket.recovered` |
| No events = no offset = recovery fails | Phase 1 (Server retention) | Send synthetic session-open event on connect to seed offset |
| Light mode vs full mode divergence | Phase 1 (Server retention) | Integration tests in both SQLite and Postgres/Redis modes |
| iOS kills socket in background mid-ack | Phase 2 (Client retry + dedup) | Client dedup mandatory; flush acks on AppState 'background'; reconnect on foreground |
| Android Doze breaks heartbeats | Phase 2 (Client retry + dedup) | Rely on cold HTTP catch-up (afterSeq) for Doze recovery; increase pingTimeout |
| Zustand queue + retry layer double-process | Phase 2 (Client retry + dedup) | Single `localId` as idempotency key; one layer owns retries per message class |
| Race condition: outbound before inbound replay | Phase 2 (Client retry + dedup) | Gate outbound sends until `socket.recovered` or catch-up complete |
| Pending events lost on force quit | Phase 2 (Client retry + dedup) | MMKV-backed Zustand queue as authoritative source; track server offset in MMKV |
| Thundering herd reconnect | Phase 2 (Client retry + dedup) | Configure `randomizationFactor` in Socket.IO client reconnect options |
| Ciphertext deduplication (wrong approach) | Phase 1 + Phase 2 | Use plaintext `localId` only; never compare ciphertexts for deduplication |
| Server cannot inspect ciphertext for dedup | Phase 1 (Server retention) | Plaintext `localId` in event payload; DB unique constraint on `localId` |
| Key unavailable during retry decryption | Phase 2 (Client retry + dedup) | Load keys as part of foreground-return sequence before any decryption |
| New event names break upstream mobile app | All phases | Additive-only protocol changes; missing fields treated as defaults not errors |
| Touching AcpBackend.ts / startDaemon.ts | All phases | Additive wrapper pattern; no modification to existing emit call sites |
| Socket ID used as dedup namespace | Phase 2 (Client retry + dedup) | Use stable `localId` (UUID at creation); never socket-ID-based dedup |
| Deduplication window too short | Phase 1 (Server retention) | DB unique constraint is authoritative dedup; no in-memory TTL cache |
| Sequence gap detection missing | Phase 2 (Client retry + dedup) | Server returns `retentionStart`; client detects gaps and falls back to full reload |
| Startup catch-up uses stale initial offset | Phase 2 (Client retry + dedup) | Preserve existing `startupMessageCatchUpInitialAfterSeq` freeze behavior; regression test |
| ID collision in counter-based scheme | Phase 2 (Client retry + dedup) | Use UUID for `localId`; counters only within single connection lifetime |

---

## Sources

- Socket.IO Delivery Guarantees: https://socket.io/docs/v4/delivery-guarantees
- Socket.IO Connection State Recovery: https://socket.io/docs/v4/connection-state-recovery
- Socket.IO Tutorial Step 8 (Client Delivery): https://socket.io/docs/v4/tutorial/step-8
- Socket.IO Memory Usage: https://socket.io/docs/v4/memory-usage/
- Socket.IO GitHub Issue #5282 (CSR fails for long-lived connections): https://github.com/socketio/socket.io/issues/5282
- Socket.IO GitHub Discussion #5248 (CSR fails on WiFi to 4G): https://github.com/socketio/socket.io/discussions/5248
- Socket.IO GitHub Discussion #5434 (Prevent duplicate emits): https://github.com/socketio/socket.io/discussions/5434
- Socket.IO GitHub Issues #3477, #4451, #2775 (Memory leaks): https://github.com/socketio/socket.io/issues/3477
- Socket.IO GitHub Issue #4888 (CSR requires at least one event): https://github.com/socketio/socket.io/issues/4888
- Injection Attacks Against E2E Encrypted Applications (Cornell, 2024): https://arxiv.org/html/2411.09228
- WebSocket.org iOS/Android background timeout guide: https://websocket.org/guides/troubleshooting/timeout/
- Ably WebSockets and Android background: https://ably.com/topic/websockets-android
- Happier codebase: apps/cli/src/api/session/pendingQueueV2Transport.ts (localId + ciphertext pattern)
- Happier codebase: apps/cli/src/api/sessionClient.startupCatchUpRetry.test.ts (frozen initial offset)
- Happier codebase: apps/cli/src/api/sessionClient.afterSeqCatchUp.test.ts (afterSeq catch-up)
- Happier codebase: apps/server/sources/startServer.ts (Redis Streams adapter confirmed)
- Happier codebase: apps/server/sources/app/events/connectionEventRouter.ts (in-memory event routing)
