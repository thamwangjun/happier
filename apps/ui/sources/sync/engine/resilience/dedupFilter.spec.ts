import { describe, expect, it } from 'vitest';
import { shouldApplyUpdate } from './dedupFilter';

describe('shouldApplyUpdate', () => {
    it('returns true when seq strictly greater than lastAckedSeq', () => {
        expect(shouldApplyUpdate(5, 4)).toBe(true);
    });

    it('returns false when seq equals lastAckedSeq (already applied)', () => {
        expect(shouldApplyUpdate(4, 4)).toBe(false);
    });

    it('returns false when seq less than lastAckedSeq (stale replay)', () => {
        expect(shouldApplyUpdate(3, 4)).toBe(false);
    });

    it('returns true for first message after init (seq=1, lastAckedSeq=0)', () => {
        expect(shouldApplyUpdate(1, 0)).toBe(true);
    });

    it('returns false when seq=0 and lastAckedSeq=0 (zero seq already at zero)', () => {
        expect(shouldApplyUpdate(0, 0)).toBe(false);
    });
});
