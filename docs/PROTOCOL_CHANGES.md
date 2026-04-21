# Protocol Changes

Protocol change history is maintained in [docs/protocol.md](./protocol.md).

Each version's new events and schema changes are documented in the corresponding versioned section of that file.

## v1.3 Resilience Events (Request Resilience)

See [docs/protocol.md § v1.3 Resilience Events](./protocol.md#v13-resilience-events-request-resilience) for:

- `reconnect-resume` and `ack-update` client→server events
- `replay-complete` and `buffer-overflow` server→client events
- `ackSeq` optional field added to the update envelope (`UpdateContainerSchema`)
- `ACK_DEBOUNCE_MS = 500` constant exported from `@happier-dev/protocol`
