/**
 * MCP tool enable/disable configuration (CLI-local settings)
 *
 * Defines the McpToolsSettingsV1 schema and reader function.
 * The schema is validated from the `mcpToolsSettingsV1` field in ~/.happier/settings.json.
 * The reader accepts an already-loaded Settings object (not a file path) so it stays pure
 * and testable without filesystem access.
 */

import * as z from 'zod';
import { logger } from '@/ui/logger';
import type { Settings } from '@/persistence';

export const McpToolsSettingsV1Schema = z.preprocess(
    (raw) => {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
        return raw;
    },
    z.object({
        v: z.literal(1).default(1 as const),
        tools: z.record(z.string(), z.object({ enabled: z.boolean() })).default({}),
    }),
);

export type McpToolsSettingsV1 = z.infer<typeof McpToolsSettingsV1Schema>;

export const DEFAULT_MCP_TOOLS_SETTINGS: McpToolsSettingsV1 = { v: 1, tools: {} };

/**
 * Reads and validates the mcpToolsSettingsV1 field from a Settings object.
 *
 * Always returns a valid McpToolsSettingsV1 — never throws, never returns null.
 * - Absent key → returns DEFAULT_MCP_TOOLS_SETTINGS (silent, per D-05).
 * - Parse failure → emits logger.warn and returns DEFAULT_MCP_TOOLS_SETTINGS.
 * - Valid payload → returns parsed value.
 */
export function readMcpToolsSettingsV1(settings: Settings): McpToolsSettingsV1 {
    const raw = settings.mcpToolsSettingsV1;
    if (raw === undefined || raw === null) {
        return DEFAULT_MCP_TOOLS_SETTINGS;
    }
    const parsed = McpToolsSettingsV1Schema.safeParse(raw);
    if (!parsed.success) {
        logger.warn(`[mcpToolsSettings] mcpToolsSettingsV1 failed schema validation — using defaults. Error: ${parsed.error.message}`);
        return DEFAULT_MCP_TOOLS_SETTINGS;
    }
    return parsed.data;
}
