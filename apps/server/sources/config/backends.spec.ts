import { describe, expect, it } from "vitest";

import {
    getFilesBackendFromEnv,
    getRelayBufferCapFromEnv,
    getRelayBufferTtlMsFromEnv,
    getSocketAdapterFromEnv,
    isRedisStreamsEnabled,
    resolveDefaultFilesBackend,
    resolveDefaultSocketAdapter,
} from "./backends";

describe("config/backends", () => {
    it("defaults files backend by flavor", () => {
        expect(resolveDefaultFilesBackend("light")).toBe("local");
        expect(resolveDefaultFilesBackend("full")).toBe("s3");
    });

    it("defaults socket adapter to memory", () => {
        expect(resolveDefaultSocketAdapter("light")).toBe("memory");
        expect(resolveDefaultSocketAdapter("full")).toBe("memory");
    });

    it("parses files backend from env", () => {
        expect(getFilesBackendFromEnv({ HAPPIER_FILES_BACKEND: "local" }, "s3")).toBe("local");
        expect(getFilesBackendFromEnv({ HAPPIER_FILES_BACKEND: "S3" }, "local")).toBe("s3");
        expect(getFilesBackendFromEnv({ HAPPIER_FILES_BACKEND: "nope" }, "local")).toBe("local");
    });

    it("parses socket adapter from env", () => {
        expect(getSocketAdapterFromEnv({ HAPPIER_SOCKET_ADAPTER: "memory" }, "redis-streams")).toBe("memory");
        expect(getSocketAdapterFromEnv({ HAPPIER_SOCKET_ADAPTER: "redis" }, "memory")).toBe("redis-streams");
        expect(getSocketAdapterFromEnv({ HAPPIER_SOCKET_ADAPTER: "nope" }, "memory")).toBe("memory");
    });

    it("supports legacy boolean redis adapter flags when adapter is unset", () => {
        expect(getSocketAdapterFromEnv({ HAPPIER_SOCKET_REDIS_ADAPTER: "1" }, "memory")).toBe("redis-streams");
        expect(getSocketAdapterFromEnv({ HAPPY_SOCKET_REDIS_ADAPTER: "true" }, "memory")).toBe("redis-streams");
    });

    it("enables redis streams only when REDIS_URL is present", () => {
        expect(isRedisStreamsEnabled({ REDIS_URL: "" }, "redis-streams")).toBe(false);
        expect(isRedisStreamsEnabled({ REDIS_URL: "redis://localhost:6379" }, "redis-streams")).toBe(true);
        expect(isRedisStreamsEnabled({ REDIS_URL: "redis://localhost:6379" }, "memory")).toBe(false);
    });

    describe("getRelayBufferCapFromEnv", () => {
        it("returns default 500 when RELAY_BUFFER_CAP is absent", () => {
            expect(getRelayBufferCapFromEnv({})).toBe(500);
        });
        it("returns default 500 when RELAY_BUFFER_CAP is empty string", () => {
            expect(getRelayBufferCapFromEnv({ RELAY_BUFFER_CAP: "" })).toBe(500);
        });
        it("returns default 500 when RELAY_BUFFER_CAP is non-numeric", () => {
            expect(getRelayBufferCapFromEnv({ RELAY_BUFFER_CAP: "banana" })).toBe(500);
        });
        it("parses a valid integer string", () => {
            expect(getRelayBufferCapFromEnv({ RELAY_BUFFER_CAP: "200" })).toBe(200);
        });
        it("respects a custom fallback", () => {
            expect(getRelayBufferCapFromEnv({}, 999)).toBe(999);
        });
    });

    describe("getRelayBufferTtlMsFromEnv", () => {
        it("returns default 120000 when RELAY_BUFFER_TTL_MS is absent", () => {
            expect(getRelayBufferTtlMsFromEnv({})).toBe(120_000);
        });
        it("returns default 120000 when RELAY_BUFFER_TTL_MS is empty string", () => {
            expect(getRelayBufferTtlMsFromEnv({ RELAY_BUFFER_TTL_MS: "" })).toBe(120_000);
        });
        it("returns default 120000 when RELAY_BUFFER_TTL_MS is non-numeric", () => {
            expect(getRelayBufferTtlMsFromEnv({ RELAY_BUFFER_TTL_MS: "abc" })).toBe(120_000);
        });
        it("parses a valid integer string", () => {
            expect(getRelayBufferTtlMsFromEnv({ RELAY_BUFFER_TTL_MS: "60000" })).toBe(60_000);
        });
        it("respects a custom fallback", () => {
            expect(getRelayBufferTtlMsFromEnv({}, 30_000)).toBe(30_000);
        });
    });
});

