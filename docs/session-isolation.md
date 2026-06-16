# LoreKeeper Session Isolation

Session isolation prevents stale or cross-table activity from mutating the wrong campaign.

The dangerous failure mode is simple:

1. Host starts a table.
2. Guest receives a link.
3. Host switches campaign or restarts the table.
4. Guest uses the old link or sends an old action.
5. The app applies that action to whatever campaign is currently active.

That must never happen.

## Required Envelope

Multiplayer requests should carry:

- `campaignId`
- `tableId`
- `sessionId`

Guest connection requests also carry:

- `clientId`
- `connectionId`
- `connectionSecret`

Waiting-room requests also carry:

- `waitingGuestId`
- `waitingSecret`

The identity envelope answers ownership. The secret answers authorization.

## Current Scoping

Generated LAN Guest Link:

```text
http://host-lan-ip:4173/guest?campaign=<campaignId>&table=<tableId>&session=<sessionId>
```

Invite Link:

```text
lorekeeper://join?host=<host>&port=<port>&campaign=<campaignId>&table=<tableId>&session=<sessionId>&seat=<seatId>&token=<token>
```

Host mutations:

- include `campaignId`, `tableId`, and `sessionId` in the request body,
- are still protected by campaign pin headers in the desktop app,
- are rejected if the body identity no longer matches the active table.

Guest mutations:

- include `campaignId`, `tableId`, and `sessionId` from the invite or waiting-room session,
- include connection or waiting-room secrets,
- are rejected if the host has moved to a different campaign, table, or live session.

## Isolation Guarantees Added

- Stale Guest Links cannot silently register a waiting guest against the wrong table.
- Wrong campaign ids are rejected before waiting guests or staged actions are written.
- Wrong table ids are rejected before waiting guests, snapshots, table talk, combat joins, or staged actions are written.
- Wrong session ids are rejected before live guest activity is accepted.
- Pending turn inputs are stamped with campaign/table/session ownership.
- Table talk records are stamped with campaign/table/session ownership.
- Public guest snapshots validate ownership when the guest supplies identity.

## Still Not Complete

Provider isolation is not complete until provider requests and provider imports carry the same table authority envelope end to end.

Diagnostics isolation is not complete until diagnostics can be requested for a specific campaign/table/session rather than only the active process state.

Storage isolation is not complete until campaign repository APIs can load and mutate by explicit campaign/table identity instead of active campaign selection.

Combat isolation is not complete until all combat mutations require table identity and tests prove wrong-table combat actions are rejected.

## Test Expectations

Session isolation tests should cover:

- stale invite links,
- wrong campaign id,
- wrong table id,
- wrong session id,
- guest snapshot mismatch,
- staged action mismatch,
- reconnect to wrong session,
- campaign switch during multiplayer.

The current test suite covers waiting-room mismatches, invite identity parsing, guest snapshot wrong-table rejection, wrong-session staged action rejection, and ownership stamping on pending turn inputs.
