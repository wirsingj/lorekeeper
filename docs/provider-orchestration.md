# Provider Orchestration

The provider is a creative DM assistant, not the state machine.

## Focused Tasks

Supported task shapes:

- `generate_scene_beat`
- `narrate_resolved_action`
- `choose_npc_intent`
- `suggest_ai_companion_action`
- `summarize_recent_play`
- `propose_lore_updates`
- `repair_bad_json`

Each provider request should include:

- task type
- active turn id
- current mode
- readonly scene summary
- active actor summary
- relevant recent messages
- compact combat state when relevant
- output contract
- mutation policy

## Response Rules

- Response `turnId` must match active turn id.
- Narration is display text.
- Suggestions are optional UI choices.
- Proposed changes are reviewed and validated.
- Provider responses do not write SQLite.
- Provider responses do not advance combat turns.
- Provider responses do not apply HP/resource changes.

## Failure Rules

Timeout, cancellation, invalid JSON, and empty response must leave the app in a recoverable `TurnState`. The app should retain the mechanical result if mechanics already resolved.

## Execution Ownership

`ProviderOrchestrator` now owns local provider execution for Ollama-style generation:

- creates the `AbortController`
- owns timeout aborts
- reads NDJSON stream events
- emits typed provider lifecycle events
- renders structured model output for import handoff
- reports validation failures as recoverable generation failures

The renderer supplies app-specific adapters, such as contract validation and response import. The orchestrator does not write campaign state.

## Provider Events

```ts
type ProviderEvent =
  | { type: "generation_started"; turnId: string; requestId: string }
  | { type: "generation_delta"; turnId: string; requestId: string; textDelta: string }
  | { type: "generation_completed"; turnId: string; requestId: string; response: unknown }
  | { type: "generation_failed"; turnId: string; requestId: string; error: string; recoverable: boolean }
  | { type: "generation_cancelled"; turnId: string; requestId: string; reason: string };
```

`TurnEngine` consumes these events and decides lifecycle transitions.
