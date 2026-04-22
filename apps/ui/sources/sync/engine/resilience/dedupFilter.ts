export function shouldApplyUpdate(seq: number, lastAckedSeq: number): boolean {
    return seq > lastAckedSeq;
}
