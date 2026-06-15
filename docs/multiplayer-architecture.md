# Multiplayer Architecture

LoreKeeper should be LAN-first and host-authoritative.

## Authority

- Host owns SQLite.
- Host owns provider calls.
- Host owns turn resolution.
- Guests submit inputs and render snapshots.
- Guests do not directly mutate SQLite.
- Invite links are LAN-only: ThinLoreKeeper accepts loopback/private hosts, not arbitrary public hosts.

## Seats

A guest controls a seat. A seat may be assigned to a party member. The party member remains campaign canon even when no guest is connected.

Seat state should support:

- invited
- pending approval
- connected
- staged input
- ready
- disconnected

## Turn Inputs

Remote player action approval is a host table setting, separate from join approval. It defaults to off.

When `requireGuestActionApproval` is off, an approved guest's action is written as a visible party message and queued for the host turn pipeline. The host still owns SQLite, provider calls, state effects, and turn resolution. The renderer auto-resolves the earliest queued guest action only while the provider/turn engine is idle, no repair is pending, and the host is not composing a message. This preserves the normal table cadence: one party member acts, then the DM responds.

When `requireGuestActionApproval` is on, remote inputs wait for the host to stage or resolve them manually.

When `holdGuestActionsForGroupInput` is on, remote inputs do not auto-resolve. The host can collect multiple party-member messages and resolve them as a grouped table turn. This should be a deliberate pacing choice, not the default.

In combat, remote actions still respect active actor rules: a remote combat action resolves only when that remote-controlled actor is the current combatant. Guest clients do not skip initiative or mutate combat state.

## UI Requirements

- Main app invite generation should be visible on the party/seat panel.
- Thin client join should be visible on the main view.
- Host approval should appear next to the relevant party member/seat.
- "Host approval for guest actions" should remain a clear Local Table option, defaulting off for smoother same-room play.
- "Hold guest actions for a group turn" should remain host-controlled and default off.
- The renderer should consume a multiplayer session projection rather than deriving host/guest local-table UI state inline.

## Current Projection Module

`app/multiplayer-session-panel.js` now derives:

- local table state and address
- whether host start/stop/sync/resolve controls are enabled
- connected guest rows
- pending input rows
- guest client sync affordances

It is not authoritative. Host state still comes from campaign multiplayer data; guest state still comes from scoped host snapshots.

## Security Notes

LAN multiplayer currently uses invite tokens plus per-connection secrets. Guest routes are intentionally narrower than host routes: guests can request join, fetch a scoped snapshot, submit/pass their assigned action, or disconnect. Private host/campaign/provider routes remain launch-token protected.

Future internet multiplayer needs a different authentication and transport model. Do not expose the current LAN API directly to the public internet.
