# Model I/O

LoreKeeper treats AI providers as replaceable scene engines.

The normal desktop flow is:

1. The app reads SQLite canon.
2. The app builds a compact `LorekeeperTurnRequest`.
3. The provider/model returns a `LorekeeperTurnResponse`.
4. The app validates the response.
5. The app renders table chat from `response.table`.
6. The app renders choices from `response.choices`.
7. The app renders mechanics from `response.mechanics`.
8. The app stores proposed state changes as review items, not canon.

## App Responsibilities

The app owns:

- campaign memory
- canonical state
- SQLite persistence
- character sheets
- HP, inventory, quests, relationships, combat state
- dice rolling where possible
- modifier calculation where possible
- validation
- update review
- provider selection
- prompt/context building

## Model Responsibilities

The model owns:

- scene narration
- table dialogue
- suggested checks
- proposed canon updates
- tone within provided context

Action options belong in `response.choices`, not loose prose. For options aimed at a specific party member or NPC, the model should include `choices.forActor`/`forActorId` or per-option `actor`/`actorId` so the app can render a clean table choice panel.

The model must not:

- directly mutate SQLite
- silently change major canon
- decide the primary player character's major actions
- invent hidden facts that contradict canon
- rely on provider chat history as memory

## Context Strategy

LoreKeeper does not send the whole campaign every turn.

Normal mode sends:

- current scene
- compact party summaries
- table voices
- relevant retrieved context sections
- recent history
- active threads
- nearby entities
- combat/style/rules sections when relevant

Fast mode trims section entries and choice limits. It is separate from `generation.responseMode`, which describes the job the model is doing: `turn`, `continue`, `resolve_check`, `resolve_combat`, or `summarize`.

Combat mode allows more character/resource detail.

The app should keep request JSON lean by sending retrieved context sections instead of the whole campaign. The embedded response schema remains in v1 prompts for local model reliability; a future provider layer can move stable schema instructions into a reusable system prompt to reduce per-turn tokens.

## Provider Notes

Ollama uses JSON mode (`format: "json"`) and receives the request as a compact JSON envelope. Browser bridge compatibility remains available, but the target path is provider-independent JSON in and JSON out.

The app derives secondary state such as `hasProposedChanges` from the response instead of asking the model to self-report it. Per-change confidence and `warnings` are the preferred way to surface uncertainty.
