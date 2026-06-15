# Anti-Supernatural State Pass

Date: 2026-06-14

Goal: every important table transition should have a visible, player-facing explanation. LoreKeeper can still keep technical diagnostics, but the live table should not feel haunted.

## Table Status Vocabulary

Use table language first:

- "DM is thinking..." instead of "provider generating" or "Ollama generating".
- "DM response needs review." instead of "repair required".
- "DM is reconsidering the response..." instead of "retrying strict JSON contract".
- "Recovering unresolved turn..." instead of silently replaying a failed player action.
- "Party action staged for the next turn." instead of hidden pending input state.
- "Guest action received; DM is resolving it..." instead of an invisible host-side auto-forward.

Raw provider/app details remain available in diagnostics and in status tooltips.

## Transition Visibility Map

| Transition | Trigger | Owner | User-visible explanation |
| --- | --- | --- | --- |
| Send turn | Host/player submits input | TurnEngine/App shell | "Turn submitted; DM is resolving it." |
| Provider generation | Local/bridge provider starts | ProviderOrchestrator | "DM is thinking..." |
| Cancel | User cancels active generation | TurnEngine | "DM response canceled." |
| Retry | User retries failed/repaired turn | TurnEngine | "DM is reconsidering the response..." |
| Repair required | Provider output fails contract | TurnEngine/App shell | "DM response needs review." |
| Auto resume | Last player action has no DM response | App recovery layer | "Recovering unresolved turn..." |
| Enemy turn | Active combat actor is enemy | Combat/Turn automation | "DM resolving enemy actions..." |
| Remote action staged | Guest sends/host holds | MultiplayerSessionEngine/App shell | "Party action staged for the next turn." |
| Remote action direct-send | Guest sends while host allows direct | MultiplayerSessionEngine/App shell | "Guest action received; DM is resolving it..." |
| Host review | Proposed changes require review | Review panel/App shell | "Host reviewing proposed changes." |
| Campaign switch | User changes campaigns | CampaignStateStore/App shell | "Campaign switched; table state reset." |
| Reconnect | Thin client refreshes host snapshot | MultiplayerSessionEngine | "Connected as X" or "Waiting for host approval." |

## Implemented In This Pass

- Added `app/table-status.js` as the first table-facing vocabulary layer.
- Added a renderer `tableTimeline` that records table-facing status and TurnFlow events.
- Included `tableTimeline` in diagnostics so Settings can answer "what just happened?"
- Subscribed TurnFlow runtime events into table-facing timeline entries.
- Converted visible provider activity text through the vocabulary layer while preserving raw details in tooltips.
- Kept the prior remote-only structured input fix and added coverage for the status vocabulary.
- Added visible lifecycle badges to submitted player/party bubbles:
  - "Waiting for DM"
  - "Waiting for DM result"
  - "DM answered"
  - "DM response needs review"
  - "DM timed out"
  - "DM failed"
- Patched submitted player echoes after provider completion/failure so a message no longer sits on the table with no explanation.
- Fixed the local provider orchestrator to accept structured-only remote/guest inputs, not only direct text.
- Added a readable table timeline summary to Settings diagnostics so Inspect shows recent table-facing events before raw JSON.

## Remaining Work

- Add explicit combat turn advancement timeline entries from CombatEngine actions.
- Add guest-side "sent / host received / resolving / resolved" state per submitted action.
- Replace remaining technical bridge/status strings in secondary panels.
- Move auto-resume and combat prompt repair out of invisible app-level helpers into engine projections.

## Acceptance Check

The player should be able to glance at the table and understand whether the app is:

- waiting for them,
- waiting for another player,
- waiting for host review,
- waiting for the DM/provider,
- recovering a failed turn,
- resolving combat,
- or ready for the next action.
