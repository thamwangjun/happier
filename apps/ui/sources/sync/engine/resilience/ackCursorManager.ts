import { ACK_DEBOUNCE_MS } from '@happier-dev/protocol';

export type AckFlushState = {
    timer: ReturnType<typeof setTimeout> | null;
    dirty: boolean;
};

export function createAckFlushState(): AckFlushState {
    return { timer: null, dirty: false };
}

export function scheduleAckUpdateFlush(state: AckFlushState, emit: () => void): void {
    void ACK_DEBOUNCE_MS; // imported — used in GREEN phase
    throw new Error('not implemented');
}

export function flushAckUpdateNow(state: AckFlushState, emit: () => void): void {
    throw new Error('not implemented');
}
