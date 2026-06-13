# Multiplayer Protocol

The protocol is versioned and host-authoritative.

```json
{
  "protocolVersion": 1
}
```

## Current Transport

The first implementation uses JSON HTTP endpoints from the local app server. This is simpler than WebSocket for the initial host/guest slice and works with Electron app instances on the same LAN.

WebSocket can be added for low-latency table updates and streamed generation while preserving the same message semantics.

## Host Endpoints

- `GET /api/multiplayer/snapshot`
- `POST /api/multiplayer/start`
- `POST /api/multiplayer/stop`
- `POST /api/multiplayer/invite`
- `POST /api/multiplayer/invite/revoke`
- `POST /api/multiplayer/join`
- `POST /api/multiplayer/join/approve`
- `POST /api/multiplayer/join/deny`
- `GET /api/multiplayer/guest-snapshot?connectionId=...`
- `POST /api/multiplayer/action`
- `POST /api/multiplayer/pass`
- `POST /api/multiplayer/disconnect`
- `POST /api/multiplayer/controller/revoke`
- `POST /api/multiplayer/controller/ai`
- `POST /api/multiplayer/controller/host`
- `POST /api/multiplayer/pending/clear`

## Guest Snapshot / Table State

`GET /api/multiplayer/guest-snapshot?connectionId=...` returns the guest's connection metadata plus a visible `tableState` block:

```json
{
  "protocolVersion": 1,
  "campaignId": "campaign-id",
  "campaignTitle": "Campaign Name",
  "connection": {
    "id": "conn-id",
    "status": "connected",
    "partyMemberId": "mira-quickstep"
  },
  "assignedCharacter": {
    "id": "mira-quickstep",
    "name": "Mira Quickstep",
    "controllerKind": "remote_player"
  },
  "tableState": {
    "scene": {},
    "party": [],
    "people": [],
    "places": [],
    "items": [],
    "inventory": [],
    "quests": [],
    "factions": [],
    "lore": [],
    "relationships": [],
    "combat": null,
    "messages": [],
    "choices": null,
    "pendingInput": null
  },
  "awaitingApproval": false
}
```

The app keeps old top-level fields for compatibility, but new clients should render from `tableState`. The host filters out `dm_only` records/messages before sending. ThinLoreKeeper polls this endpoint every few seconds and can manually resync.

## Guest Action Payload

```json
{
  "connectionId": "conn-id",
  "characterId": "kevric",
  "text": "Kevric watches Jarin's blind side.",
  "ready": true
}
```

The host validates:

- connection exists
- connection is approved
- character id matches the invited seat
- party member is currently controlled by that remote player
- text is present for a ready action

Accepted guest actions are written into visible table chat with `source: "remote_player_input_pending"` and a `data.pendingInputId`.

## Model Aggregation

When the host submits one or more visible guest messages, LoreKeeper adds structured entries to the turn request:

```json
{
  "user": {
    "raw": "Combined structured party turn",
    "playerInputs": [
      {
        "playerId": "player-jess-1234",
        "playerName": "Jess",
        "characterId": "kevric",
        "characterName": "Kevric",
        "text": "Kevric watches Jarin's blind side.",
        "ready": true
      }
    ]
  }
}
```

The table message remains visible. The model receives the structured source fields so it can keep character voices separate.

## Future WebSocket Messages

The planned live protocol should use the same concepts:

Client to host:

- `join_request`
- `player_action_submit`
- `player_action_update`
- `player_ready`
- `player_pass`
- `disconnect`

Host to client:

- `join_approved`
- `join_denied`
- `state_snapshot`
- `table_update`
- `choices_update`
- `turn_state_update`
- `generation_started`
- `generation_delta`
- `generation_complete`
- `controller_assignment_changed`
- `error`
