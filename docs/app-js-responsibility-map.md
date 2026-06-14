# App.js Responsibility Map

Date: 2026-06-13

`app/app.js` is still too large, but it is now moving toward a renderer shell. This map tracks what it currently owns, what it should own, and where remaining responsibilities should move.

## What App.js Should Own

- DOM event wiring.
- Calling engine/store/controller APIs.
- Rendering projections into existing DOM nodes.
- Small UI affordances that are not game state.
- Diagnostics wiring.

## Extracted In This Cut

| Former app.js responsibility | New module | Classification |
| --- | --- | --- |
| Local table host/guest render state, guest lists, pending remote inputs | `app/multiplayer-session-panel.js` | Derived projection + view |
| Input placeholder/send button rules for full/thin/combat states | `app/input-composer-controller.js` | Derived projection |
| Review list display for pending and last committed proposed changes | `app/proposed-changes-panel.js` | Proposed-change view |

These modules do not own canonical state. They accept campaign/session/engine projections and return renderable UI state or render that projection.

## Remaining App.js Responsibilities To Move

| Current chunk | Problem | Target owner |
| --- | --- | --- |
| `submitPlayerTurnFromInput` | Builds player turn, handles echo/import side effects, and coordinates provider flow | `TurnEngine` + `ProviderOrchestrator` + a small submit controller |
| Provider import/repair helpers | Mixes validation, implicit proposed changes, review batches, diagnostics, and UI status | Proposed-change/recovery controller |
| Implicit combat inference helpers | Renderer repairs combat from prose/table messages | `CombatEngine` or a dedicated migration/recovery module |
| Guest sync/session mutation | Renderer stores guest session and sync errors | Multiplayer session controller |
| Party approval actions in play log | UI and agency state are intertwined | Agency/multiplayer projection + party approval view |
| Entity sidebar renderers | Long repeated DOM builders | Entity/sidebar view modules |
| Character sheet editor | Form state and persistence are UI-local but large | Character sheet controller |

## Classification Snapshot

- UI rendering shell: campaign header, rails, chat log, setup/settings dialogs.
- Event handlers: button/form listeners, modal open/close, clipboard actions.
- Derived projections: input composer, multiplayer panel, combat tracker, provider status.
- Engine logic still present: post-turn recovery, combat prompt repair, implicit combat updates.
- Persistence logic still present: direct campaign message/record/review API calls.
- Provider logic still present: bridge/manual import and local generation handoff.
- Multiplayer logic still present: join/sync/session persistence and staged input submission.
- Legacy/dead risk: bridge/manual import paths may become obsolete once local provider orchestration is the primary flow.

## Acceptance Direction

Future cuts should delete behavior from `app.js`, not only wrap it. Each cut should leave one fewer state-machine-shaped function in the renderer and add tests at the projection/controller boundary.
