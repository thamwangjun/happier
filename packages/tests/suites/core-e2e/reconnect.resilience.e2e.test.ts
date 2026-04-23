import { afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

import { MessageAckResponseSchema } from '@happier-dev/protocol/updates';
import { SOCKET_RESILIENCE_EVENTS } from '@happier-dev/protocol/socketResilience';

import { createRunDirs } from '../../src/testkit/runDir';
import { startServerLight, type StartedServer } from '../../src/testkit/process/serverLight';
import { createTestAuth } from '../../src/testkit/auth';
import { createSession } from '../../src/testkit/sessions';
import { createUserScopedSocketCollector } from '../../src/testkit/socketClient';
import { FailureArtifacts } from '../../src/testkit/failureArtifacts';
import { envFlag } from '../../src/testkit/env';
import { waitFor } from '../../src/testkit/timing';

const run = createRunDirs({ runLabel: 'core' });

describe('core e2e: resilience protocol — reconnect-resume, replay-complete, dedup', () => {
  let server: StartedServer | null = null;

  afterAll(async () => {
    await server?.stop();
  });

  it('device B disconnects mid-stream; reconnect-resume fires with lastAckedSeq; replay-complete received; no duplicate seqs', async () => {
    const testDir = run.testDir('resilience-protocol-reconnect');
    const saveArtifactsOnSuccess = envFlag(['HAPPIER_E2E_SAVE_ARTIFACTS', 'HAPPY_E2E_SAVE_ARTIFACTS'], false);
    server = await startServerLight({ testDir });
    const auth = await createTestAuth(server.baseUrl);
    const { sessionId } = await createSession(server.baseUrl, auth.token);

    const deviceA = createUserScopedSocketCollector(server.baseUrl, auth.token);
    const deviceB = createUserScopedSocketCollector(server.baseUrl, auth.token);

    const replayCompleteEvents: unknown[] = [];
    deviceB.on(SOCKET_RESILIENCE_EVENTS.REPLAY_COMPLETE, (data: unknown) => {
      replayCompleteEvents.push(data);
    });

    const artifacts = new FailureArtifacts();
    artifacts.json('deviceA.events.json', () => deviceA.getEvents());
    artifacts.json('deviceB.events.json', () => deviceB.getEvents());
    artifacts.json('replayCompleteEvents.json', () => replayCompleteEvents);

    let passed = false;

    deviceA.connect();
    deviceB.connect();
    await waitFor(() => deviceA.isConnected() && deviceB.isConnected(), { timeoutMs: 20_000, context: 'waiting for both devices to connect' });

    const sendFromA = async (label: string): Promise<void> => {
      const ciphertext = Buffer.from(label, 'utf8').toString('base64');
      const localId = randomUUID();
      const rawAck = await deviceA.emitWithAck<any>('message', { sid: sessionId, message: ciphertext, localId });
      const ack = MessageAckResponseSchema.parse(rawAck);
      expect(ack.ok).toBe(true);
    };

    // Phase 1: send a few messages while both devices are connected.
    // Device B receives these and we track the last update-event seq it saw.
    const PRE_DISCONNECT = 5;
    for (let i = 0; i < PRE_DISCONNECT; i++) {
      await sendFromA(`pre-${i}`);
    }

    // Wait for Device B to receive the pre-disconnect messages.
    await waitFor(
      () => deviceB.getEvents().filter((e) => e.kind === 'update').length >= PRE_DISCONNECT,
      { timeoutMs: 15_000, context: 'waiting for Device B to receive pre-disconnect messages' }
    );

    // Record the lastAckedSeq Device B will report at reconnect.
    // This is the highest outer update-event seq (payload.seq) that Device B has confirmed receiving.
    // NOTE: ack.seq (from the message handler) is the inner session-message seq, which differs
    // from the outer update-event seq stored in the buffer. We must use the update-event seq so
    // that readBuffer's { gt: lastAckedSeq } filter aligns with the buffer contents.
    const lastAckedSeq = deviceB.getEvents()
      .filter((e) => e.kind === 'update')
      .reduce((max, e) => {
        const s = (e.payload as { seq?: unknown }).seq;
        return typeof s === 'number' && s > max ? s : max;
      }, -1);

    // Phase 2: disconnect Device B.
    deviceB.disconnect();
    await waitFor(() => !deviceB.isConnected(), { timeoutMs: 10_000, context: 'waiting for Device B to disconnect' });

    // Phase 3: Device A sends more messages while B is offline.
    // These must be buffered by the server's UnackedMessageBuffer.
    const BUFFERED = 10;
    for (let i = 0; i < BUFFERED; i++) {
      await sendFromA(`buffered-${i}`);
    }

    // Phase 4: Device B reconnects.
    deviceB.connect();
    await waitFor(() => deviceB.isConnected(), { timeoutMs: 20_000, context: 'waiting for Device B to reconnect' });

    try {
      // Phase 5: Drive the reconnect-resume protocol explicitly.
      // D-02 (1): The test controls this emit, so we can assert the exact lastAckedSeq used.
      // This simulates what the mobile client does automatically (MOB-01).
      deviceB.emit(SOCKET_RESILIENCE_EVENTS.RECONNECT_RESUME, { sessionId, lastAckedSeq });

      // Phase 6: Wait for replay-complete — the server-side gate signal (SRVR-09).
      // D-02 (2): Assert replay-complete was received, not just that reconnect succeeded.
      // Use REPLAY_COMPLETE (not REPLAY_START) per RESEARCH.md Pitfall 4.
      await waitFor(
        () => replayCompleteEvents.length > 0,
        { timeoutMs: 15_000, context: 'waiting for replay-complete after reconnect-resume' }
      );

      expect(replayCompleteEvents.length).toBeGreaterThan(0);

      // Confirm server actually replayed messages (not an empty buffer path).
      // This guards against the test passing vacuously when buffering is broken.
      const totalEventsAfterReconnect = deviceB.getEvents().filter((e) => e.kind === 'update').length;
      expect(totalEventsAfterReconnect).toBeGreaterThanOrEqual(PRE_DISCONNECT + BUFFERED);

      // Phase 7: D-02 (3): Assert no duplicate seq values in the full received stream.
      const receivedSeqs = deviceB.getEvents()
        .filter((e) => e.kind === 'update')
        .map((e) => (e.payload as { seq?: unknown }).seq)
        .filter((s): s is number => typeof s === 'number');

      const uniqueSeqs = new Set(receivedSeqs);
      expect(uniqueSeqs.size).toBe(receivedSeqs.length);

      // D-02 (1): Documented assertion — reconnect-resume was emitted with lastAckedSeq.
      // Trivially satisfied because the test controls the emit above. The meaningful assertion
      // is that the server responded with replay-complete (checked above), proving the server
      // received and processed the reconnect-resume with the correct payload.

      passed = true;
    } finally {
      await artifacts.dumpAll(testDir, { onlyIf: saveArtifactsOnSuccess || !passed });
      deviceA.close();
      deviceB.close();
    }
  });
});
