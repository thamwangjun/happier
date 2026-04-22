export type ReplayGate = {
    isReplaying: boolean;
};

export function createReplayGate(): ReplayGate {
    return { isReplaying: false };
}

export function shouldHoldServerCommit(gate: ReplayGate): boolean {
    throw new Error('not implemented');
}
