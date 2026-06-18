# LoreKeeper

LoreKeeper is a local-first tabletop RPG desktop app for running a D&D-style campaign with a real table flow. The app owns campaign state, combat, continuity, recovery, multiplayer authority, and the shape of play. The AI provider owns narration, NPC behavior, atmosphere, and dialogue inside those app-owned rails.

The default rules profile is D&D 5e-lite: HP, AC, ability scores, checks, saves, initiative, conditions, abilities, spells, inventory, and combat turns are tracked where the app has enough information. LoreKeeper is not trying to become a full virtual tabletop; it is trying to make a campaign feel durable, coherent, and easy to resume.

## Product Shape

Provider chats are good at improvising, but weak at owning the campaign. Long campaigns outgrow a single chat. Context dumps drift, inventories and stats get lost, combat formatting needs to be repeated, and campaign canon falls behind actual play.

LoreKeeper acts as the save system and table authority the campaign needs:

- The app is the source of truth for campaign SQLite files, approved canon, party state, table phase, combat state, multiplayer seats, and recovery.
- The DM model receives a bounded table task and returns narration plus proposed state changes.
- The app validates, imports, stages, repairs, or rejects provider output instead of letting the model silently become the database.
- Host and guest flows are designed around table language: start an adventure, join a table, take a turn, vote, pass, talk, recover.

## Current Status

LoreKeeper is an active desktop app with a React/Vite renderer, an Electron desktop host, a local HTTP/API process, SQLite campaign persistence, local Ollama support, a provider chat bridge fallback, table session projections, multiplayer host/guest flows, app-owned combat helpers, import/recovery paths, and regression coverage for the risky state paths.

The near-term product direction is to make the app feel less like a developer/admin panel and more like a calm dark tabletop: story first, clear next action, hidden tooling, confident recovery.

## Core Workflow

1. Host starts LoreKeeper and opens or creates a local campaign.
2. LoreKeeper loads the campaign SQLite file and projects the current table phase.
3. Players sit down locally or through the same-network guest page.
4. The host sends a table action, or a guest submits an action for the host/table to resolve.
5. LoreKeeper builds a bounded DM task from campaign state, table state, and rules.
6. Local AI or a campaign chat provider generates narration and proposed state updates.
7. LoreKeeper imports the response, keeps narration table-facing, and stages canon/mechanics updates for review when needed.
8. Approved state changes are saved back to the campaign SQLite file.
9. Combat, table talk, voting, recovery, and guest authority stay app-owned.

## AI Providers

No provider API key is required for the current local-first path.

- **Local AI** uses Ollama through the local API.
- **Campaign Chat** remains available as a provider chat bridge/manual fallback for advanced use and recovery.

Provider output is treated as a DM contribution, not as authority over campaign state.

## Project Structure

- `docs/ARCHITECTURE.md`: current architecture, ownership boundaries, and code landmarks.
- `docs/state-of-the-table.md`: working product state, priorities, checklist, and playtest notes.
- `docs/MAINTAINER_GUIDE.md`: practical commands, debug map, and failure playbooks.
- `docs/living-world.md`: consequence, memory, relationship, faction, location, and goal-horizon continuity model.
- `electron/`: desktop window, local server launch, and desktop protocol handling.
- `scripts/serve.js`: local HTTP/API surface for the desktop host and same-network guests.
- `app/`: Vite app shell, renderer orchestration, UI controllers, and styles.
- `src/`: campaign state, engines, model contract, multiplayer authority, storage, provider service, and rules.
- `scripts/test-*.js`: regression tests for engine behavior, provider contract, multiplayer, SQLite, and server security.

## Local Commands

Run the project check:

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

Run the full test suite and production build:

```bash
npm run test:all
npm run build
```

## Local Persistence

Campaign SQLite files live under:

```text
data/campaigns/<campaign-slug>.lorekeeper.sqlite
```

The campaign index lives at:

```text
data/campaigns/campaign-index.json
```

If the index is empty or corrupt, LoreKeeper treats it as recoverable, discovers existing campaign SQLite files, and rewrites a valid index.
