# Lorekeeper

Lorekeeper is an early scaffold for a local-first AI campaign framework and guard-rail
system. It is meant for people who want an engaging D&D-style world experience while using ChatGPT,
Claude, or another provider web UI as the AI sidecar.

Lorekeeper is designed as the campaign table, memory engine, and rules-of-engagement layer, not just
a chat wrapper.

The default rules profile is D&D 5e-lite: HP, AC, ability scores, checks, saves, initiative,
conditions, abilities, spells, inventory, and combat turns are tracked when available, but Lorekeeper
is not trying to become a full virtual tabletop.

## Why It Exists

AI provider chats are good at improvising, but weak at owning the campaign. Long campaigns outgrow a
single chat. Context dumps drift, names and places get misplaced, inventories and stats get lost,
combat formatting needs to be repeated, and campaign canon falls behind actual play.

Lorekeeper should act as the save system the campaign deserved.

## MVP Requirement

The MVP must not require provider API keys.

Lorekeeper runs as a local React/Vite app backed by a local API that owns portable SQLite campaign
files. A small headless browser extension acts as the provider bridge. The user starts or opens a
local campaign file, then keeps ChatGPT, Claude, or another supported provider open in a nearby tab
or window. Lorekeeper uses the bridge to send prompts through the visible provider web UI, wait for
the response, import it back into Lorekeeper, and propose campaign state updates.

This is not an API client. It is a local campaign framework that uses the already-logged-in provider
web UI as the AI execution surface.

The intended ChatGPT path is a named campaign conversation inside the `LoreKeeper` project:

- Open the ChatGPT project/chat you want Lorekeeper to use, ideally inside the `LoreKeeper` project.
- Lorekeeper tracks the active provider conversation per local campaign, using campaign name plus a
  short id such as `Blackthorn Crossing [abc123-01]`.
- Long campaigns can rotate to later provider conversations while keeping one SQLite campaign file
  as the source of truth.
- Use Lorekeeper's own input box for play.
- Lorekeeper builds the context-rich prompt from SQLite state, sends it to the active campaign
  provider conversation, imports the assistant response, extracts campaign state changes, and saves
  them locally.
- If ChatGPT needs login or the project must be selected, Lorekeeper opens or focuses the tab and
  waits for the user to finish that provider-side action.

## Current Status

Early working scaffold. Lorekeeper now has a React/Vite app shell, campaign-memory primitives,
context-pack generation, sidecar prompt generation, canon review proposal objects, provider bridge
contracts, a local SQLite campaign-file prototype, and a secondary importer for existing continuity
dumps.

## Core Workflow

1. User starts or opens a local `.lorekeeper.sqlite` campaign file.
2. Lorekeeper stores the campaign premise, party, places, lore, tone, style rules, and current scene.
3. User selects a supported provider tab or window.
4. Lorekeeper builds the next prompt from local campaign state and guard rails.
5. Lorekeeper sends that prompt into the saved provider campaign conversation when the extension bridge is
   available, or copies it for manual paste as a fallback.
6. Lorekeeper imports the latest assistant response from the provider conversation, or accepts a manual paste.
7. Lorekeeper parses proposed campaign state updates.
8. Lorekeeper saves extracted state updates into SQLite.
9. User approves, edits, or rejects changes.
10. Approved updates are saved to the local SQLite campaign file.

## Safety Boundaries

- No provider API keys required.
- No bypassing login, subscriptions, paywalls, or provider access controls.
- No credential scraping.
- No hidden account-data access.
- No background operation on arbitrary tabs.
- Prefer a saved companion provider tab, and otherwise operate only on supported provider tabs.
- Automation must be visible, pauseable, and easy to stop.
- Provider adapters must be isolated because provider DOMs will change.

## Project Structure

- `docs/ARCHITECTURE.md`: current architecture, ownership boundaries, and code landmarks.
- `docs/state-of-the-table.md`: working product state, priorities, and checklist.
- `docs/MAINTAINER_GUIDE.md`: practical commands, debug map, and failure playbooks.
- `docs/living-world.md`: consequence, memory, relationship, faction, location, and goal-horizon continuity model.
- `electron/`: desktop window, local server launch, and desktop protocol handling.
- `scripts/serve.js`: local HTTP/API surface for the desktop host and same-network guests.
- `app/`: Vite app shell, renderer orchestration, UI controllers, and styles.
- `src/`: campaign state, engines, model contract, multiplayer authority, storage, provider service, and rules.
- `scripts/test-*.js`: regression tests for engine behavior, provider contract, multiplayer, SQLite, and server security.

## Local Commands

Run the current scaffold check:

```bash
npm run check
```

Create a new local SQLite campaign file:

```bash
npm run new:campaign -- "My Campaign" "A dangerous frontier campaign about old roads and new gods."
```

Start the local app:

```bash
npm run dev
```

Import an existing campaign folder:

```bash
npm run import:folder -- "C:\Users\wirsi\OneDrive\Desktop\Veil of the Towers"
```

The importer writes a campaign bundle to `data/imports/`. It preserves raw text continuity dumps,
indexes local assets, and extracts a first-pass structured campaign for review.

## Local Persistence

When the dev server is running, the app loads and saves through a local SQLite campaign file:

`data/campaigns/<campaign-slug>.lorekeeper.sqlite`

The active campaign selection is remembered in:

`data/campaigns/campaign-index.json`

Approved review diffs are committed through the local API and persisted into that SQLite file.
