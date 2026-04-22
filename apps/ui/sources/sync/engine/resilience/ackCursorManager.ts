import { ACK_DEBOUNCE_MS } from '@happier-dev/protocol';

export type AckFlushState = {
    timer: ReturnType<typeof setTimeout> | null;
    dirty: boolean;
};

export function createAckFlushState(): AckFlushState {
    return { timer: null, dirty: false };
}

export function scheduleAckUpdateFlush(state: AckFlushState, emit: () => void): void {
    state.dirty = true;
    if (state.timer) return;
    state.timer = setTimeout(() => {
        state.timer = null;
        if (!state.dirty) return;
        state.dirty = false;
        emit();
    }, ACK_DEBOUNCE_MS);
}

export function flushAckUpdateNow(state: AckFlushState, emit: () => void): void {
    if (state.timer) {
        clearTimeout(state.timer);
        state.timer = null;
    }
    if (!state.dirty) return;
    state.dirty = false;
    emit();
}
