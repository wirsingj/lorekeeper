# Agency Controller

Party membership is canon. Control is temporary.

```ts
type ControllerKind =
  | "host"
  | "remote_player"
  | "ai_companion"
  | "npc_dm"
  | "unassigned";
```

## Rules

- Host-controlled and remote-controlled actors require human input for major choices.
- AI companions may speak or suggest actions when allowed by settings.
- NPCs and enemies are DM/provider controlled, subject to app validation.
- The provider cannot decide the primary player character's major action.
- The host can override any AI companion or NPC proposal.
- Guest Leave/disconnect releases that remote controller back to Host control so the seat is safe and requestable again.
- Explicit host/controller reassignment can still return a character to AI companion or another configured controller.

## UI Requirements

Party cards should show controller badges that mean something:

- `HOST`
- `REMOTE`
- `AI`
- `DM`
- `UNASSIGNED`

Actions like Claim, Invite Player, Approve, Stage, and Override should be driven by controller state, not scattered UI conditions.
