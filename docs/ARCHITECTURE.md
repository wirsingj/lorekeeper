# LoreKeeper Architecture

Updated: 2026-06-19

This is the durable architecture guide for LoreKeeper. Keep this file and `docs/state-of-the-table.md` as the main references. The State of the Table is the working checklist; this file explains where code lives, who owns what, and which boundaries matter most. `docs/MAINTAINER_GUIDE.md` is the practical command/debug/playbook map for future maintainers, and `docs/living-world.md` explains long-term continuity memory.

## Product Shape

LoreKeeper is a local-first tabletop RPG app. It can host a campaign with a local AI provider, or serve a same-network guest page for remote players.

The north-star table model is:

- the host is a party member plus the software-side table owner for setup, invites, provider access, recovery decisions, and persistence,
- the provider/DM Voice is the DM at the table,
- the app owns canon, rules, persistence, authority, and recovery rails,
- the provider owns narration, atmosphere, NPC behavior, and proposed state changes inside those rails,
- party members are player-facing table voices with controller ownership,
- SQLite/app state is canon; provider memory is only scratch context.

## Runtime Surfaces

Electron desktop:

- `electron/main.js` creates the desktop window, starts the local server, handles `lorekeeper://join` links, and launches the Vite-built app.
- `electron/preload.cjs` exposes a tiny safe bridge to the renderer.

Local HTTP server:

- `scripts/serve.js` serves the app, campaign data APIs, provider APIs, local multiplayer APIs, guest pages, assets, diagnostics, and storage-backed mutations.
- The server still has transitional active-campaign APIs, but multiplayer routes now validate explicit campaign/table/session identity before mutating.
- Host New uses a temporary in-memory pre-table lobby owned by `scripts/serve.js` so plain `/guest` can show unsaved draft Remote Invite seats. This draft is not canon; waiting guests and host-approved draft seat reservations are adopted into the active campaign/table when Create And Start opens the real local table.

Renderer:

- `app/App.jsx` is mostly static JSX for the shell, front door, table view, join view, setup dialogs, and rails.
- `app/app.js` wires DOM events, renderer state, fetch calls, render functions, provider turns, multiplayer actions, and recovery flows. This is still the largest risk/god file.
- Smaller `app/*controller.js` modules hold projections and policies that have been extracted from `app.js`.

Domain engine:

- `src/engine/*` owns deterministic tabletop rules, turn state, combat state, scene retrieval, consequences, agency checks, and provider orchestration.
- `src/rules/*` owns deterministic tabletop rule helpers that are not renderer-specific, including 5E-lite character sheet seed/profile/equipment/spell policy.
- `src/campaign-state/*` owns campaign shape, normalization, direct record mutations, review logs, and canonical change application.
- `src/storage/*` owns campaign file persistence, SQLite import/export, migrations, and review commits.
- `src/model-contract/*` owns provider response validation, rendering, fixtures, and agency guard rails.
- `src/multiplayer/*` owns invites, table identity, waiting-room guests, guest snapshots, staged inputs, table talk, and seat assignments.
- `src/observability/*` owns internal trace/log helpers used by diagnostics and automation harnesses. These hooks are hidden/internal, not player-facing UI.

Tests:

- `scripts/test-engine-architecture.js` is the broad engine/app-policy regression suite.
- `scripts/test-json-contract.js` exercises provider JSON, agency, hidden-story leakage, and rendered DM response behavior.
- `scripts/test-multiplayer.js` exercises local table authority, guest joins, stale links, votes, disconnect/reconnect, and session isolation.
- `scripts/test-sqlite-storage.js` exercises SQLite persistence, migrations, logs, errors, and bounded query helpers.
- `scripts/test-server-security.js` and `scripts/test-server-integration.js` cover route exposure and real HTTP mutation behavior.
- `scripts/test-high-risk-regressions.js` is the small fast pack for scary changes: provider rejection, stale guest identity, controlled-PC agency, combat narration-only advancement, staged input preservation, campaign switch wiring, and delete recycling.
- `scripts/test-observability.js` covers the internal trace ring, redaction, bounded retention, and error serialization.
- `scripts/test-ui-flow.js` is an opt-in Playwright scenario harness for hidden UI automation/introspection; it is not part of shipped player UI and is not in `test:all`.

## Identity And Authority

Do not rely on "the active campaign" for multiplayer behavior.

Campaign:

- `campaignId`
- long-lived canonical world state,
- owns durable party, records, scenes, consequences, combat, provider settings, logs, and notes.

Table:

- `tableId`
- active table for a campaign,
- owns seats, invites, waiting guests, table talk, staged actions, and table-facing projections.
- Host New drafts temporarily use draft table ids so guests can request or reserve seats before the campaign exists; those ids must be replaced by real active-table ids before any canonical mutation.

Session:

- `sessionId`
- live host runtime instance,
- owns LAN guest links, guest heartbeats, connection validity, and stale-link rejection.

Every multiplayer request should be able to answer:

- Which campaign owns this?
- Which table owns this?
- Which live host session owns this?
- Which guest/client/seat is authorized to act?

Renderer state is never authority. It can hold selected views, form drafts, local convenience caches, and display projections. Server/domain modules must validate ownership before persistence.

## Canon Lifecycle

Canon changes should flow through these stages:

1. Player, guest, AI companion, combat, or DM action enters the table.
2. The app builds a context pack and provider task.
3. Provider returns narration and optional structured changes.
4. Provider output is validated.
5. Valid state changes become proposed review changes, auto-approved safe changes, or repair-needed diagnostics.
6. Approved changes commit into campaign state.
7. SQLite persists canon, logs, provider diagnostics, errors, and review records.

Provider text can enrich play, but provider text alone should not silently mutate critical state.

## Important Ownership Boundaries

`CampaignStateStore`

- Intended owner for canonical campaign state transitions.
- Still underused by live renderer paths; many routes still load/update whole active campaigns.

`TurnEngine`

- Owns deterministic turn lifecycle states.
- Renderer still carries helper state around current turns and recovery.

`CombatEngine`

- Owns app-resolved combat mechanics, legal actions, rolls, effects, HP, conditions, and initiative advancement.
- Owns active-turn economy for resolved party combat turns: action, bonus action, reaction, and movement costs are validated before resolution and logged with the combat action.
- Provider may narrate combat, but should not be the authority for app-owned mechanics.
- Provider-import combat fallback policy lives in `app/combat-import-controller.js`; it may synthesize combat start/sync/advance changes only from explicit hostile signals, inferred enemies, and resolved active-actor mechanics, never from loose narration phrasing alone.

`AgencyController` and model contract validation:

- Decide whether a party member can be acted for by provider output.
- Host/remote/unassigned party members cannot receive invented speech, thoughts, scouting, resolve, body language, or purposeful action unless their controller submitted it.

`ProviderOrchestrator`

- Owns provider request lifecycle, request ids, stale response rejection, and local generation events.
- Provider imports still need fuller table/session envelopes end to end.

`TableSessionEngine`

- Lives in `src/engine/table-session-engine.js`.
- Consumes campaign, turn, combat, provider, review, recovery, guest, and multiplayer state.
- Produces the unified table phase used by diagnostics/status surfaces: idle, roleplay, waiting for player, waiting for guest, waiting for DM, party vote, combat, host review, and recovery.
- Does not replace TurnEngine, CombatEngine, AgencyController, or multiplayer authority. It is a table-experience projection over them.

`TableDebugSnapshot`

- Lives in `src/engine/table-debug-snapshot.js`.
- Produces the compact diagnostics blob used by renderer and server diagnostics.
- Captures campaign/table/session identity, table phase, active turn/actor/controller, provider state, combat state, staged guest inputs, review/recovery state, and recent errors.
- This should stay pure and redaction-friendly so it remains safe to copy during a stuck session.

`ObservabilityTrace`

- Lives in `src/observability/trace-log.js`.
- Provides bounded in-memory traces for API requests, provider prompt/response lifecycle, and internal debugging hooks.
- Server diagnostics expose it under `observability.serverTrace`; `/api/diagnostics/trace` and `/api/diagnostics/trace/clear` are hidden, host-authorized debugging endpoints.
- Keep this internal. Do not add player-facing controls or rely on it as campaign canon.

`LivingWorldEngine`

- Lives in `src/engine/living-world-engine.js`.
- Derives long, medium, and short-term goal horizons from explicit goals, quest/thread records, hidden DM story arcs, and current scene goals.
- Projects NPC, faction, location, relationship, and consequence memory so provider requests can use durable world facts before recent-message noise.
- Produces an internal living-world score: if the same NPC, faction, or place appears later, would they react differently because of prior play?

`RelationshipEngine`

- Lives in `src/engine/relationship-engine.js`.
- Normalizes relationship records and applies durable relationship-state transitions such as neutral -> respectful -> friendly -> loyal or neutral -> distrustful -> fearful/hostile.
- `src/campaign-state/apply-changes.js` routes relationship-shaped reviewed changes through this engine so provider proposals become structured memory instead of loose notes.

`WorldMemoryEngine`

- Lives in `src/engine/world-memory-engine.js`.
- Normalizes durable faction memory/beliefs and location memory/scars/history.
- `src/campaign-state/apply-changes.js` routes faction/place memory-shaped reviewed changes through this engine so recurring places and factions carry visible history.

`MultiplayerSessionEngine` target:

- Not yet a single explicit module, but `src/multiplayer/local-table.js` is the current authority center.
- Should eventually own session identity, seats, guests, approvals, connection recovery, and staged action lifecycle as a clearer engine.

UI projections:

- `app/*controller.js` files should keep growing as small projection/policy modules.
- `app/message-block-controller.js` owns DM/provider play-message block parsing: prose grouping, mechanics block extraction, parsed choice panels, structured choice override, and latest-choice lookup. `app/app.js` should render the returned blocks, not parse provider text.
- `app/provider-settings-controller.js` owns DM Voice settings projections: provider defaults, campaign-creation model fallback, Ollama status labels, setup hints, model option labels, and model summary chips. `app/app.js` should read/write controls and render projections, not import recommended-model policy directly.
- `app/renderer-diagnostics-controller.js` owns renderer diagnostics serialization, debug play-log message normalization, session-health projection, readable table timeline projection, and turn-flow timeline wording. `app/app.js` should provide current state/elements and render the returned projections.
- Prefer extracting pure decisions into these modules with tests before adding more branches to `app/app.js`.

## Storage Model

Campaigns persist as SQLite-backed local files under the app data area.

Important storage modules:

- `src/storage/campaign-repository.js`: load/save campaign files and app-owned imported assets.
- `src/storage/sqlite-store.js`: serialize/deserialize campaign snapshots and query bounded logs/records.
- `src/storage/sqlite-migrations.js`: schema version checks and future migration spine.
- `src/storage/review-commit.js`: commit reviewed changes into canonical campaign state.

SQLite stores:

- campaign snapshot,
- session/play messages,
- provider events,
- errors,
- review batches and proposed changes,
- dice rolls,
- combat actions,
- state effects,
- player notes.

Deletion currently recycles SQLite/WAL/SHM files into `data/campaigns/.deleted/...` for manual recovery instead of hard-deleting immediately.

## Provider Model

Provider support lives in:

- `src/ai/provider-service.js`
- `src/ai/ollama-provider.js`
- `src/ai/bridge-provider.js`
- `src/ai/ollama-context-cache.js`
- `src/engine/provider-orchestrator.js`

The app supports local Ollama and manual bridge mode. Qwen-style models use special handling such as no JSON mode and `/no_think` where needed.

Provider memory/context keys may warm up a model per campaign, but app/SQLite state must remain the source of truth. Never depend on provider memory for canon or isolation.

## Multiplayer Model

Same-network guests open:

```text
http://<host-lan-ip>:<port>/guest
```

The guest page can show the active table, available non-host seats, and a waiting room. Fixed join-as links still exist as an advanced bypass, but normal flow should use the waiting room.

Security rules:

- public guest routes validate campaign/table/session identity and guest secrets,
- host routes require host authorization,
- stale `campaignId`, `tableId`, or `sessionId` must reject instead of applying to the active table,
- guest leave should release the remote controller back to host control and make the seat requestable again.

## UI Model

Front door:

- Host existing campaign,
- Host New setup workspace,
- Join hosted table,
- Provider/App setup.

Table view:

- left rail: campaign controls, party, combat,
- center: play log and command deck,
- right rail: Campaign Notes, Player Notes, Table Talk.

Ordinary play should avoid implementation language such as JSON, import, sync, or contract unless the user opens diagnostics.

## Readability Landmarks

Start here when making changes:

- UI shell/layout: `app/App.jsx`, `app/styles.css`
- Main UI behavior: `app/app.js`
- Maintainer commands/playbooks: `docs/MAINTAINER_GUIDE.md`
- Living world continuity model: `docs/living-world.md`, `src/engine/living-world-engine.js`
- Relationship continuity transitions: `src/engine/relationship-engine.js`
- Faction/location durable memory: `src/engine/world-memory-engine.js`
- One-blob state debugging: `src/engine/table-debug-snapshot.js`, diagnostics `debugSnapshot`
- Internal trace/debug harness: `src/observability/trace-log.js`, `scripts/inspect-diagnostics.js`, `scripts/test-ui-flow.js`
- Provider import/recovery wording: `app/provider-import-controller.js`, `app/turn-repair-controller.js`, `app/staged-input-recovery-controller.js`
- Stale combat prompt repair: `app/combat-prompt-repair-controller.js`
- Provider-import combat fallback guardrails: `app/combat-import-controller.js`
- Provider-import scene fallback guardrails: `app/scene-import-controller.js`
- Play log rendering: `app/play-log-controller.js` plus render functions in `app/app.js`
- Character creation/autocomplete: `app/character-autocomplete-controller.js`
- Local multiplayer: `src/multiplayer/local-table.js`, `scripts/serve.js`, `app/multiplayer-session-panel.js`
- Renderer campaign adoption/background polling policy: `app/campaign-adoption-controller.js`, `app/table-background-polling-controller.js`
- Combat: `src/engine/combat-engine.js`, `src/rules/combat-turns.js`, `app/combat-resolution-controller.js`
- Provider contract/agency: `src/model-contract/turn-json-contract.js`
- SQLite: `src/storage/sqlite-store.js`, `src/storage/sqlite-schema.sql`, `src/storage/sqlite-migrations.js`
- State shape: `src/campaign-state/schema.js`

## Known Architecture Debt

1. `app/app.js` is still too large and owns too much orchestration.
2. `scripts/serve.js` is also large and mixes routing, validation, storage calls, and local table behavior.
3. Some live paths still hydrate whole campaign snapshots instead of using bounded SQLite query helpers.
4. Provider import/generation is not fully table/session-scoped end to end.
5. Settings are still physically one dialog, even though app-level and campaign-level settings are conceptually separate.
6. Pre-table remote seating is safer now for Host New draft seat requests/reservations, but guest-editable character drafts are still missing and the draft lobby remains transitional `scripts/serve.js` state rather than a durable pre-table domain model.

When in doubt, prefer extracting a pure policy/projection into a small module with tests over adding more conditional logic to `app/app.js` or `scripts/serve.js`.
