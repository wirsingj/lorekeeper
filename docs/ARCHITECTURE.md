# Architecture

Lorekeeper is a browser-extension-first campaign continuity manager. It runs locally, manages
campaign memory as structured state plus human-readable notes, and uses supported provider web UIs
as visible AI execution surfaces.

## Design Principle

Lorekeeper is a campaign memory engine, not just a chat wrapper.

The provider chat is where model execution happens. Lorekeeper is where campaign canon lives,
where prompts are assembled, where responses are imported, and where proposed state changes are
reviewed before becoming canon.

## Major Components

### Lorekeeper App Tab / Side Panel

The main user interface for campaigns, current scene state, context packs, prompt preparation,
response import, and state review.

It may run as a full extension page, side panel, or both.

The primary play UI should use a handheld-shell layout: Lorekeeper-owned input at the bottom,
campaign controls on the sides, provider status in the top bar, and a central play screen that mirrors
provider responses. The user should not need to type directly into the provider once a bridge is
selected.

### Provider Tab Selection

The user explicitly selects a supported provider tab or window. Lorekeeper does not operate on
arbitrary tabs.

Selection should show clear status:

- selected provider
- selected tab title/domain
- automation readiness
- current send/import state
- pause/stop controls

### Provider Adapters

Provider-specific content scripts isolate DOM automation details for each supported provider.
ChatGPT should be the first adapter. Claude can follow later.

Adapters are expected to be brittle by nature because provider DOMs change, so each adapter should
have clear failure reporting and a manual fallback path.

### Prompt Builder

The prompt builder assembles focused prompts from campaign state, provider templates, scene state,
style rules, and optional user instructions.

It should be able to build focused context packs such as:

- current scene context
- active party context
- nearby people and places
- relevant lore
- current inventory
- unresolved plot threads
- combat state if in combat
- relationship notes
- campaign style and formatting rules

### Play Loop Orchestrator

The play loop takes the user's raw Lorekeeper input and turns it into a provider-ready turn:

1. capture player action/message
2. retrieve focused context from campaign storage
3. build provider prompt
4. send or copy through selected provider bridge
5. import provider response
6. show response in Lorekeeper's central play screen
7. extract proposed state changes
8. route those changes through canon review

### Response Importer

The response importer reads the latest provider assistant response, stores the raw imported text,
and passes it to extraction and review flows.

The raw response should be retained for audit and recovery even when structured extraction fails.

### State Diff Reviewer

The model may propose campaign state updates, but proposed changes are never canon immediately.
The user must be able to review, edit, approve, or reject changes before they are committed.

The reviewer should support:

- structured diffs
- human-readable summaries
- per-change approval or rejection
- manual edits before commit
- rollback or version history for approved updates

### Campaign State Engine

The campaign state engine owns canonical campaign memory. It stores structured entities,
relationships, timeline events, current scene state, combat state, style rules, and templates.

State should be queryable enough to build narrow context packs instead of dumping the entire
campaign into every prompt.

### Storage Layer

The storage layer persists campaign bundles in user-owned durable storage. Browser storage may be
used for cache and convenience, but it should not be the only trusted long-term store.

### Export / Import Layer

Campaigns must be exportable and importable. Export should preserve structured state, notes,
templates, raw session history, reviewed diffs, and attachments or references where possible.

## Campaign State Domains

Campaign state must explicitly model and persist:

- people, characters, and NPCs
- player party members
- factions and organizations
- places, regions, and maps
- items, artifacts, and inventory
- world lore and canon notes
- timeline and session events
- active quests and unresolved threads
- relationships between characters, factions, and places
- party location and scene state
- combat style preferences
- combat turn format
- D&D 5e-lite rules profile and stat tracking
- character stats, HP, abilities, and spells when available
- encounter state, enemies, initiative, and conditions
- writing tone and campaign style rules
- provider prompt templates
- recap and context-pack templates

## Canon Model

Lorekeeper tracks canon as both structured state and human-readable notes.

Structured state makes retrieval, context packing, and diff review possible. Human-readable notes
keep the campaign understandable to the user and resilient when schemas evolve.

Canon changes should flow through this lifecycle:

1. imported provider response
2. proposed extraction
3. reviewable diff
4. user edit or approval
5. canonical commit
6. durable persistence

## Rules Profile

Lorekeeper should provide mechanical guard rails for D&D 5e-lite play without becoming a deep game
rules engine or full virtual tabletop.

The rules profile should track enough to keep provider output consistent:

- level, class, ancestry, AC, HP, temporary HP
- ability scores and modifiers
- proficiency bonus, saves, skills, and passive perception
- attacks, features, abilities, spells, and spell slots when known
- initiative, conditions, enemies, resources, and encounter state
- advantage/disadvantage and ordinary d20 check conventions
- the campaign's preferred combat turn format

When stats are missing, the provider should state assumptions and propose a Lorekeeper update instead
of silently inventing permanent mechanics.
