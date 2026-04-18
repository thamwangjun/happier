# Testing Patterns

**Analysis Date:** 2026-04-18

## Test Framework

**Runner:**
- Vitest — used across all packages (CLI, UI, server, bootstrap, packages/*)
- Root config: `vitest.config.ts` (minimal — primarily controls exclusions)
- Per-package configs: `apps/cli/vitest.config.ts`, `apps/ui/vitest.config.ts`, `apps/server/vitest.config.ts`, `apps/bootstrap/vitest.config.ts`

**Assertion Library:**
- Vitest built-in (`expect`) — no separate assertion library

**Run Commands:**
```bash
# CLI
cd apps/cli && yarn test              # Unit tests only (vitest run)
cd apps/cli && yarn test:unit         # Same as above
cd apps/cli && yarn test:integration  # Integration tests (sharded vitest)

# UI
cd apps/ui && yarn test               # Unit tests (vitest run)
cd apps/ui && yarn test:unit          # Same as above

# Server
cd apps/server && yarn test           # Unit tests (vitest run)
cd apps/server && yarn test:unit      # Same

# From monorepo root
vitest run --config vitest.config.ts  # Root-level run (packages/* only)
```

## Test File Organization

**Location:**
- CLI: Co-located with source files — `src/**/*.test.ts` and `scripts/**/*.test.ts`
- CLI (feature groups): `__tests__/` subdirectory inside feature folder (e.g., `src/agent/acp/__tests__/`)
- UI: Separate `sources/__tests__/` directory mirroring the `sources/app/` route structure; also co-located in `sources/**/*.{spec,test}.{ts,tsx}`
- Server: Co-located with source — `sources/**/*.{test,spec}.ts`

**Naming:**
- Unit tests (CLI/UI): `<filename>.test.ts` or `<filename>.test.tsx`
- Unit tests (server): `<filename>.spec.ts`
- Integration tests: `<filename>.integration.test.ts` or `<filename>.integration.spec.ts`
- Slow tests: `<filename>.slow.test.ts`
- E2E tests: `<filename>.e2e.test.ts`
- Real integration (require live services): `<filename>.real.integration.test.ts`

**Structure:**
```
apps/cli/src/
├── activity/
│   └── notifications/
│       ├── dispatchActivityNotification.ts
│       └── dispatchActivityNotification.test.ts   ← co-located
├── agent/
│   └── acp/
│       ├── AcpBackend.ts
│       └── __tests__/                             ← grouped for large feature
│           ├── AcpBackend.acpFs.test.ts
│           └── AcpBackend.authenticate.test.ts

apps/ui/sources/
├── __tests__/                                     ← separate test directory
│   └── app/
│       └── _layout.test.ts
├── sync/
│   └── acp/
│       ├── configOptionsControl.ts
│       └── configOptionsControl.test.ts           ← co-located (also acceptable)

apps/server/sources/
└── app/
    └── activity/
        ├── accountActivityBadge.ts
        └── refreshAccountActivityBadgePushes.spec.ts  ← co-located
```

## Test Structure

**Suite Organization:**
```typescript
// Import lifecycle hooks and assertion helpers explicitly (globals: false in CLI/UI)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Server uses globals: true — no import needed for describe/it/expect

describe('functionName', () => {
    // Shared spies/mocks declared at suite level
    const fetchSpy = vi.fn();

    beforeEach(() => {
        // Reset and configure mocks
        vi.stubGlobal('fetch', fetchSpy);
        fetchSpy.mockReset();
        fetchSpy.mockResolvedValue({ ok: true, status: 202 });
    });

    afterEach(() => {
        // Clean up global stubs
        vi.unstubAllGlobals();
        vi.resetModules();
    });

    it('describes the expected behavior in plain English', async () => {
        // Arrange
        const result = await functionUnderTest({ /* params */ });

        // Assert
        expect(result).toMatchObject({ /* shape */ });
    });
});
```

**Patterns:**
- `globals: false` in CLI and UI — must import `describe`, `it`, `expect`, `vi` explicitly
- `globals: true` in server — no import needed
- Each suite in `beforeEach` resets all spies: `spy.mockReset()` or `spy.mockClear()`
- `afterEach` with `vi.unstubAllGlobals()` + `vi.resetModules()` for global stubs

## Mocking

**Framework:** Vitest built-in (`vi.mock`, `vi.fn`, `vi.hoisted`, `vi.stubGlobal`)

**Patterns:**

```typescript
// Hoist state that needs to be mutated before module load
const platformState = vi.hoisted(() => ({
    os: 'web' as 'web' | 'ios',
}));

// Mock a module with factory function
vi.mock('socket.io-client', () => {
    const socket = {
        connected: false,
        connect: vi.fn(function connect(this: { connected: boolean }) {
            this.connected = true;
        }),
        on: vi.fn(),
        emit: vi.fn(),
        disconnect: vi.fn(),
    };
    return { io: vi.fn(() => socket) };
});

// Stub global fetch
vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({}) })));

// Use vi.hoisted for mocks that reference module-level mutable state
const dbSessionFindMany = vi.hoisted(() => vi.fn());
vi.mock('@/storage/db', () => ({
    db: { session: { findMany: dbSessionFindMany } },
}));
```

**Mock these:**
- Native modules (expo, react-native, socket.io-client, react-native-mmkv, RevenueCat)
- Global `fetch` for HTTP-dependent code
- Database client (`@/storage/db`) using `createDbMocks` pattern
- Auth context (`@/auth/context/AuthContext`)
- Router (`expo-router`) using `createExpoRouterMock` from testkit
- Logging utilities (`@/utils/logging/log`) to suppress output

**Do not mock these:**
- Pure computation/transformation functions (test directly)
- Protocol/schema parsing from `@happier-dev/protocol` (use real parsers)
- `@happier-dev/agents` registry (use real catalog)

**CLI integration test stance:**
- Per CLI CLAUDE.md: "No mocking — tests make real API calls" for integration tests
- Unit tests do use `vi.fn()` for targeted isolation

## Fixtures and Factories

**Test Data:**
```typescript
// Factory function pattern — overrides spread over defaults
export function createSessionFixture(overrides: Partial<Session> = {}): Session {
    const createdAt = overrides.createdAt ?? 1;
    const updatedAt = overrides.updatedAt ?? createdAt;
    return {
        id: 'session-1',
        seq: 1,
        createdAt,
        updatedAt,
        active: false,
        presence: 'online',
        ...overrides,
    };
}

// DB mock factory pattern (server)
const dbMocks = createDbMocks({
    session: ['findMany'],
    accountPushToken: ['findMany', 'deleteMany'],
} as const);
// All declared methods become vi.fn() instances, reset via dbMocks.reset()
```

**Location:**
- UI testkit fixtures: `apps/ui/sources/dev/testkit/fixtures/` (`sessionFixtures.ts`, `machineFixtures.ts`, `featureFixtures.ts`, `permissionFixtures.ts`, `transcriptFixtures.ts`, `themeFixtures.ts`)
- Server testkit: `apps/server/sources/app/api/testkit/` (`dbMocks.ts`, `requestFixtures.ts`, `routeHarness.ts`, `routeTestBuilder.ts`)
- CLI testkit: `apps/cli/scripts/__tests__/testkit/`
- UI testkit index: `apps/ui/sources/dev/testkit/index.ts` (exports all fixtures, harnesses, mocks, render helpers)

## Coverage

**Requirements:** None enforced (no minimum threshold configured)

**View Coverage:**
```bash
vitest run --coverage
# Reports: text (terminal), json, html
# Coverage provider: v8 (configured per package)
# Excluded: node_modules/**, dist/**, **/*.d.ts, **/*.config.*, **/mockData/**
```

## Test Types

**Unit Tests:**
- Scope: single module or function in isolation
- Include pattern: `src/**/*.test.ts`, `sources/**/*.{spec,test}.{ts,tsx}`
- Timeout: 30s (CLI), 60s (UI), 20s (server)
- Run via `yarn test` or `yarn test:unit`

**Integration Tests:**
- Scope: multi-module interactions; may require real env vars (`.env.integration-test`)
- Named with `.integration.test.ts` / `.integration.spec.ts` suffix
- Excluded from `yarn test:unit`; run via `yarn test:integration`
- CLI integration tests make real API calls — no mocking

**Slow Tests:**
- Named with `.slow.test.ts` suffix
- Excluded from standard unit run
- Used for time-sensitive operations (e.g., `sessionClient.longOfflineReconnect.slow.test.ts`)

**E2E Tests:**
- Named with `.e2e.test.ts` suffix
- Found in CLI backends (e.g., `capability.loadSession.e2e.test.ts`)
- Require actual backend CLIs (claude, opencode, codex, kilo) to be installed

**Feature-Gated Tests:**
- Controlled via `HAPPIER_FEATURE_POLICY_ENV` environment variable
- `resolveVitestFeatureTestExcludeGlobs()` dynamically excludes feature-gated tests
- Used in all vitest configs; default is `HAPPIER_FEATURE_POLICY_ENV=''` (all features enabled)

## Common Patterns

**Async Testing:**
```typescript
it('handles async operations', async () => {
    await dispatchActivityNotificationAsync({ /* params */ });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] ?? [];
    expect(url).toBe('https://example.com');
    expect(JSON.parse(String(init.body))).toMatchObject({ /* shape */ });
});
```

**React Component Testing (UI):**
```typescript
import renderer, { act } from 'react-test-renderer';
import { renderScreen } from '@/dev/testkit';

it('renders without throwing', async () => {
    const { default: RootLayout } = await import('@/app/(app)/_layout');
    let tree: renderer.ReactTestRenderer | undefined;
    try {
        tree = (await renderScreen(React.createElement(RootLayout))).tree;
        expect(() => {
            act(() => { tree!.update(React.createElement(RootLayout)); });
        }).not.toThrow();
    } finally {
        if (tree) { act(() => { tree!.unmount(); }); }
    }
}, 60_000);  // Explicit timeout on slow tests
```

**Error Testing:**
```typescript
it('throws on invalid input', () => {
    expect(() => functionUnderTest(null)).toThrow();
});

it('rejects on async failure', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('Network error'));
    await expect(functionUnderTest()).rejects.toThrow('Network error');
});
```

**Module Reset Pattern (for tests mutating process.env or module state):**
```typescript
afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();  // Required when dynamic import is used inside the test
});

it('uses fresh module state', async () => {
    process.env.SOME_VAR = 'value';
    const { fn } = await import('./myModule');  // Dynamic import picks up env
    fn();
});
```

**Server Route Testing:**
```typescript
// Use FakeRouteApp from routeHarness.ts for server route unit tests
const fakeApp = createFakeRouteApp();
myRoutes(fakeApp);
const handler = fakeApp.routes.get('GET /v1/resource')?.handler;
const result = await handler(request, reply);
expect(result).toMatchObject({ /* expected response */ });
```

## UI Testkit (`apps/ui/sources/dev/testkit/`)

The UI testkit is a comprehensive in-tree library for testing React Native/Expo components in a Vitest node environment. Always import from `@/dev/testkit`.

**Key exports:**
- `renderScreen(element)` — renders a screen using `react-test-renderer`, returns `{ tree }` with extended find/press helpers
- `renderWithAppProviders(element, options)` — wraps element in app-level providers
- `createSessionFixture(overrides)`, `createMachineFixture(overrides)` — typed fixture factories
- `createExpoRouterMock({ router, params, segments, ... })` — mock expo-router module
- `createReactNativeWebMock(overrides)` — mock react-native for web/node environment
- `createUnistylesMock({ theme })` — mock react-native-unistyles
- `createTextModuleMock({ translate })` — mock `@/text` i18n module
- `createModalModuleMock({ spies })` — mock `@/modal` Modal manager
- `standardCleanup()` — resets all standard mocks/stubs between tests
- `renderHook(fn)` — renders a React hook in isolation

**Expo/RN stubbing strategy:**
- Numerous native Expo modules are stubbed via Vite resolve aliases in `apps/ui/vitest.config.ts`
- Custom plugin `happier-vitest-expo-node-module-stubs` resolves workspace packages from source
- Stubs located in `apps/ui/sources/dev/` (e.g., `expoModulesCoreStub.ts`, `reactNativeStub.ts`)

---

*Testing analysis: 2026-04-18*
