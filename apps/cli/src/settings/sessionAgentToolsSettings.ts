/**
 * Session-agent tool enable/disable configuration (CLI-local settings)
 *
 * Defines the SessionAgentToolsSettingsV1 schema and reader function.
 * The schema is validated from the `sessionAgentToolsSettingsV1` field in ~/.happier/settings.json.
 * The reader accepts an already-loaded Settings object (not a file path) so it stays pure
 * and testable without filesystem access.
 */

import * as z from 'zod';
import { logger } from '@/ui/logger';
import type { Settings } from '@/persistence';

export const SessionAgentToolsSettingsV1Schema = z.preprocess(
    (raw) => {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
        return raw;
    },
    z.object({
        v: z.literal(1).default(1 as const),
        tools: z.record(z.string(), z.object({ enabled: z.boolean() })).default({}),
    }),
);

export type SessionAgentToolsSettingsV1 = z.infer<typeof SessionAgentToolsSettingsV1Schema>;

export const DEFAULT_SESSION_AGENT_TOOLS_SETTINGS: SessionAgentToolsSettingsV1 = { v: 1, tools: {} };

/**
 * Reads and validates the sessionAgentToolsSettingsV1 field from a Settings object.
 *
 * Always returns a valid SessionAgentToolsSettingsV1 — never throws, never returns null.
 * - Absent key → returns DEFAULT_SESSION_AGENT_TOOLS_SETTINGS (silent, per D-05).
 * - Parse failure → emits logger.warn and returns DEFAULT_SESSION_AGENT_TOOLS_SETTINGS.
 * - Valid payload → returns parsed value.
 */
export function readSessionAgentToolsSettingsV1(settings: Settings): SessionAgentToolsSettingsV1 {
    const raw = settings.sessionAgentToolsSettingsV1;
    if (raw === undefined || raw === null) {
        return DEFAULT_SESSION_AGENT_TOOLS_SETTINGS;
    }
    const parsed = SessionAgentToolsSettingsV1Schema.safeParse(raw);
    if (!parsed.success) {
        logger.warn(`[sessionAgentToolsSettings] sessionAgentToolsSettingsV1 failed schema validation — using defaults. Error: ${parsed.error.message}`);
        return DEFAULT_SESSION_AGENT_TOOLS_SETTINGS;
    }
    return parsed.data;
}

/**
 * Builds the isSessionAgentToolEnabled predicate from a parsed settings blob.
 *
 * Returns true for any tool absent from the tools map (opt-out model, SCHEMA-02).
 * Returns true when enabled === true. Returns false when enabled === false.
 * Never throws.
 */
export function buildIsSessionAgentToolEnabled(
    settings: SessionAgentToolsSettingsV1,
): (toolName: string) => boolean {
    return (toolName: string) => settings.tools[toolName]?.enabled !== false;
}
