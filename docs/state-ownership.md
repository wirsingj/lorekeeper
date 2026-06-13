# State Ownership

## Ownership Table

| Concern | Owner | Notes |
| --- | --- | --- |
| Durable campaign canon | SQLite | Whole campaign snapshots remain supported; effect/event logging is the next persistence upgrade. |
| In-memory campaign projection | `CampaignStateStore` | Emits state events and applies validated effects. No provider logic. |
| Dice rolls | `DiceEngine` | App-owned, deterministic when seeded, visible roll records. |
| Turn lifecycle | `TurnEngine` | Prevents double-submit, stale-submit, and unexplained disabled UI. |
| Combat state | `CombatEngine` | Owns initiative, current actor, legal actions, effects, and advancement. |
| Actor control | `AgencyController` | Separates canon party members from temporary controllers/seats. |
| Provider text | `ProviderOrchestrator` | Readonly context in, narration/suggestions/proposed changes out. |
| Guest inputs | `MultiplayerSessionEngine` | Host authoritative. Guests do not mutate SQLite. |

## State Effects

Canon changes should pass through validated state effects:

```ts
type StateEffect =
  | { type: "hp_delta"; targetId: string; amount: number; reason: string }
  | { type: "condition_add"; targetId: string; condition: string; reason: string }
  | { type: "condition_remove"; targetId: string; condition: string; reason: string }
  | { type: "resource_delta"; targetId: string; resource: string; amount: number; reason: string }
  | { type: "position_note"; targetId: string; note: string }
  | { type: "inventory_add"; targetId: string; itemId: string; reviewRequired: boolean }
  | { type: "quest_note"; questId: string; note: string; reviewRequired: boolean };
```

Provider output can propose effects, but app code validates and applies them. Review-required effects are queued, not silently persisted.

## Provider Boundary

Provider chat history is not canon. Provider responses are never trusted as state. A valid provider response may contain:

- narration
- dialogue
- suggested actions
- proposed lore updates
- proposed reviewed changes

It may not directly advance turns, spend resources, apply HP damage, assign controllers, or mutate SQLite.

## Current Send Flow

Send/nudge/cancel/retry ownership is now split cleanly:

- `app/app.js` collects input and renders UI.
- `TurnFlowRuntime` coordinates turn lifecycle projection for the renderer.
- `TurnEngine` owns lifecycle transitions and stale event rejection.
- `ProviderOrchestrator` owns provider execution and cancellation.
- `importProviderResponse` remains the app-side import/review handoff.

Provider completion can create review items or import accepted narration, but it does not directly mutate canon outside the existing import/review path.

## Schema 2.0 Logs

Campaign state now includes engine-aligned logs:

- `turnLog`
- `diceLog`
- `stateEffectLog`
- `combatActionLog`
- `providerEventLog`

SQLite also stores these in normalized schema 2.0 tables for audit and future context retrieval. The
current writer still persists the whole campaign snapshot atomically; normalized tables are the
queryable/auditable mirror.
