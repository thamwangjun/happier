import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACK_DEBOUNCE_MS } from '@happier-dev/protocol';
import { createAckFlushState, flushAckUpdateNow, scheduleAckUpdateFlush } from './ackCursorManager';

describe('scheduleAckUpdateFlush', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('does not call emit immediately', () => {
        const state = createAckFlushState();
        const emit = vi.fn();
        scheduleAckUpdateFlush(state, emit);
        expect(emit).not.toHaveBeenCalled();
    });

    it('calls emit once after ACK_DEBOUNCE_MS elapses', async () => {
        const state = createAckFlushState();
        const emit = vi.fn();
        scheduleAckUpdateFlush(state, emit);
        await vi.advanceTimersByTimeAsync(ACK_DEBOUNCE_MS);
        expect(emit).toHaveBeenCalledTimes(1);
    });

    it('calling twice before timer fires only calls emit once (dirty flag idempotency)', async () => {
        const state = createAckFlushState();
        const emit = vi.fn();
        scheduleAckUpdateFlush(state, emit);
        scheduleAckUpdateFlush(state, emit);
        await vi.advanceTimersByTimeAsync(ACK_DEBOUNCE_MS);
        expect(emit).toHaveBeenCalledTimes(1);
    });

    it('calling after timer fires schedules a new debounce', async () => {
        const state = createAckFlushState();
        const emit = vi.fn();
        scheduleAckUpdateFlush(state, emit);
        await vi.advanceTimersByTimeAsync(ACK_DEBOUNCE_MS);
        expect(emit).toHaveBeenCalledTimes(1);

        scheduleAckUpdateFlush(state, emit);
        await vi.advanceTimersByTimeAsync(ACK_DEBOUNCE_MS);
        expect(emit).toHaveBeenCalledTimes(2);
    });
});

describe('flushAckUpdateNow', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('calls emit synchronously when dirty=true', () => {
        const state = createAckFlushState();
        state.dirty = true;
        const emit = vi.fn();
        flushAckUpdateNow(state, emit);
        expect(emit).toHaveBeenCalledTimes(1);
    });

    it('does not call emit when dirty=false (no-op)', () => {
        const state = createAckFlushState();
        state.dirty = false;
        const emit = vi.fn();
        flushAckUpdateNow(state, emit);
        expect(emit).not.toHaveBeenCalled();
    });

    it('clears pending timer and emits immediately when called with timer in-flight', async () => {
        const state = createAckFlushState();
        const emit = vi.fn();
        scheduleAckUpdateFlush(state, emit);
        // Timer is in-flight — flush synchronously before debounce fires
        flushAckUpdateNow(state, emit);
        expect(emit).toHaveBeenCalledTimes(1);
        // Advancing timer should NOT trigger a second emit
        await vi.advanceTimersByTimeAsync(ACK_DEBOUNCE_MS);
        expect(emit).toHaveBeenCalledTimes(1);
    });
});
