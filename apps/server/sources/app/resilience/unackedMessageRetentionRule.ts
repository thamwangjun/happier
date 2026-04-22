import { db } from '@/storage/db';
import { getRelayBufferTtlMsFromEnv } from '@/config/backends';
import type { RetentionRule } from '@/app/retention/runtime/retentionRuleRegistry';

/**
 * Sweeps UnackedMessage rows older than RELAY_BUFFER_TTL_MS from the database.
 *
 * Uses the same env-var-backed TTL constant as writeToBuffer to ensure a single
 * configuration value controls both the write-side TTL and the sweep cutoff (STORE-06).
 *
 * The rule is registered in retentionRuleRegistry.ts and executed by the existing
 * retention worker on its configured interval — no new scheduling required.
 *
 * Uses the batch-safe findMany → deleteMany pattern: candidate IDs are selected first,
 * then the cutoff condition is re-applied in deleteMany to guard against rows refreshed
 * between the two queries.
 */
export function createUnackedMessageRetentionRule(): RetentionRule {
    return {
        id: 'unackedMessages',
        run: async ({ batchSize, dryRun, maxDeletesPerRulePerRun, now }) => {
            const ttlMs = getRelayBufferTtlMsFromEnv(process.env);
            const cutoff = new Date(now.getTime() - ttlMs);
            const limit = Math.max(1, Math.min(batchSize, maxDeletesPerRulePerRun));

            const candidates = await db.unackedMessage.findMany({
                where: { createdAt: { lt: cutoff } },
                orderBy: { createdAt: 'asc' },
                take: limit,
                select: { id: true },
            });

            if (dryRun) {
                return { id: 'unackedMessages', deleted: candidates.length };
            }

            if (candidates.length === 0) {
                return { id: 'unackedMessages', deleted: 0 };
            }

            const result = await db.unackedMessage.deleteMany({
                where: {
                    id: { in: candidates.map(r => r.id) },
                    createdAt: { lt: cutoff },
                },
            });

            return { id: 'unackedMessages', deleted: result.count };
        },
    };
}
