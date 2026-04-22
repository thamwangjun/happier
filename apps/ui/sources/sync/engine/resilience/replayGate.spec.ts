import { describe, expect, it } from 'vitest';
import { createReplayGate, shouldHoldServerCommit } from './replayGate';

describe('createReplayGate', () => {
    it('initializes with isReplaying=false', () => {
        expect(createReplayGate()).toEqual({ isReplaying: false });
    });
});

describe('shouldHoldServerCommit', () => {
    it('returns true when isReplaying=true', () => {
        expect(shouldHoldServerCommit({ isReplaying: true })).toBe(true);
    });

    it('returns false when isReplaying=false', () => {
        expect(shouldHoldServerCommit({ isReplaying: false })).toBe(false);
    });

    it('returns true after mutating gate.isReplaying to true', () => {
        const gate = createReplayGate();
        gate.isReplaying = true;
        expect(shouldHoldServerCommit(gate)).toBe(true);
    });
});
