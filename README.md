# Lorekeeper

Lorekeeper is an early scaffold for a browser-extension-first AI campaign framework and guard-rail
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

Lorekeeper runs locally as a browser extension/app tab. The user starts or opens a local campaign
file, then keeps ChatGPT, Claude, or another supported provider open in a nearby tab or window.
Lorekeeper uses a provider UI bridge to send prompts through the visible provider web UI, wait for
the response, import it back into Lorekeeper, and propose campaign state updates.

This is not an API client. It is a local campaign framework that uses the already-logged-in provider
web UI as the AI execution surface.

## Current Status

Early working scaffold. Lorekeeper now has campaign-memory primitives, context-pack generation,
sidecar prompt generation, canon review proposal objects, provider bridge contracts, a local SQLite
campaign-file prototype, and a secondary importer for existing continuity dumps.

## Core Workflow

1. User starts or opens a local `.lorekeeper.sqlite` campaign file.
2. Lorekeeper stores the campaign premise, party, places, lore, tone, style rules, and current scene.
3. User selects a supported provider tab or window.
4. Lorekeeper builds the next prompt from local campaign state and guard rails.
5. Lorekeeper sends or pastes that prompt into the provider chat input.
6. Lorekeeper imports the latest assistant response.
7. Lorekeeper parses proposed campaign state updates.
8. Lorekeeper shows a reviewable diff.
9. User approves, edits, or rejects changes.
10. Approved updates are saved to the local SQLite campaign file.

## Safety Boundaries

- No provider API keys required.
- No bypassing login, subscriptions, paywalls, or provider access controls.
- No credential scraping.
- No hidden account-data access.
- No background operation on arbitrary tabs.
- Only operate on explicitly selected supported provider tabs or windows.
- Automation must be visible, pauseable, and easy to stop.
- Provider adapters must be isolated because provider DOMs will change.

## Project Structure

- `docs/ARCHITECTURE.md`: system architecture and major components.
- `docs/STORAGE.md`: campaign state, persistence options, and durability strategy.
- `docs/ROADMAP.md`: phased implementation plan.
- `docs/VOTT_USE_CASE.md`: motivating long-campaign use case.
- `docs/PROVIDER_UI_BRIDGE.md`: provider UI automation approach and boundaries.
- `docs/FIREFOX_CHATGPT_SIDECAR.md`: Firefox sidebar and ChatGPT tab bridge notes.
- `docs/UX_HANDHELD_SHELL.md`: handheld play UI concept and input ownership.
- `src/`: campaign engine, context packs, prompt builder, importers, storage, and bridge contracts.
- `extension/`: placeholder browser extension source.

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
