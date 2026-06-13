# Controller Assignment

In LoreKeeper, a party member is campaign canon. A player is only a temporary controller.

This lets a character move between solo play, AI companion play, host control, and remote guest control without changing who the character is in the campaign.

## Controller Kinds

```ts
type ControllerKind =
  | "host"
  | "remote_player"
  | "ai_companion"
  | "unassigned";
```

Party members carry:

```json
{
  "controllerKind": "remote_player",
  "controllerId": "player-jess-1234",
  "fallbackControllerKind": "ai_companion"
}
```

## Rules

- Host is authoritative.
- Remote players control assigned party members only.
- Remote players do not own party members.
- Guest disconnect releases remote control.
- Released characters fall back to `fallbackControllerKind`.
- Canon character data remains independent from connection/player data.

## Examples

Mira starts as an AI companion:

```json
{
  "name": "Mira Quickstep",
  "controllerKind": "ai_companion",
  "controllerId": null,
  "fallbackControllerKind": "ai_companion"
}
```

Jess joins to control Mira:

```json
{
  "name": "Mira Quickstep",
  "controllerKind": "remote_player",
  "controllerId": "player-jess-1234",
  "fallbackControllerKind": "ai_companion"
}
```

Jess leaves. Mira remains in the campaign and returns to AI companion mode.

## UI Guidance

Multiplayer should be discoverable but not dominant:

- show controller badges on party cards
- keep Invite Player on party cards
- keep local table controls in setup
- show public guest messages in table chat
- use a small Submit action on pending guest messages

This preserves the solo-first flow while making a second local player easy to add.
