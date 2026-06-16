# LoreKeeper Table Authority Model

LoreKeeper must not treat "the active campaign" as authority for multiplayer behavior. The active campaign is a UI convenience. Multiplayer authority comes from explicit identity on every table-owned request.

## Identity Terms

Campaign identity:

- `campaignId`
- Long-lived canonical world state.
- Owns durable fiction, party, records, combat state, scene state, consequences, provider memory metadata, and persisted logs.

Table identity:

- `tableId`
- Stable play table for a campaign.
- Today LoreKeeper has one default table per campaign. Future versions may support multiple tables per campaign, such as "Saturday Night Group" and "Solo Prep Table".
- Owns table-specific seats, invites, waiting guests, table talk, staged actions, and table-facing projections.

Session identity:

- `sessionId`
- Live host runtime instance for a table.
- Changes when the host starts a new local table session.
- Owns LAN guest links, live waiting-room presence, guest heartbeats, and in-flight remote actions.

## Current Rule

Every multiplayer route, event, staged action, invite, waiting guest, connection, table-talk message, and guest snapshot should carry enough identity to answer:

- Which campaign owns this?
- Which table owns this?
- Which live session owns this?

If a request supplies `campaignId`, `tableId`, or `sessionId`, the server must reject mismatches before mutating state.

## Authority Boundaries

Campaign state owns:

- durable world state,
- durable party members,
- durable combat/scene/consequence state,
- durable session log,
- provider settings and provider context metadata.

Table state owns:

- local table settings,
- seats and controller assignments,
- invites,
- waiting guests,
- connected guests,
- pending turn inputs,
- table talk,
- multiplayer events.

Session state owns:

- current LAN host/port,
- generated guest link,
- heartbeat validity,
- stale-link rejection,
- in-flight guest action authority.

Renderer owns:

- form state,
- selected UI view,
- local convenience cache,
- projections for display.

Renderer does not own:

- table authority,
- guest authorization,
- controller ownership,
- turn authority,
- combat authority.

Provider owns:

- narration,
- NPC dialogue,
- atmosphere,
- proposed structured changes.

Provider does not own:

- campaign identity,
- table identity,
- turn authority,
- combat authority,
- seat assignment,
- persistence.

## Validation Rules

- A stale `campaignId` means the request belongs to another campaign and must be rejected.
- A stale `tableId` means the request belongs to another table and must be rejected.
- A stale `sessionId` means the request belongs to an old host runtime and must be rejected.
- Missing identity is tolerated only for old saved campaigns and local host actions that are still migrating. New UI flows should send identity.
- Public guest routes must not rely on host-only API headers for authority. They must validate identity in the request body or query string.

## Current Implementation

Implemented:

- Local tables now have `tableId` and `sessionId`.
- Generated Guest Links include `campaign`, `table`, and `session`.
- Invite links include `campaign`, `table`, and `session`.
- Waiting guests, connections, pending turn inputs, and table talk are stamped with ownership identity.
- Waiting-room register/status validates campaign/table/session identity.
- Guest snapshot, guest action, guest pass, guest combat join, and guest table talk validate campaign/table/session identity when provided.
- Host-side multiplayer mutations validate campaign/table/session identity when provided.

Still transitional:

- The server still stores a single selected active campaign in this process.
- `scripts/serve.js` still uses `loadActiveCampaign` and `updateActiveCampaign`; route-level identity checks protect the mutation, but the storage API is not yet table-addressed.
- Provider generation is still campaign-pinned mainly by headers and request id, not by a full table authority envelope.

## Future Target

Replace:

```js
updateActiveCampaign(projectRoot, updater)
```

with:

```js
updateCampaignTable(projectRoot, { campaignId, tableId, sessionId }, updater)
```

The route should fail before loading or mutating unrelated state. The UI should stop asking "what is active?" and ask "which table owns this?"
