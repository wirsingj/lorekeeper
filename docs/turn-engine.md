# Turn Engine

`TurnEngine` is the single owner of turn lifecycle state.

```ts
type TurnState =
  | "idle"
  | "awaiting_input"
  | "collecting_inputs"
  | "locked"
  | "rolling"
  | "generating"
  | "awaiting_review"
  | "complete"
  | "error";
```

## Rules

- Only one turn can resolve at a time.
- Every resolving turn has a `turnId`.
- Provider responses must match the active `turnId`.
- Stale provider responses are ignored.
- Cancel clears active provider request state and returns to a safe input state.
- Retry preserves turn context and increments attempt count.
- UI send state is derived from `TurnState`, not ad hoc provider flags.

## App.js Migration

`app/app.js` should stop owning submit locks directly. The send button, nudge button, cancel button, retry button, and repair UI should consume `deriveTurnUiState()` and dispatch engine commands.

## Send/Nudge/Cancel/Retry Cut

The renderer now uses `app/turn-flow-runtime.js` as the app-facing turn controller. That runtime wraps `TurnEngine` and exposes a projection for UI state:

- `canSubmit`
- `canNudge`
- `canCancel`
- `canRetry`
- `hasActiveGeneration`
- `hasRepair`
- `activeRequestId`

`app/app.js` no longer owns `state.activeGeneration` or `state.turnRepair`. Those states live in the runtime. The renderer can still display repair details and diagnostics, but the lifecycle decision is centralized.

## Cancellation And Retry

Cancellation aborts the active provider run and transitions back to a safe input state. A late provider completion after cancellation is ignored by turn/request identity checks.

Retry is only legal after a recoverable error or repair state. Retry during active generation is rejected.

## Stale Response Handling

Provider events must match the active `turnId` and `requestId`. Stale completion, failure, cancellation, or delayed start events are ignored.
