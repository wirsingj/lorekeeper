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
