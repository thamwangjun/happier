/**
 * Session-agent tool enable/disable configuration (CLI-local settings)
 *
 * Defines the SessionAgentToolsSettings schema and reader function.
 * The schema is validated from the `sessionAgentToolsSettingsV1` field in ~/.happier/settings.json.
 * The reader accepts an already-loaded Settings object (not a file path) so it stays pure
 * and testable without filesystem access.
 */

import * as z from 'zod';
import { logger } from '@/ui/logger';
import type { Settings } from '@/persistence';

export const SessionAgentToolsSettingsSchema = z.preprocess(
    (raw) => {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
        return raw;
    },
    z.object({
        v: z.literal(1).default(1 as const),
        tools: z.record(z.string(), z.object({ enabled: z.boolean() })).default({}),
        default: z.boolean().optional(),
    }),
);

export type SessionAgentToolsSettings = z.infer<typeof SessionAgentToolsSettingsSchema>;

export const DEFAULT_SESSION_AGENT_TOOLS_SETTINGS: SessionAgentToolsSettings = { v: 1, tools: {} };

/**
 * Reads and validates the sessionAgentToolsSettingsV1 field from a Settings object.
 *
 * Always returns a valid SessionAgentToolsSettings — never throws, never returns null.
 * - Absent key → returns DEFAULT_SESSION_AGENT_TOOLS_SETTINGS (silent, per D-05).
 * - Parse failure → emits logger.warn and returns DEFAULT_SESSION_AGENT_TOOLS_SETTINGS.
 * - Valid payload → returns parsed value.
 */
export function readSessionAgentToolsSettings(settings: Settings): SessionAgentToolsSettings {
    const raw = settings.sessionAgentToolsSettingsV1;   // JSON key unchanged per D-03
    if (raw === undefined || raw === null) {
        return DEFAULT_SESSION_AGENT_TOOLS_SETTINGS;
    }
    const parsed = SessionAgentToolsSettingsSchema.safeParse(raw);
    if (!parsed.success) {
        logger.warn(`[sessionAgentToolsSettings] sessionAgentToolsSettingsV1 failed schema validation — using defaults. Error: ${parsed.error.message}`);
        return DEFAULT_SESSION_AGENT_TOOLS_SETTINGS;
    }
    return parsed.data;
}

/**
 * Builds the isSessionAgentToolEnabled predicate from a parsed settings blob.
 *
 * Lookup order: per-tool entry → global default → true (opt-out model).
 * - Per-tool entry present: returns entry.enabled (true or false).
 * - Per-tool entry absent, default set: returns settings.default (opt-in mode when false).
 * - Per-tool entry absent, default unset: returns true (backward-compatible opt-out).
 * Never throws.
 */
export function buildIsSessionAgentToolEnabled(
    settings: SessionAgentToolsSettings,
): (toolName: string) => boolean {
    return (toolName: string) => {
        const perTool = settings.tools[toolName];
        if (perTool !== undefined) {
            return perTool.enabled;
        }
        return settings.default ?? true;
    };
}

/**
 * Returns the subset of tool names present in settings.tools that are not in knownNames.
 *
 * Used by the caller (startHappyServer.ts) to emit a startup warn when the developer's config
 * references tool names that do not exist in the session_agent catalog.
 * Never throws. Returns [] when settings.tools is empty or all names are recognized.
 *
 * Satisfies TOOLS-02 (silent at processing time — this function returns names, caller decides IO)
 * and VALID-01 (caller emits logger.warn when result is non-empty).
 */
export function findUnknownSessionAgentToolNames(
    settings: SessionAgentToolsSettings,
    knownNames: string[],
): string[] {
    const knownSet = new Set(knownNames);
    return Object.keys(settings.tools).filter((name) => !knownSet.has(name));
}
