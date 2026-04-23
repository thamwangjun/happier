import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

import { createRunDirs } from '../../src/testkit/runDir';
import { startServerLight, type StartedServer } from '../../src/testkit/process/serverLight';
import { createTestAuth } from '../../src/testkit/auth';
import { createSession } from '../../src/testkit/sessions';
import { createUserScopedSocketCollector } from '../../src/testkit/socketClient';
import { FailureArtifacts } from '../../src/testkit/failureArtifacts';
import { envFlag } from '../../src/testkit/env';
import { writeTestManifestForServer } from '../../src/testkit/manifestForServer';
import { waitFor } from '../../src/testkit/timing';
import { MessageAckResponseSchema } from '@happier-dev/protocol/updates';

const run = createRunDirs({ runLabel: 'stress' });

/**
 * WAL Contention Stress Test (VALID-03)
 *
 * Validates that the SQLite UnackedMessageBuffer can sustain 200 concurrent writes
 * without SQLite BUSY errors, WAL timeouts, or OOM conditions.
 *
 * Key: messages are fired with Promise.all (not serial await), which creates real
 * concurrent writes to the UnackedMessage table and exercises the WAL write path.
 * Serial sends would serialize DB writes and never trigger contention.
 */
describe('stress: SQLite WAL contention under high-frequency UnackedMessageBuffer writes', () => {
  let server: StartedServer;
  let token: string;

  beforeAll(async () => {
    const testDir = run.testDir('server');
    server = await startServerLight({ testDir });
    const auth = await createTestAuth(server.baseUrl);
    token = auth.token;
  });

  afterAll(async () => {
    await server.stop();
  });

  it('200 concurrent buffer writes complete without SQLite BUSY or WAL errors', async () => {
    const saveArtifactsOnSuccess = envFlag(['HAPPIER_E2E_SAVE_ARTIFACTS', 'HAPPY_E2E_SAVE_ARTIFACTS'], false);
    const startedAt = new Date().toISOString();
    const testDir = run.testDir('wal-contention');
    const { sessionId } = await createSession(server.baseUrl, token);

    writeTestManifestForServer({
      testDir,
      server,
      startedAt,
      runId: run.runId,
      testName: 'wal-contention',
      sessionIds: [sessionId],
      env: {
        CI: process.env.CI,
        HAPPIER_E2E_SAVE_ARTIFACTS: process.env.HAPPIER_E2E_SAVE_ARTIFACTS ?? process.env.HAPPY_E2E_SAVE_ARTIFACTS,
      },
    });

    // Device A is the sender. Device B is a connected receiver — its presence ensures
    // the server routes messages through the UnackedMessageBuffer for the user-scoped
    // connectionKey, which is the WAL write path under test.
    const deviceA = createUserScopedSocketCollector(server.baseUrl, token);
    const deviceB = createUserScopedSocketCollector(server.baseUrl, token);

    const artifacts = new FailureArtifacts();
    artifacts.json('deviceA.events.json', () => deviceA.getEvents());
    artifacts.json('deviceB.events.json', () => deviceB.getEvents());

    let passed = false;

    deviceA.connect();
    deviceB.connect();

    // Wait for both devices to be connected before bursting.
    await waitFor(() => deviceA.isConnected() && deviceB.isConnected(), {
      timeoutMs: 20_000,
      context: 'waiting for both devices to connect',
    });

    try {
      // Burst: fire BURST messages concurrently without awaiting each ack before sending the next.
      // This is the key to triggering real SQLite WAL contention on the UnackedMessage table.
      // Do NOT convert to serial await — serial sends serialize DB writes and prevent contention.
      const BURST = 200;
      const sends = Array.from({ length: BURST }, (_, i) => {
        const localId = randomUUID();
        const ciphertext = Buffer.from(`wal-burst-${i}`, 'utf8').toString('base64');
        return deviceA.emitWithAck<unknown>('message', { sid: sessionId, message: ciphertext, localId }, 30_000);
      });

      const results = await Promise.all(sends);

      // Assert all 200 writes succeeded — no SQLite BUSY, no WAL timeout, no OOM.
      let okCount = 0;
      for (const raw of results) {
        const ack = MessageAckResponseSchema.parse(raw);
        expect(ack.ok).toBe(true);
        if (ack.ok === true) okCount++;
      }
      expect(okCount).toBe(BURST);

      passed = true;
    } finally {
      await artifacts.dumpAll(testDir, { onlyIf: saveArtifactsOnSuccess || !passed });
      deviceA.close();
      deviceB.close();
    }
  });
});
