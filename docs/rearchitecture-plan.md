# LoreKeeper Rearchitecture Plan

## Blunt Review

`app/app.js` is doing too much. It currently acts as the renderer, state store, turn coordinator, provider orchestrator, combat repair layer, multiplayer coordinator, and UI projection layer. That is the root cause behind the recent class of bugs: stalled turns, stale player inputs, combat turns that do not advance, duplicated option panels, provider repair loops, and unclear host/guest agency.

The provider has also been allowed too close to the game engine. It can narrate beautifully, but it should not be the state machine. Hidden provider prose cannot be the source of truth for HP, initiative, turn ownership, resources, or multiplayer readiness.

## Target Shape

LoreKeeper should be a local-first D&D 5E-lite table engine:

- SQLite owns durable canon.
- `CampaignStateStore` owns the in-memory projection of canon.
- `TurnEngine` owns turn lifecycle and submit locks.
- `CombatEngine` owns initiative, legal actions, dice-triggering, HP/resource effects, and turn advancement.
- `DiceEngine` owns rolls and visible roll records.
- `AgencyController` owns who can act for each actor.
- `ProviderOrchestrator` owns focused provider tasks and response matching, but never mutates canon.
- `MultiplayerSessionEngine` owns host authority, seats, invites, and pending remote inputs.
- UI renders derived engine state.

## App.js Breakup

`app/app.js` should become a composition shell:

1. Create/load campaign state.
2. Construct engines.
3. Subscribe UI rendering to engine/store events.
4. Wire DOM events to engine commands.
5. Display derived UI state.

The following logic must move out of `app.js`:

- Provider request construction and stale response checks.
- Turn submission locks and recovery.
- Combat initiative and turn resolution.
- Dice and mechanics.
- Agency checks for host, guest, AI companion, and NPC control.
- Multiplayer invite, seat, approval, and pending input state.
- Repair/import logic for malformed provider results.

## Migration Phases

1. Add engine modules and tests without changing the whole UI at once.
2. Move send/nudge/cancel/retry into `TurnEngine` + `ProviderOrchestrator`.
3. Move combat mode UI and action resolution onto `CombatEngine`.
4. Move party card controller labels/actions onto `AgencyController`.
5. Move host/guest state onto `MultiplayerSessionEngine`.
6. Shrink `app.js` by deleting migrated branches and replacing them with engine calls.
7. Keep SQLite snapshot compatibility while adding effect logs for better recovery.

## Acceptance Bar

The app is ready for broad testing again when:

- Starting or reopening a campaign never leaves the last user message as an unexplained stuck state.
- Send/nudge/cancel/retry are enabled or disabled only by explicit `TurnState`.
- Combat always has an active actor and initiative order.
- Player combat actions produce app-owned roll records and app-owned HP/resource effects.
- Provider responses with stale turn ids are ignored.
- Provider output cannot directly mutate SQLite canon.
- Guest input is staged by the host unless combat settings explicitly allow immediate resolution.

## Remaining Risk

This first architecture slice does not rewrite all of `app/app.js`. That should be done progressively, because a single large renderer rewrite would likely break the app while bugs are already hot. The important shift is that new logic now has a stable engine layer to move into.
