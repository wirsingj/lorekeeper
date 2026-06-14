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

In RP/exploration, remote inputs are staged for host approval or grouped turn submission.

In combat, if settings allow immediate remote combat turns, the guest input can be resolved when the remote-controlled actor is active. Otherwise it is staged for host approval.

## UI Requirements

- Main app invite generation should be visible on the party/seat panel.
- Thin client join should be visible on the main view.
- Host approval should appear next to the relevant party member/seat.
- "Submit" for guest input should be labeled "Stage" unless it immediately resolves an active combat turn.

## Security Notes

LAN multiplayer currently uses invite tokens plus per-connection secrets. Guest routes are intentionally narrower than host routes: guests can request join, fetch a scoped snapshot, submit/pass their assigned action, or disconnect. Private host/campaign/provider routes remain launch-token protected.

Future internet multiplayer needs a different authentication and transport model. Do not expose the current LAN API directly to the public internet.
