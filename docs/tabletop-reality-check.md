# LoreKeeper Tabletop Reality Check

Date: 2026-06-14

This pass evaluates LoreKeeper as a tabletop product, not just a codebase. The bar is: would a D&D player believe they are sitting at a live table with a competent DM, or would they immediately feel the machinery?

## Top 20 Immersion-Breaking Issues

1. Critical - A submitted player action is persisted before provider success; on failure/reload the player bubble can look accepted while the DM is silent.
2. Critical - Remote-only structured inputs were valid in `createPlayerTurn` but rejected by the local provider runner when `playerMessage` was empty. Fixed in this pass.
3. Critical - Enemy/DM combat turns can still be provider-led in places, so the app can feel like it is asking the model to be the combat engine.
4. High - Auto-resume of unresolved player turns is invisible; it can feel like the app is replaying or recombining old messages.
5. High - Choice panels can still feel over-present when the DM should simply narrate consequences.
6. High - Provider narration can repeat the player's action instead of reacting to it.
7. High - DM quality depends heavily on prompt compliance instead of scene/consequence projections being visible and assertive.
8. High - Repair states use implementation language that reads like software, not table flow.
9. High - Guest action language was misleading about who submits to the DM. Fixed wording in this pass.
10. High - Combat still sometimes reads as prose with mechanics appended, rather than a clean D&D resolution beat.
11. Medium - Meta lines under chat bubbles expose provider plumbing during play.
12. Medium - Nudge/Retry/Read Latest controls are not framed as table actions.
13. Medium - Long provider generations can make the table feel frozen unless the status is very clear.
14. Medium - Party member agency states are visible but still require learning app-specific badges.
15. Medium - The right-side records panel competes with table state during live play.
16. Medium - Table talk is useful, but it is still visually secondary and may be missed by guests.
17. Medium - Scene purpose/tension is not always visible enough for the host to know why the DM is doing something.
18. Low - Default placeholder text is too specific and can leak an old test tone.
19. Low - Combat round labels are useful but sparse; they do not yet feel like a full encounter tracker.
20. Low - Empty states are clean, but they do not always teach the next table action.

## Top 20 State/Turn Bugs To Keep Attacking

1. Critical - Pre-provider player echo creates stale accepted-looking player messages after provider failure.
2. Critical - Remote-only provider turns were rejected by `runPromptThroughLocalProvider`. Fixed.
3. Critical - app/app.js still owns too many turn, provider, recovery, and automation decisions.
4. Critical - Auto-resume can replay a prior action without a user-visible "recovering failed turn" affordance.
5. High - `lastAutoResolved*` guards are runtime-only and can reset across reloads.
6. High - Post-turn recovery can trigger repair, enemy auto-turn, and remote-input auto-resolve close together.
7. High - Campaign polling calls `seedPlayLog()` while live UI state is active, so any persistence mismatch can feel like duplication.
8. High - Repair-required state blocks nudge/send but the recovery path is not table-obvious.
9. High - Combat prompt repair infers active actor from DM prose; this is a fallback that should remain suspect.
10. High - Host/client snapshots can lag local actions by polling interval.
11. Medium - Choice selection state is global renderer state and can be stale-prone.
12. Medium - Provider response import still auto-commits some implicit changes.
13. Medium - Local table pending inputs depend on cleanup after successful import.
14. Medium - Guest reconnect relies on stored connection metadata and host snapshot agreement.
15. Medium - Message IDs are UI-generated before persistence; conflicts are unlikely but not impossible in long sessions.
16. Medium - TurnFlow and app-level booleans still coexist in some paths.
17. Medium - Provider cancellation is locally authoritative, but old provider results still need every caller to respect request IDs.
18. Medium - Active campaign changes reset TurnFlow but not every app-level helper key.
19. Low - Diagnostics are present but not yet a first-class "what happened?" table view.
20. Low - Some status text still compresses distinct states into one label.

## Top 10 Combat Issues

1. Critical - Enemy turns still sometimes rely on provider output to advance cleanly.
2. Critical - Player-facing attack/check/damage records are not always app-owned before narration.
3. High - Active actor gating is improved but still depends on UI projection correctness.
4. High - Improvised actions need clearer app-side roll selection and outcome records.
5. High - Combat end is covered by tests for enemies defeated, but surrender/retreat/de-escalation needs equal treatment.
6. Medium - HP display exists, but enemy HP visibility policy needs deliberate table settings.
7. Medium - Mechanics formatting can clean duplicates, but provider can still produce awkward mechanic prose.
8. Medium - Action option labels depend on sheet quality; malformed sheets need graceful fallbacks.
9. Medium - AI companion combat actions need a clear host approval policy.
10. Low - Initiative display is functional but not yet rich enough for long encounters.

## Top 10 Multiplayer Issues

1. Critical - Remote-only turns were blocked by local provider runner. Fixed.
2. High - Host approval off/on is conceptually right, but UI still needs stronger "sent, waiting, resolved" state.
3. High - Guest agency depends on obvious assignment and join-as feedback.
4. High - Disconnect/reconnect table state needs extended manual soak testing on two machines.
5. High - Host authority is mostly clear in code, but guest UI can feel like it is talking to an empty room while waiting.
6. Medium - Polling-based sync can create visible latency.
7. Medium - Table talk is independent, but its persistence/sync should be included in multiplayer soak tests.
8. Medium - Group-hold mode needs stronger explanation before public use.
9. Medium - Pending input cleanup is success-dependent; failed provider turns leave queued intent.
10. Low - Invite/join flows are better, but still need one obvious happy-path checklist for nontechnical users.

## Top 10 RP/DM-Quality Issues

1. High - The provider can still escalate too quickly instead of using consequences.
2. High - NPC motivations are not always retrieved as active constraints.
3. High - Relationship state is not visible enough in scene packets.
4. High - Choices can become a crutch instead of emerging from real pressure.
5. Medium - Consequences exist, but the UI does not strongly communicate them during play.
6. Medium - Scene status/tension is mostly behind the scenes.
7. Medium - Provider sometimes restates the action rather than showing changed reality.
8. Medium - Downtime/travel scenes need more soak tests than combat currently has.
9. Low - Prompt text has strong DM philosophy, but local models may still need higher-quality scene packets.
10. Low - The app needs curated scenario fixtures for social, travel, mystery, and downtime.

## Recommended Fixes

1. Make submitted player bubbles explicitly pending until provider import succeeds, then mark accepted or failed.
2. Continue moving recovery decisions out of `app/app.js` and into TurnEngine/ProviderOrchestrator.
3. Add a visible "Recovering last turn" state before auto-resume replays anything.
4. Make combat action resolution app-owned for attack/check/damage before provider narration.
5. Add multiplayer soak tests for remote-only action, guest disconnect, reconnect, campaign switch, and combat active actor.
6. Make scene/consequence summaries visible enough that the host understands why the DM is reacting.
7. Keep choices suppressed by default in RP unless danger, uncertainty, or player indecision justifies them.
8. Add a table-facing diagnostics drawer that says what the app is waiting for in human terms.

## Implemented In This Pass

1. Fixed local provider generation to accept structured remote-only player inputs.
2. Changed ThinLoreKeeper input placeholder from "The host submits it to the DM" to "Send to the host table" so it matches both direct-send and host-hold modes.
3. Added a regression assertion that `app/app.js` keeps accepting remote-only structured player inputs.

## Tests Added

1. Extended `scripts/test-engine-architecture.js` to guard the remote-only structured input provider path.

## Remaining Risk

The biggest remaining product risk is not a missing feature. It is the coexistence of table-state recovery, provider-response repair, auto enemy turns, multiplayer polling, and player-message echo inside `app/app.js`. The app can now survive more cases, but when it fails it still sometimes fails in a way that feels supernatural to the player. The next hardening cut should make every pending/recovery state explicit and table-facing.
