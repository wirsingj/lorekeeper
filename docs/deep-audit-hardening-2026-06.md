# LoreKeeper Deep Audit And Hardening Pass

Date: 2026-06-16

This audit treats LoreKeeper as a real product approaching external users. The question is not whether the current demo works; it is whether campaigns can survive months of play, hostile inputs, weak local models, reconnects, old saved state, and multiple simultaneous tables without becoming unmaintainable or unrecoverable.

## Executive Summary

LoreKeeper has a solid product direction and several good architectural seeds: campaign state helpers, engine modules, provider contracts, recovery paths, structured SQLite projections, and a safer Electron baseline. It is not yet architecturally mature enough for many long-running campaigns or many local multiplayer tables.

The largest risk is ownership drift. `app/app.js` is still a god object that owns rendering, state mutation orchestration, provider lifecycle, recovery UI, multiplayer polling, campaign selection, combat repairs, and table flow. The second largest risk is table/session routing: the local server still mostly acts on the active campaign instead of receiving an explicit table/campaign identity on every meaningful request.

The highest-value hardening fix implemented in this pass scopes generated Guest Links to a specific local-table session. A stale guest link can no longer silently attach a waiting player to whatever campaign happens to be active after the host switches tables.

## Risk Ranking

### Critical

- `app/app.js` is over 10k lines and remains the practical authority for too many unrelated systems. This makes product bugs hard to reason about and makes regression risk high.
- Server-side multiplayer routing is still too coupled to the active campaign process. Guest registration/status now verifies a table session key, but most routes still depend on global host state instead of explicit table/campaign identity.
- Long campaign durability depends heavily on full campaign snapshots. There is no append-only authoritative event log that can replay or repair state transitions.

### High

- `src/multiplayer/local-table.js` is also oversized and mixes protocol, authorization, mutation, projection, and table-log behavior.
- Provider output is constrained and recoverable, but repair/import flows can still become too important. The model should never become authority; every proposed change needs deterministic engine validation.
- Play log and session messages are not designed yet for hundreds of hours of play. Rendering and persistence will degrade before the product goal is reached.
- Route-level integration coverage is thin for host/guest authorization, reconnect, campaign switch, and stale request handling.

### Medium

- `src/model-contract/turn-json-contract.js` is large enough to hide duplicated validation and policy details.
- SQLite has useful tables, but the canonical state is still the snapshot blob. Structured tables are projections more than a durable domain model.
- Legacy naming and architecture from ThinLoreKeeper still appear in internals/docs and can confuse future ownership.
- Diagnostics are useful, but the difference between recovery, model repair, sync, resync, and import is still too technical.

### Low

- No circular source dependencies were found in the sampled dependency scan.
- Electron security baseline is meaningfully better than many early apps: context isolation, sandboxing, restricted navigation, no renderer Node integration, and a narrow preload bridge are already in place.

## Phase Findings

### 1. Codebase Audit

The codebase has grown around a working prototype faster than its ownership boundaries have hardened. The biggest files are the biggest risks:

- `app/app.js`: UI, table orchestration, provider flow, recovery, campaign lifecycle, multiplayer polling, combat UI, import/export, and settings.
- `src/multiplayer/local-table.js`: local table domain model plus transport-ish behavior plus projection and host/guest mutation helpers.
- `src/model-contract/turn-json-contract.js`: provider contract, validation rules, repair shaping, and fallback behavior.
- `scripts/serve.js`: static server, API routing, campaign loading/saving, provider routes, multiplayer routes, and diagnostics.

There is not much evidence of abandoned circular architecture, but there is evidence of accumulated responsibility. The code is understandable today because context is fresh; it will not stay that way without extraction.

### 2. Architecture Audit

The intended ownership model is correct:

- `CampaignStateStore` owns canonical persistence.
- `TurnEngine` owns turn lifecycle.
- `CombatEngine` owns initiative, actions, effects, and combat transitions.
- `DiceEngine` owns rolls.
- `AgencyController` owns who can act.
- `ProviderOrchestrator` owns model calls and recovery.
- `MultiplayerSessionEngine` owns host/guest session state.
- `SceneEngine` and `ConsequenceEngine` own story state and consequences.
- UI owns projections and interaction, not domain truth.

The current implementation only partially matches that target. Engines exist, but `app/app.js` and `scripts/serve.js` still coordinate or mutate too much. State transitions are not always visibly deterministic from one owner. Provider output is usually treated as proposed content, but the surrounding repair/import path is still too powerful and too UI-owned.

### 3. State Audit

Canonical state today is the campaign snapshot in SQLite. Derived state includes binder tables, local multiplayer projections, diagnostics, provider context packs, and renderer UI state.

Drift risks:

- Active campaign state lives at process level and is implicitly used by several APIs.
- Renderer state, server state, guest waiting-room local storage, and SQLite snapshots can disagree during reconnects or campaign switches.
- Provider context keys are useful but intentionally non-authoritative; they must never become required for correctness.
- Long play logs and message lists can grow without a durable paging strategy.

Implemented mitigation: generated Guest Links now carry a local-table session key and guest waiting-room register/status requests validate it.

### 4. Security Audit

Electron is in decent shape. Browser windows use sandboxing and context isolation; preload exposure is narrow; navigation and permission prompts are constrained.

Server/API risks remain more significant. Local guest routes must be public enough to work on a LAN, but public LAN endpoints need explicit table/session identity and host authority checks. The session-key fix reduces accidental cross-table joins, but every guest mutating route should eventually validate the same table identity, campaign identity, guest identity, and assigned character authority.

Provider risk is mostly malformed output, not malicious code execution. The product must assume local models will return empty text, invalid JSON, prompt-injected instructions, duplicated options, wrong speakers, or impossible combat edits. The validation/recovery machinery is a good start; the hard rule should be that provider output can narrate and propose, while engines decide.

### 5. Performance Audit

The first performance break will likely be long-session rendering and whole-snapshot persistence. Risks:

- Full play log rendering and scroll behavior will degrade with thousands of messages.
- Whole campaign snapshot writes make every save scale with campaign size.
- Diagnostics and provider logs can become large quickly.
- Multiplayer polling is simple and stable for a small table but wasteful across many tables.
- Binder/retrieval projections need indexes and query discipline before thousands of entities.

### 6. Database Audit

SQLite is the right storage choice for local-first campaigns, but the schema is still transitional. It has snapshot storage, structured records, logs, provider errors, session messages, and projections. That is useful, but it needs clearer separation between:

- authoritative event log,
- current snapshot,
- derived projections,
- diagnostics/errors,
- provider interaction records.

Recommended database direction: append authoritative domain events first, update snapshots/projections second, and compact snapshots periodically. This gives recovery, auditability, replay, and better debugging for long campaigns.

### 7. Multiplayer Audit

Host authority is the right model and is mostly respected. The dangerous mismatch was guest waiting state being tied to the host's active campaign instead of a specific table session. That was fixed for waiting-room register/status links in this pass.

Remaining multiplayer risks:

- Campaign switch while guests are connected.
- Reconnect after host restart.
- Orphaned pending actions after guest disconnect.
- Guest action submitted after character ownership changes.
- Combat turn continuing after party ownership changes.
- Multiple LAN tables in one app process.

### 8. Combat Audit

Combat has moved in the right direction: initiative and actions should be engine-owned, and the provider should narrate consequences rather than invent authoritative mechanical state. Remaining risk is any pathway where imported provider output can advance turn order, create enemies, remove combatants, or apply effects without engine validation.

Combat needs route-level and engine-level tests for initiative creation, hidden/enemy insertion, dead/downed state, skipped turns, invalid targets, remote-player turns, and provider failure mid-round.

### 9. RP / DM Audit

The richer model output from stronger local models confirms the product idea: good providers make the table feel dramatically better. The architecture still needs to ensure story continuity does not depend on model memory.

Weaknesses:

- Scene purpose and story threads need to be explicitly maintained as hidden state.
- NPC motivations and consequences need retrieval hooks, not just prompt prose.
- AI party members need controlled agency, not random unsolicited noise.
- DM targeting needs first-class state: party question, specific character prompt, table vote, private/host-visible debug state.

### 10. UX Audit

The app has improved, but recent bugs were avoidable UX flow problems. The main issue is that system state is still leaking into the experience: old table context behind menus, unclear host selection, vague seating errors, and technical settings language.

UX priority should be:

- start at a clean front door,
- explicitly choose Host or Join,
- explicitly choose or create a campaign,
- show guests waiting where the host naturally looks,
- make invite/seat ownership obvious,
- keep recovery language calm and human.

### 11. Immersion Audit

The D&D table metaphor is the correct north star. Immersion breaks when:

- the DM posts as the wrong speaker,
- party members disappear into technical ownership states,
- combat starts with only the party,
- guest waiting/seat state is invisible,
- model repair/debug text appears in the fiction,
- the app asks the user to understand sync machinery.

The app should feel like people around a table and a DM keeping the world coherent. Anything else belongs in diagnostics, not the play surface.

### 12. Test Audit

Current tests cover important engines and regressions, but the weakest area is integrated lifecycle behavior. Missing coverage:

- host starts table, guest waits, host seats guest, guest acts,
- campaign switch with stale guest link,
- guest disconnect/reconnect,
- provider returns empty/invalid/wrong-role output,
- combat starts with enemies and party,
- imported old campaign migration,
- long play-log paging,
- route authorization and stale request rejection.

### 13. Hardening Implemented

Implemented in this pass:

- Local table sessions now receive a generated `sessionId`.
- Generated Guest Links include `?table=<sessionId>`.
- Guest waiting-room registration sends the table session key.
- Guest waiting-room heartbeat/status sends the table session key.
- Host-side waiting registration rejects stale or wrong-table links with a clear public error.
- Multiplayer projection tests now expect table-scoped Guest Links.
- Multiplayer tests now cover correct-session waiting guests and wrong-session rejection.
- Local multiplayer and state-of-the-table docs now record this behavior.

## Implemented Fix Details

The most important answer to "what would break first" was stale/global multiplayer routing. The smallest high-value fix was to bind the easy entry point, the LAN Guest Link, to the current local table session.

This does not fully solve global active-campaign coupling, but it prevents the most user-visible failure mode: a guest opens an old link, asks to join, and appears in the wrong campaign because the host has since opened another table.

## Verification

Verification after the fix:

- `npm test` passed.
- `npm run build` passed.

## Remaining Risks

Critical remaining risks:

- `app/app.js` must be split. It is the central maintainability hazard.
- Multiplayer APIs need explicit campaign/table/session identity on every route, not just generated Guest Links.
- Persistence needs an append-only domain event log with snapshot compaction for recovery.

High remaining risks:

- Long logs need paging/virtualization.
- Provider recovery should move further out of the renderer.
- Combat authority needs stronger tests around invalid provider edits.
- Route-level multiplayer tests need to exist before serious network testing.

Medium remaining risks:

- Legacy ThinLoreKeeper naming should be removed from current product surfaces and internal mode names.
- Diagnostics should be useful without exposing scary implementation language to normal users.
- Binder/retrieval tables need scaling indexes and a clear ownership contract.

## Technical Debt List

- Split `app/app.js` into focused controllers and React components.
- Extract a real `MultiplayerSessionEngine` from `src/multiplayer/local-table.js`.
- Make `scripts/serve.js` a thin HTTP adapter over application services.
- Move repair/import lifecycle into provider orchestration and engine validation.
- Convert provider logs/errors into queryable append-only records with retention policies.
- Replace implicit active-campaign server mutation with explicit table/campaign routing.
- Add event-sourced turn/combat/session logs.
- Virtualize play logs and paginate old messages.
- Remove lingering ThinLoreKeeper terminology.

## Recommended Next Roadmap

1. Make multiplayer requests explicit: every guest route carries table session, campaign identity, guest identity, and assigned character identity.
2. Add route-level tests for guest waiting, seating, reconnect, campaign switch, stale links, and stale actions.
3. Split `app/app.js` by ownership: front door, campaign table, provider lifecycle, multiplayer, recovery, settings.
4. Extract `MultiplayerSessionEngine` and make `local-table.js` a thinner domain/service module.
5. Add append-only domain events to SQLite, then rebuild snapshots/projections from those events.
6. Virtualize/paginate the play log.
7. Strengthen combat authority so provider output can never silently create invalid mechanical state.
8. Build hidden story-thread state into normal turn lifecycle and retrieval.
9. Run a two-machine playtest with diagnostics open and record every confusing moment as a product bug.

## Final Question

If LoreKeeper had 100 active campaigns and 20 multiplayer tables running this month, what would break first?

The active-campaign/global server model would break first. Guests, staged actions, provider responses, diagnostics, and campaign saves would be too easy to route to the wrong current table or recover in the wrong context. The second failure would be long-session performance: full logs, full snapshots, and oversized renderer state would make old campaigns increasingly slow and hard to debug.

The most important reasonably-sized fix was implemented here: Guest Links are now scoped to a specific local-table session, and stale/wrong-table waiting-room joins are rejected instead of silently entering the wrong campaign. The full fix is still bigger: all multiplayer routes need explicit table and campaign identity, with host authority validation at the route boundary.
