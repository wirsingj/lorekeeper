# LoreKeeper Tabletop Reality Check

Original pass: 2026-06-14  
Updated: 2026-06-15

This is a product audit for the real goal: LoreKeeper should feel like sitting at a natural D&D 5E table. The party members are the people around the table. The app plus AI provider is the DM. The user should not feel like they are debugging a model, managing queue machinery, or translating app concepts while trying to play.

Status legend:

- Fixed: covered by current code and regression tests or browser smoke checks.
- Improved: materially better, but needs more soak testing.
- Open: still a product or architecture risk.
- Watch: acceptable for now, but likely to regress without tests or fixtures.

## Current Table Model

1. The DM voice is app/provider owned. DM narration should describe the world, NPCs, consequences, rules calls, and combat outcomes.
2. Party members are table voices with agency. Host-controlled and remote-controlled party members must not be spoken for by the DM/provider unless the controller submitted that speech/action.
3. AI companions are party members, not NPCs. They may make small suggestions or RP beats when nudged or idle, but their major choices and combat turns still need host/controller approval.
4. Enemies and NPCs are DM actors. They may act on their turns without player input, but combat state should remain structured and visible.
5. The app owns continuity, turn state, controller state, combat state, and recovery affordances. The provider supplies narration and structured proposals within those rails.

## Fixed Since 2026-06-14

1. Fixed - Remote-only structured inputs are accepted by the local provider path.
2. Fixed - Guest action wording now says actions go to the host table instead of implying every guest action directly submits to the DM.
3. Fixed - Submitted player bubbles now carry visible lifecycle state while waiting for DM/provider completion.
4. Fixed - Diagnostics now include a readable table timeline summary.
5. Fixed - The provider runner accepts either `playerMessage` or structured `playerInputs`.
6. Fixed - Host-created campaign characters now use a repeatable additional-character flow instead of a single special joiner.
7. Fixed - Compact character auto-complete exists across campaign creation, post-start host-created party members, guest join, and ThinLoreKeeper join.
8. Fixed - The first campaign character is explicitly host-controlled; additional host-created campaign characters default to AI companions.
9. Fixed - Returning a character from remote player control to AI/host disconnects stale guest controller links so later reconnect cleanup does not reclaim the character.
10. Fixed - Structured provider rows with a party speaker but mistaken `role: "dm"` are rendered as party speaker lines, allowing the party-message splitter to recover them.
11. Fixed - Grouped enemies such as `Bandit, count: 5` expand into separate combatants and initiative rows.
12. Improved - Prompt and model-contract guidance now explicitly tells the provider not to speak, move, signal, scan, or choose for party members without submitted input.
13. Improved - Combat prompts tell the provider to stop after the current actor's resolved action and not roll the next actor in the same response.
14. Improved - Choice panels are suppressed more aggressively outside combat, immediate danger, explicit option requests, or real tactical branches.
15. Improved - Join-as character requests carry more complete character details and host integration notes.
16. Improved - Normal play hides raw provider/model `Meta:` lines; debug meta remains available with `?debugMeta=1` or `localStorage.lorekeeper.showDebugMeta = "1"`.
17. Improved - The DM prompt now receives hidden long, mid, and short term story threads so play has private campaign direction beyond the immediate scene.
18. Fixed - Hidden story threads are stored as `dm_only` story-arc quest records, are auto-committed when proposed by the DM, and are filtered out of visible thread/context lists and multiplayer public snapshots.
19. Improved - Table status language now translates waiting-for-combat-actor and guest-action states into table-facing wording.
20. Fixed - The table status strip now lives above the main play log instead of in the side rail, so waiting/recovery state is always in the play surface.
21. Fixed - Setup diagnostics now includes a visible debug-meta toggle for play/debug mode.
22. Improved - App-owned combat can now end through nonlethal outcomes such as surrender, retreat, or de-escalation instead of only HP defeat.
23. Fixed - A two-machine first-playtest checklist now exists at `docs/two-machine-playtest-checklist.md`.
24. Improved - Ollama context tokens are cached per campaign/model/mode as non-canon provider memory, so same-campaign warmth can help without cross-campaign bleed.
25. Improved - Combat tracker rows now include compact conditions, defeated state, movement remaining, and action-spent hints.
26. Improved - Failed provider turns now mark approved/remote party inputs as "Still staged" instead of leaving them looking silently consumed or indefinitely processing.

## Top Immersion Risks Still Open

1. Open - Combat resolution is still partly provider-led for enemy turns and improvised actions. The app has a combat engine, but not every table combat beat is app-owned before narration.
2. Open - Auto-resume and recovery states are better surfaced, but the user still needs a clearer "recovering last turn" table affordance before anything is replayed.
3. Open - Repair/retry/import controls still expose some software-shaped concepts. The labels are friendlier, but the mental model is not yet purely table-shaped.
4. Fixed - Meta lines under bubbles are hidden during normal play, and Setup diagnostics has a visible debug-meta toggle.
5. Improved - Hidden DM story direction now gives the provider long/mid/short campaign intent. Scene purpose, current tension, and consequence summaries still need stronger visible presentation.
6. Open - AI companion contribution rules are improved, but the UI still relies on badges and buttons that need learning.
7. Improved - Long provider generations now surface in the main play area. Needs real-session soak testing for whether it is visible enough under pressure.
8. Open - The right-side binder can compete with live play. It is powerful, but the play surface is not yet fully separated from campaign management.
9. Open - Table talk exists but can be missed by guests and hosts during active play.
10. Open - Local multiplayer still needs longer two-machine soak testing across disconnect, reconnect, campaign switch, combat turn, and host approval modes.
11. Watch - Choice panels can still become a crutch if local models ignore the narration-first policy.
12. Watch - Provider narration can still restate the player's action instead of showing changed reality.
13. Watch - Host/client snapshots can lag actions by polling interval.
14. Watch - Pending input cleanup depends on successful provider import and can leave intent queued after failure.
15. Watch - Active campaign changes reset TurnFlow, but app-level helper keys still coexist with TurnFlow state.

## Real Table Acceptance Matrix

| Table expectation | Current status | Notes |
| --- | --- | --- |
| The player can tell whose turn it is. | Improved | Combat tracker and input placeholder are clear for basic cases. Needs richer long-encounter context. |
| The player can tell who controls each character. | Improved | Badges/actions exist, and controller cleanup improved. Badge language still needs user testing. |
| The DM does not speak for controlled PCs. | Improved | Prompt, context, renderer recovery, and suppression logic all help. Needs scenario fixtures. |
| AI companions feel like party members, not DM puppets. | Improved | Nudge flow and creation defaults help. Major-choice approval still needs smoother UI. |
| Guest players know whether their input was sent, waiting, or resolved. | Improved | Wording and lifecycle states improved. Needs multiplayer soak testing. |
| Combat has one row per active combatant. | Fixed | Count/quantity expansion covers grouped enemies. |
| Combat rolls and HP changes are visible. | Improved | Mechanics rendering exists. App-owned resolution needs broader coverage. |
| The DM continues scenes without forcing options. | Improved | Prompts and choice suppression improved. Needs more social/travel/downtime fixtures. |
| The DM has a story beyond the current scene. | Improved | Hidden story arcs are sent to the provider and can be updated as `dm_only` quest records. Needs scenario soak testing. |
| Recovery after provider failure feels understandable. | Improved | Player echoes and staged party inputs now show failure/still-staged lifecycle badges. Broader replay decisions still need table-facing recovery flow. |
| Character creation is consistent across entry points. | Fixed | Shared compact auto-complete and aligned controller defaults are in place. |

## Current Top 20 Issues To Keep Attacking

1. Critical - Make common combat action resolution app-owned before provider narration: attack roll, check/save, damage/healing, HP/resource/condition updates, and initiative advancement.
2. Critical - Add explicit table-facing recovery before auto-resume or repair retry reuses any prior player action.
3. Critical - Continue moving recovery decisions out of `app/app.js` into TurnFlow, ProviderOrchestrator, and combat/multiplayer domain modules.
4. High - Add scenario fixtures that prove the provider cannot speak for host/remote PCs across social, combat, and join-transfer cases.
5. High - Continue strengthening the "what the table is waiting for" surface so it is always visible and covers every stuck state.
6. Fixed - Separate debug meta from normal play mode. Raw bubble meta is hidden by default and has a visible Setup diagnostics toggle.
7. High - Make AI companion approval feel like a table beat: suggest, approve, resolve, or decline.
8. High - Add enemy-turn and player-turn combat fixtures that verify one actor is resolved per provider response.
9. Improved - Add surrender, retreat, intimidation, de-escalation, and chase endings to combat tests. Surrender/de-escalation app-owned end-combat fixtures exist; chase and richer intimidation contests remain.
10. Improved - Add two-machine multiplayer soak scripts/checklists for guest join-as, assigned seat, disconnect, reconnect, and combat turn gating. A first-playtest checklist exists; scripted/disconnect soak remains.
11. Medium - Make scene tension/consequence summaries and optional hidden-story debug summaries more visible in settings/diagnostics, not live play.
12. Medium - Clarify enemy HP visibility policy for host and guest views.
13. Improved - Improve combat tracker density for longer encounters: conditions, defeated state, movement remaining, and action spent now show in compact row metadata. Concentration and richer resource badges remain.
14. Medium - Make group-hold multiplayer mode explain itself before public use.
15. Improved - Ensure failed provider turns keep pending inputs visibly staged rather than silently stuck. Approved and remote party inputs now keep retryable "Still staged" lifecycle badges after provider failure.
16. Medium - Add curated social, travel, mystery, downtime, and combat campaigns as regression fixtures.
17. Medium - Make right-side binder collapsible or context-sensitive during active play.
18. Low - Replace remaining overly specific placeholder text with neutral table examples.
19. Low - Improve empty states so they teach the next table action.
20. Low - Add a plain "session health" summary for host troubleshooting.

## Combat Reality Check

Current direction is correct, but combat is the highest-risk area because D&D table flow has very strong expectations.

Fixed or improved:

1. Fixed - Initiative can recover missing combatants and expands grouped enemies.
2. Improved - Party-member turns are treated as input turns, including AI companions.
3. Improved - Provider instructions forbid resolving the next initiative actor in the same response.
4. Improved - Combat tracker shows active actor, round, party/enemy rows, and HP labels.

Still open:

1. The app should own the standard resolution loop: declare action, validate/legal option, roll, apply effects, log mechanics, narrate.
2. Improvised actions need clearer app-side roll selection and outcome records.
3. Enemy turns should be more app-bounded. The provider can narrate and choose intent, but state mutation should be guarded.
4. Non-lethal combat endings are started: explicit app-owned surrender/retreat/de-escalation endings exist, but need richer contest and chase coverage.
5. AI companion combat turns need a crisp host approval flow: request/suggest, approve, resolve.

## Multiplayer Reality Check

Fixed or improved:

1. Fixed - Remote-only player inputs can drive provider turns.
2. Fixed - Join-as character creation is richer and standardized.
3. Fixed - Controller transfer to AI/host clears active stale guest connections.
4. Improved - Guest wording now describes actions as sent to the host table.
5. Improved - Host approval and group-hold modes have stronger status hooks.

Still open:

1. Polling latency can still make the table feel quiet or stale.
2. Guest UI needs a clearer "the host has it" state after submitting.
3. Host UI needs a stronger "guest is waiting on you" affordance.
4. Disconnect/reconnect requires real LAN soak testing, not only unit tests.
5. Campaign switching while guests are connected needs a stricter product rule.

## Character Creation Reality Check

Fixed:

1. Host-created during campaign creation: primary required host character plus `+` for additional AI companions.
2. Host-created after campaign start: party `+` creates a proper AI-companion character with a 5E-lite sheet.
3. Guest creation during join flow: same compact fields and auto-complete behavior.
4. ThinLoreKeeper join flow: same compact fields and auto-complete behavior.
5. Partial input is preserved. Example: `Thor`, `Dwarf`, `Scout` remains authoritative while missing details are filled.

Open:

1. Auto-complete is deterministic and local. That is fast and safe, but it is not yet campaign-aware beyond basic party names.
2. Additional campaign characters are AI companions by default. That matches the current design, but the UI should eventually let the host choose host/AI/unassigned per character.
3. Character sheet quality is good enough for 5E-lite starts, but class/subclass/spell/equipment depth is still shallow.
4. There is no explicit party-template flow yet for "four dwarf soldiers" or "heist crew" beyond repeated `+` plus auto-complete.

## RP And DM Quality Reality Check

Fixed or improved:

1. Prompt philosophy is stronger: consequences over random escalation, choices only when justified, NPC motives before new threats.
2. Context packs include controller guidance for host, remote, unassigned, and AI companion party members.
3. Structured table rows and speaker recovery reduce DM/party role mixups.

Still open:

1. NPC motivation and relationship state need to be more visible and assertive in the active scene packet.
2. Provider output still needs scenario-based regression tests for social play, travel, mystery, downtime, and recovery.
3. The app should make consequences visible enough that the host understands why the DM is reacting a certain way.
4. Local model quality may still need shorter, stronger scene packets and repair prompts.
5. Hidden long/mid/short story threads now exist as private DM context, but need scenario tests to prove they adapt without leaking future twists.

## Recommended Next Fixes

1. Fixed - Expand the table-facing "Waiting For" strip: it now lives above the play log and uses table wording for DM thinking, combat actor waits, guest action waits, host review, and enemy turns.
2. Move the remaining provider recovery and auto-resume decisions out of `app/app.js`.
3. Continue combat resolution fixtures for save, skill contest, spell, help, disengage, chase/flee details, and enemy turn. Attack, dodge, defeat, and explicit surrender/de-escalation coverage exist.
4. Add provider-output fixtures that intentionally mislabel speaker roles and verify controlled party agency is preserved.
5. Improved - Add two-machine multiplayer soak checklist and run it before broad playtesting. Checklist exists at `docs/two-machine-playtest-checklist.md`; still needs a real two-machine run.
6. Fixed - Add a visible play/debug mode toggle. Raw provider meta is hidden by default and can be toggled from Setup diagnostics.
7. Add campaign-aware character auto-complete that can use party theme, campaign premise, and existing characters without overriding supplied fields.
8. Add a compact encounter tracker upgrade: conditions, defeated state, active resources, action spent.
9. Add curated scenario fixtures for social negotiation, wilderness travel, investigation, downtime, and combat.
10. Add a host-facing "session health" panel that explains stuck states in human terms.

## Regression Tests Added Or Updated

Current coverage includes:

1. Remote-only structured provider inputs.
2. Submitted turn lifecycle markers.
3. Table timeline diagnostics presence.
4. New campaign additional-character wiring.
5. Speaker-role mismatch recovery for party rows.
6. Grouped enemy expansion into separate combatants and initiative rows.
7. Remote controller transfer back to AI without stale reconnect reclaiming control.
8. Join-as character creation during normal and combat flows.
9. Combat start, turn advance, defeated-enemy end, and combat tracker projection.
10. SQLite storage round-trip for engine state, turn records, and combat actions.
11. Hidden DM story threads are included in provider context but filtered from visible context/thread lists.
12. `dm_only` story-arc quest changes preserve visibility and do not attach secret quest IDs to the visible scene.
13. Table status vocabulary covers waiting for a named combat actor and waiting for guest/player action.
14. The table status strip is above the play log and the debug-meta toggle exists in Setup diagnostics.
15. App-owned combat resolves dodge state and explicit surrender/de-escalation endings without relying on HP defeat.
16. Per-campaign Ollama context cache normalization prevents model/mode/campaign context reuse across mismatched runs.
17. Combat tracker projection covers condition tags, action spent, movement remaining, and defeated state.
18. Failed provider turn paths preserve approved/remote party inputs visually as retryable staged table actions.

## Remaining Product Risk

The largest remaining risk is still the same category as yesterday, but narrower now: the app has stronger rails, yet several recovery and combat paths still coexist in `app/app.js` with provider import, repair, multiplayer polling, auto enemy turns, and pending input cleanup. When everything works, the table feels much closer to natural play. When it fails, the next priority is making the failure table-facing: who is waiting, what is staged, what is being retried, and what the host can do next.
