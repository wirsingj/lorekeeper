# Local Multiplayer

LoreKeeper multiplayer is LAN-first and host-authoritative. It is meant for an occasional second player joining a mostly solo campaign, not for replacing the normal table UI.

## Architecture

- The host app owns the campaign SQLite file.
- The host app owns AI/model calls, dice/math resolution, canon review, and persistence.
- A guest app connects to the host over the local network.
- A guest controls one assigned party member for the session.
- The guest does not need Ollama, a browser bridge, or provider settings.

The hosted party member remains campaign canon. The guest is only a temporary controller. If the guest leaves, the character falls back to host or AI companion control.

## Pre-Table Campaign Setup

The new campaign wizard supports one optional `Starting Party / Joiner` card before `Create And Start`. This is for the common same-room case where a second player already knows who they want to be, or the host wants the opening scene to include a future guest character from the first DM beat.

The pre-table joiner is seeded into the campaign as an unassigned party member before the opening provider call. LoreKeeper includes the joiner's character pitch, party integration, and host scene context in the opening prompt so the DM can introduce them naturally instead of bolting them on after the scene starts. The host can later invite a remote player to that party member.

## Current Vertical Slice

The current implementation supports:

- starting/stopping a local table session from setup
- generating an invite link for a party member
- joining from ThinLoreKeeper by pasting the invite link into the front-center join card
- "join as my character" requests, where a guest proposes a new PC with a character pitch and DM integration hook, then the host approves it into the party
- host approval/denial of join requests
- temporary remote controller assignment
- public guest table messages
- lightweight Table Talk side chat that stays out of campaign canon/provider context
- host "Submit" action on a visible guest message
- guest polling of visible Table State every few seconds
- structured `user.playerInputs[]` in the next model request
- disconnect fallback to AI companion control

This deliberately keeps multiplayer out of the primary solo UI until needed.

## Turn Flow

1. Guest types a message for the assigned character.
2. Host receives it as a public table chat message from that character.
3. The message is marked as waiting for host submit.
4. Host clicks Submit on that table message, or resolves all ready party inputs.
5. LoreKeeper builds a model request with `user.playerInputs[]`.
6. The model response returns normal table entries, choices, mechanics, and proposed changes.
7. Canon changes remain host-reviewed.

Guests never mutate SQLite directly. The host endpoint validates the connection, assigned character, and controller state before accepting the visible message.

## ThinLoreKeeper Portable Build

For a nearby LAN guest, the host can build a portable Windows companion package:

```powershell
npm run package:thin
```

This creates:

- `dist/portable/ThinLoreKeeper/ThinLoreKeeper.exe`
- `dist/portable/ThinLoreKeeper.zip`

The guest workflow should be:

1. Unzip the package.
2. Double-click `ThinLoreKeeper.exe`.
3. Paste the invite link into the front-center join card.
4. For a fixed-seat invite, enter a table name and click `Join Table`.
5. For a Join-As invite, fill in character name, ancestry/class, table role, appearance, character pitch, and why they join this party, then click `Join Table`.
6. Wait for host approval.

Join-As is meant to give the guest real first-session agency. The host receives the proposed character as a pending join request. Before approving, the host can add an optional scene-integration note for the DM, such as "introduce her as the scout who knows the flooded bridge detour." Approval creates a canonical party member plus a system table note the DM/provider can use to weave the new character into the current scene. The proposal stores:

- `name`
- `ancestry`
- `characterClass`
- `level`
- `roleIntent`
- `appearance`
- `backstory`
- `integrationPrompt`

Host approval can also attach:

- `hostIntegrationPrompt`

The portable Thin client does not include campaign saves, SQLite authority, Ollama, or provider controls. It renders host-filtered table state and sends authenticated guest inputs back to the host.

## Table State Sync

The guest app syncs a host-built `tableState` snapshot. This is the player-visible campaign surface, not a second campaign database.

Table State currently includes:

- table chat history
- scene/location state
- party members and controller badges
- visible 5E-lite character sheet fields
- people
- places
- things/items and inventory
- threads/quests
- factions, lore, and relationships when visible
- combat state when visible
- current choices
- the guest's pending input state

The host remains authoritative. ThinLoreKeeper polls this state every few seconds and can request a manual resync. If a guest had an older pending connection id, the host can recover by returning the approved sibling connection for the same invite/client.

## Limitations

- This is HTTP polling plus JSON endpoints for the first slice.
- WebSocket streaming/broadcast can layer on later without changing the controller model.
- LAN address detection is best effort.
- Internet play should use the same invite/controller protocol, with tunneling or relay added later.
