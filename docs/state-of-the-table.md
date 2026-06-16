# LoreKeeper State Of The Table

Updated: 2026-06-16

This is the sliding-window working doc for LoreKeeper's current product state, goal, and improvement checklist. When we say "keep working through the state-of-the-table," this is the doc to use first.

Source docs consolidated here:

- `docs/tabletop-reality-check.md`
- `docs/two-machine-playtest-checklist.md`
- `docs/model-io.md`
- `docs/lorekeeper-json-contract.md`
- `docs/local-multiplayer.md`
- `docs/anti-supernatural-state.md`
- `docs/validation-and-recovery.md`
- `docs/product-maturity-review.md`
- `docs/deep-audit-hardening-2026-06.md`
- `docs/table-authority-model.md`
- `docs/session-isolation.md`

Status legend:

- Fixed: covered by current code and tests or a successful smoke check.
- Improved: materially better, but needs real-session soak testing or more fixtures.
- Open: still a product or architecture risk.
- Watch: acceptable for now, but likely to regress without tests or fixtures.

## North Star

LoreKeeper should feel like sitting at a natural D&D 5E table.

The party members are the people around the table. The DM is the app plus the AI provider. The app owns continuity, state, rules, recovery, and table flow. The model provides narration, NPC behavior, atmosphere, suggested checks, and structured proposals inside app-owned rails.

The user should not feel like they are debugging a model, managing queue machinery, or translating software concepts while trying to play.

Every table surface should answer the same practical questions a real table answers without explanation: where are we, whose attention is needed, who controls this character, what just happened, what can I do now, and what is remembered as true.

## Table Model

1. The DM voice is app/provider owned. It describes the world, NPCs, consequences, rules calls, and combat outcomes.
2. Party members are table voices with agency. Host-controlled and remote-controlled party members must not be spoken for by the DM/provider unless the controller submitted that speech/action.
3. AI companions are party members, not NPCs. They can make brief low-stakes RP contributions when nudged or when the table is idle, but major choices and combat turns still need host/controller approval.
4. Enemies and NPCs are DM actors. They may act on their turns without player input, but combat state should remain structured and visible.
5. The DM can address the whole party, one character, a subset, the current combat actor, or call for a party vote.
6. The host is authoritative for campaign state, remote approvals, model calls, canon review, and tie-breaking.
7. SQLite/app state is canon. Provider context memory is only scratch memory and must never be trusted as canon.

## Current State Snapshot

### Stronger Now

1. Local Qwen3 works better after disabling Ollama JSON mode for Qwen3 and adding `/no_think`.
2. Provider JSON output is validated and bad `{}` responses are rejected instead of imported as narration.
3. Campaign SQLite has an `errors` table for provider/session diagnostics.
4. Hidden long/mid/short story threads exist as `dm_only` story-arc quest records and are sent to the provider as private DM planning context.
5. Party/character/vote/combat-actor choice targeting exists in the model contract and play log UI.
6. Normal play hides raw provider meta while diagnostics remain available.
7. Table status language has shifted toward table-facing wording: DM thinking, waiting for actor, recovery, staged input.
8. Character creation is standardized across campaign creation, post-start host creation, guest join, and LoreKeeper Join.
9. Additional host-created characters default to AI companions, while the first campaign character is host-controlled.
10. Grouped enemies can expand into separate combatants and initiative rows.
11. Guest inputs can drive provider turns through structured `user.playerInputs[]`.
12. Failed provider turns preserve approved/remote inputs as visibly staged rather than silently consuming them.
13. CombatEngine can now resolve app-owned attacks, DC checks, opposed checks/contests, simple spell saves, spell-slot spending, conditions, logged rolls/effects, and initiative advancement.
14. The unified front door now treats Host, Join, and Provider Setup as first-class app-level flows.
15. The app starts in a neutral lobby mode instead of visibly sitting at the last active table.
16. Join before connection is now a lobby flow with a Back control, not an in-campaign table view.
17. Provider/App Settings open from the lobby without implicitly entering the last campaign.
18. Host/table mode has a Main Menu return control so the front door is reachable after entering a campaign.
19. Guest action lifecycle now uses clearer sent/waiting/queued/resolved language on both guest and host surfaces.
20. Session health now names the waiting party member and distinguishes host approval, grouped turns, queued DM actions, passes, and guest sent state.
21. Table Talk now gets a subtle unread cue when new side-chat messages arrive.
22. Host New is now a full pre-table setup workspace with party controller intent instead of a small modal over the last table.
23. Same-network guests can open `/guest`, enter a waiting room, and be seated by the host without a packaged client or pasted invite link.
24. Host Local Table now exposes a copyable Guest Link built from the detected LAN IP and port.
25. Waiting-room guests now surface from the live host snapshot in Local Table, party seating actions, session health, and the table status strip.
26. Waiting-room presence now uses guest heartbeat/stale filtering so old guest names do not linger after campaign switches or closed tabs.
27. The front door Host flow now requires choosing an existing campaign instead of dropping into the last active table.
28. Generated Guest Links are scoped to campaign, table, and session identity so stale links do not silently join a different active campaign or table.
29. Multiplayer waiting guests, invite links, guest snapshots, staged actions, combat joins, and table talk now carry table/session ownership and reject supplied identity mismatches.
30. The right rail is split into Campaign Notes and Player Notes, with Table Talk anchored at the bottom of the table surface.
31. Controlled-party agency validation now rejects obvious model output that speaks or acts for a host/remote/unassigned party member without submitted controller input.
32. Route classification tests now cover the guest-public vs host-protected API boundary.
33. Auto-resolved enemy combat turns now run through CombatEngine and commit app-owned rolls/effects/initiative before narration.
34. Enemy combat resolution glue is extracted from `app/app.js` into a focused combat-resolution controller with tests.
35. Provider combat validation now rejects resolved combat changes whose `resolvedActorId` is not the active initiative actor.
36. Desktop `lorekeeper://join` links now open Join mode with the invite preloaded, replacing stale saved guest sessions from prior tables.
37. Fixed-seat guest joins now require a table-visible name instead of silently falling back to "Guest Player."
38. Remote guests can vote on party-scoped choice prompts without drafting locked action text; vote counters and a host-facing vote summary are shown on the choice panel.
39. Guest Leave now notifies the host, releases the remote controller to Host, and makes the vacated seat requestable again.
40. Server security tests now exercise the API-token authorization decision for public guest routes, protected host routes, unknown API routes, and local assets.
41. JSON contract fixtures now prove narration-first choice suppression across social, travel, exploration/mystery, downtime, and recovery-like scene beats.
42. Left rail layout now constrains party/combat records and action rows so long names/buttons wrap locally instead of forcing horizontal panel scroll.
43. Party-vote panels now give the host a "Use leading choice" action when remote votes have a clear leader.

### Still Risky

1. Combat resolution is still partly provider-led for improvised/richer actions and some repair/import paths.
2. `app/app.js` still owns too much orchestration around submit/import/repair/recovery/combat/multiplayer.
3. Repair/retry/import still exposes some software-shaped concepts.
4. AI companion approval is still a button/badge flow, not yet a smooth table beat.
5. Party-vote collection now works for remote guests, and clear leaders can be selected by the host from the panel. Tied votes and final confirmation are still lightweight, without a dedicated tie-break/confirm modal.
6. Local multiplayer still needs longer two-machine soak testing.
7. Guest "sent / host received / resolving / resolved" state is clearer, but still needs two-machine soak testing.
8. Table Talk has a subtle unread cue, but should still be checked during two-machine play.
9. Provider narration can still restate the player's action or lean on option panels too much.
10. Pending input cleanup still depends on successful provider import and can leave intent queued after failure.
11. Active campaign changes reset TurnFlow, but app-level helper state still coexists with engine state.
12. Context retrieval is still coarse and recent-message heavy compared with the desired actor/place/consequence/thread retrieval.
13. Settings are still physically one dialog; app-level preferences and campaign-level settings need a fuller split after the front-door shell stabilizes.
14. Pre-table guest lobby is only partially built: `/guest` waiting room works for an active table, but a brand-new unsaved campaign draft does not yet have its own safe table/session identity for seating guests.
15. Player Notes are local UI convenience notes, not yet campaign-SQLite-backed, shared, exported, or portable across devices.
16. Campaign Notes are populated from campaign records, but extraction/retrieval quality still needs scenario testing to prove the right people, places, things, and threads appear at the right time.

## Live Acceptance Matrix

| Table expectation | Status | Notes |
| --- | --- | --- |
| Player can tell whose turn it is. | Improved | Combat tracker and input placeholder cover basic cases. Long encounters need richer context. |
| Player can tell who controls each character. | Improved | Badges/actions exist. Language still needs user testing. |
| DM does not speak for controlled PCs. | Improved | Prompt, context, renderer recovery, suppression, and obvious output validation help. Needs broader scenario fixtures. |
| AI companions feel like party members. | Improved | Nudge flow and creation defaults help. Approval flow still needs polish. |
| DM can address party or specific party members. | Improved | Choice metadata supports party, character, subset, vote, and combat actor. Remote vote counters exist; explicit host tie-break/confirm polish remains open. |
| Guest players know whether input was sent/waiting/resolved. | Improved | Host/guest wording and message lifecycle are covered by tests. Needs two-machine soak. |
| Combat has one row per combatant. | Fixed | Grouped enemy expansion exists. |
| Combat rolls and HP changes are visible. | Improved | Mechanics rendering exists. App-owned attacks, enemy turns, checks, contests, and simple spell saves have coverage. Richer spell/effect rules are still open. |
| DM can continue scenes without forcing options. | Improved | Prompt/choice suppression improved. Needs social/travel/downtime fixtures. |
| DM has story beyond current scene. | Improved | Hidden arcs exist and are private. Needs scenario testing for adaptation, pacing, and non-leakage. |
| Notes support table memory. | Improved | Campaign Notes and Player Notes are split. Player Notes are not yet portable/canonical. |
| Recovery after provider failure is understandable. | Improved | Player echoes and staged inputs show lifecycle. Repair/retry still needs table-shaped flow. |
| Character creation is consistent. | Fixed | Shared compact auto-complete and controller defaults are in place. |

## Priority Queue

### Critical

1. Continue making common combat action resolution app-owned before provider narration: broader action validation, richer damage/healing/effects, reactions, concentration, movement, and edge-case initiative handling.
2. Continue moving recovery decisions out of `app/app.js` into TurnFlow, ProviderOrchestrator, CombatEngine, and multiplayer domain modules.
3. Continue expanding scenario fixtures proving the provider cannot speak for host/remote/unassigned PCs across combat, join-transfer, and AI-companion cases.

### High

4. Finish party-vote host resolution polish: guests can vote from LoreKeeper Join, and the host can see the table's leaning, but ties/confirmation should feel like an explicit table beat.
5. Make AI companion approval feel like a table beat: suggest, approve, resolve, or decline.
6. Add enemy-turn and player-turn combat fixtures that verify one actor is resolved per provider response.
7. Soak-test and keep strengthening the "what the table is waiting for" surface across real stuck states.
8. Run the two-machine playtest checklist and log every friction point.
9. Soak-test guest-side "sent / host received / resolving / resolved" state on two machines.
10. Soak-test host-side "guest is waiting on you" affordance on two machines.
11. Soak-test clicked desktop invite links across fresh guest machine, guest reconnect, host campaign switch, combat, and new campaign/table flows.

### Medium

11. Make scene tension, consequences, and optional hidden-story debug summaries more visible in Settings/diagnostics, not live play.
12. Add curated regression campaigns for social negotiation, wilderness travel, mystery, downtime, and combat.
13. Improve context retrieval around present actors, active place, relationships, consequences, unresolved threads, and private story arcs.
14. Continue combat tracker density work: concentration, richer resources, reactions, conditions, movement, action state.
15. Expand route-level API/security tests beyond classification/token-helper coverage into request/response integration under API-token, LAN origin, and stale identity cases.
16. Add long-campaign performance fixtures and eventually virtualize long play logs.

### Low

17. Replace remaining overly specific placeholder text with neutral table examples.
18. Add pre-table guest lobby: read-only campaign/party setup for guests, editable own character only, clear ready state.
19. Add campaign-aware character auto-complete that uses party theme/premise/existing characters without overriding supplied fields.
20. Add explicit party-template flow for "four dwarf soldiers" or "heist crew."
21. Add backup/export/recycle affordances before destructive delete in release builds.

## Working Checklist

### Model I/O And DM Quality

- [x] Strict JSON contract for local model turns.
- [x] Qwen3 adapter avoids Ollama JSON mode and uses `/no_think`.
- [x] Bad empty structured responses are rejected and logged.
- [x] Hidden long/mid/short story threads are sent as private DM planning.
- [x] Choice targeting supports party, character, subset, vote, combat actor, and free prompts.
- [x] Add provider-output fixtures for obvious controlled-PC agency failures.
- [x] Reject obvious controlled-PC agency violations during response validation.
- [ ] Add richer provider-output fixtures for social, travel, mystery, downtime, combat, and recovery scenes. Current state: narration-first choice-suppression fixtures cover social, travel, exploration/mystery, downtime, and recovery-like beats; richer full-turn fixtures are still needed.
- [ ] Improve context retrieval beyond recent history/context pack breadth.
- [ ] Add hidden-story scenario tests for adaptation without leaking future twists.
- [ ] Tighten prompts so normal scene turns can be rich without always forcing choices.

### Table Flow And Recovery

- [x] Main status strip uses table-facing language.
- [x] Submitted player bubbles show waiting/answered/review/failed lifecycle.
- [x] Auto-resumed unresolved turns mark the original bubble as recovering.
- [x] Failed provider turns keep approved/remote inputs visibly staged.
- [x] Diagnostics include table timeline and session health summary.
- [x] Session health names the waiting character and the next table responsibility for guest inputs.
- [ ] Make repair retry lifecycle as table-shaped as auto-resume.
- [ ] Move remaining recovery/import decisions out of `app/app.js`.
- [ ] Replace remaining technical wording in repair/import controls.
- [ ] Ensure every stuck state answers who is waiting and what the host can do next.

### Combat

- [x] Combat tracker shows active actor, round, party/enemy rows, and HP labels.
- [x] Grouped enemies expand into separate initiative rows.
- [x] Provider is instructed not to resolve the next actor in one response.
- [x] Party-member combat turns are input turns, including AI companions.
- [x] Surrender/de-escalation can end combat without only HP defeat.
- [ ] Make common combat resolution app-owned.
- [x] Add fixtures for app-owned attack, dodge, surrender, de-escalation, DC check, and opposed skill contest.
- [x] Add fixtures for app-owned simple spell save, spell-slot spending, and save-gated conditions.
- [x] Add fixture for app-owned enemy attack turn.
- [ ] Add fixtures for help, disengage, hide, flee/chase, richer intimidation/de-escalation contests, reactions, concentration, and richer spell/effect cases.
- [x] Make auto-resolved enemy turns app-bounded: app owns rolls/effects/initiative before narration.
- [ ] Add crisp AI companion combat approval flow.
- [x] Reject provider combat responses that resolve the wrong active actor.
- [ ] Ensure initiative never advances by provider phrasing alone.

### Party Agency And AI Companions

- [x] First campaign character is host-controlled.
- [x] Additional created characters default to AI companions.
- [x] AI companion cards use Nudge, not Play.
- [x] Nudge prompts ask for brief low-stakes RP only.
- [x] Choice prompts can target individual party members.
- [ ] Make AI companion suggestions appear as approve/resolve/decline table beats.
- [ ] Add idle companion interjection rules with cooldown/rarity so they feel alive but not noisy.
- [ ] Add fixtures for host-controlled, remote-controlled, unassigned, and AI companion agency boundaries.
- [ ] Tune agency validation against real play logs so it catches overreach without blocking neutral presence/staging narration.
- [x] Let host choose host/AI/unassigned during additional character creation.

### Multiplayer And LoreKeeper Join

- [x] Host owns SQLite, model calls, canon review, and persistence.
- [x] Guest/join clients do not need Ollama or provider controls.
- [x] Join-as flow supports richer character proposal and host integration note.
- [x] Guest inputs are visible table messages and can become structured `user.playerInputs[]`.
- [x] Party-scoped DM choices are host-submitted decisions; remote guests vote on options instead of drafting locked action text.
- [x] Guest snapshots redact hidden DM notes and enemy HP.
- [x] Remote-to-AI/host controller transfer clears stale guest links.
- [x] Desktop protocol invite links preload the Join screen and clear stale saved sessions for different invites.
- [x] Fixed-seat invite joins require a table-visible guest name.
- [x] LoreKeeper has a single visible Host/Join front door; the old ThinLoreKeeper desktop identity is removed.
- [x] Provider Setup is reachable as a first-class front-door flow.
- [x] Browser `/guest` waiting room lets guests ask for a seat before receiving any campaign state.
- [x] Browser `/guest` previews the active host table and lets guests request an available non-host character seat.
- [x] Host can copy a same-network Guest Link from Local Table.
- [x] Waiting-room guests are visible to the host without digging through diagnostics, including requested character seat.
- [x] Stale waiting-room guests expire instead of lingering as broken seat buttons.
- [x] Guest Leave notifies the host, releases the remote controller to Host, and makes the vacated seat requestable again.
- [x] Generated Guest Links carry campaign/table/session identity to reject stale/wrong-table joins.
- [x] Guest snapshots and staged actions reject wrong campaign/table/session identity when supplied.
- [ ] Run first real two-machine playtest. Network connectivity and guest table sync were proven; the seat-request lobby needed hardening.
- [x] Make guest sent/received/resolving/resolved states clearer.
- [x] Make host "guest waiting" state harder to miss.
- [ ] Add explicit host tie-break/confirm flow for party votes. Current state: vote counters, host-facing vote summary, and "Use leading choice" action exist, but tied votes and final confirmation are still the normal Send Turn path.
- [x] Show party-choice vote counters and let guests switch their vote.
- [ ] Add disconnect/reconnect/campaign-switch soak tests.
- [ ] Consider WebSocket/broadcast later after polling semantics are solid.

### Character Creation

- [x] Campaign creation requires one host character.
- [x] Campaign creation supports `+` additional characters.
- [x] Host New hides the previous table and uses a full setup workspace.
- [x] Campaign creation can mark seats as Host, AI, or Remote Invite.
- [x] Host New has an explicit Back action and no stale table rails while setup is open.
- [x] Post-start host-created character flow uses same compact creator.
- [x] Guest join and LoreKeeper Join use aligned compact fields.
- [x] Auto-complete preserves supplied fields and fills missing details.
- [ ] Build shared pre-table lobby for invited players with read-only campaign/party state and editable own character.
- [ ] Let Host New remote-invite slots seat waiting-room guests before campaign start.
- [ ] Make auto-complete campaign-aware without overriding user facts.
- [ ] Add party-template flow for repeated related companions.
- [ ] Improve class/spell/equipment depth beyond shallow 5E-lite starts.

### UI Comfort

- [x] Raw provider meta hidden during normal play.
- [x] Debug meta toggle available in Settings diagnostics.
- [x] Right rail separates Campaign Notes from Player Notes, with Table Talk kept at the bottom.
- [x] Empty states use more table-shaped language.
- [x] Main menu separates Host, Join, and Provider Setup from the in-campaign rails.
- [x] Main menu hides last-table rails, notes, and command input until a flow is chosen.
- [x] Host on the main menu opens a selected campaign instead of implicitly resuming the last active campaign.
- [x] Join setup hides table rails and command input until connected to a host table.
- [x] Campaign/table view can return to the main menu without closing the app.
- [ ] Split settings into App Preferences and Campaign Settings as separate surfaces.
- [ ] Soak-test scroll behavior during long sessions.
- [ ] Keep debug/repair tools tucked away unless action is required.
- [ ] Consider context-sensitive note sections or tabs after playtest.
- [ ] Persist Player Notes to campaign SQLite or an explicit per-user notes store before relying on them for long campaigns.
- [x] Make Table Talk harder to miss without making it noisy.
- [x] Keep the left rail stable when party cards and combat rows have long names/actions.

### Storage, Diagnostics, And Safety

- [x] SQLite is the canonical campaign store.
- [x] Errors table records provider/session diagnostics.
- [x] Ollama context cache is campaign/model/mode scoped and non-canon.
- [x] Diagnostics can show recent errors and session health.
- [x] Add route-level tests for private/guest API split.
- [ ] Add route-level integration tests with API token enabled and stale campaign/table/session payloads. Current state: route classification plus API-token decision tests exist; full HTTP request/response stale-identity tests remain open.
- [ ] Add migration modules before public release.
- [ ] Add backup/export/recycle story before destructive delete in release builds.
- [ ] Move imported assets into app-owned portable asset storage.

## Two-Machine Playtest Checklist

### Before Guest Joins

1. Open LoreKeeper on the host machine and choose Host.
2. Open the campaign to show.
3. Confirm Local AI/provider ready.
4. Confirm debug meta in play log is off.
5. Confirm Local Table is off until ready.
6. Create/confirm host character.
7. Add AI companions before invite if desired.
8. Start Local Table.
9. Copy the Guest Link and send it to the guest.
10. Use Join-As links only as an advanced bypass when you intentionally want a one-click fixed seat.

### Guest Join Flow

1. Guest opens the shared `http://host:port/guest` link.
2. Confirm the waiting room shows the active table, public situation, and available non-host seats.
3. Guest selects the character seat they want and enters their table name.
4. Guest clicks Ask To Join.
5. Host sees the waiting guest and requested seat.
6. Host seats the guest.
7. Confirm guest sees table and can identify their character.
8. Use a fixed Join-As link only if bypassing the waiting room is intentional.

### First Five-Minute Table Script

1. Host sends a simple in-world action.
2. Confirm status says DM is thinking.
3. Confirm DM answers without raw provider meta.
4. Guest sends one character action.
5. Confirm host sees it staged/queued in clear table language.
6. Resolve guest action.
7. Confirm guest sees result without needing provider/import/retry concepts.
8. Use Table Talk once from each machine.
9. Start danger/combat only after basic loop works.

### Combat Smoke Test

1. Start with 2-4 enemies.
2. Confirm every enemy has a separate initiative row.
3. Host-controlled turn invites host action.
4. Guest-controlled turn waits for guest action.
5. Resolve one actor at a time.
6. Check visible rolls, damage, HP changes, and turn advancement.
7. Try one nonlethal ending: surrender, retreat, or de-escalation.

### Stop Conditions

Pause and add a note below if any happen:

1. DM speaks or acts for guest character without submitted input.
2. Guest cannot tell whether action was sent.
3. Host cannot tell whose turn it is.
4. Combat advances past more than one actor in a single response.
5. Hidden story/debug/meta text appears in guest view.
6. Failed provider turn leaves the table unsure what to do next.

## New Notes Inbox

Use this section for fresh observations before sorting them into the checklist.

- 2026-06-15: Qwen3 gives much richer scene prose when run without Ollama JSON mode. Watch for role/agency drift because richer narration can make overreach more tempting.
- 2026-06-15: The DM should be able to target individual party members or the whole party, and party votes should become an actual table flow with host tie-breaks.
- 2026-06-15: AI companions should occasionally feel alive with brief unprompted contributions, but not every response cycle and not for major decisions.
- 2026-06-15: App-owned combat resolution now covers DC checks and opposed contests. Next combat slice should connect these records to actual UI/provider turn intake or add saves/spells/enemy-turn bounding.
- 2026-06-16: Player Notes should not remain only local device state if they become part of long-campaign play. Decide whether they are per-user private notes, host-visible table notes, or both.
- 2026-06-16: Pre-table guest seating needs a draft table/session identity before it can be safely supported for unsaved Host New campaigns.
- 2026-06-16: Remote party-choice voting is now usable, but host resolution should become more explicit than "read the counters and send the choice."

## How To Use This Doc

1. Start here before continuing broad polish work.
2. Pick the highest-priority unchecked item that matches the current pain.
3. Keep changes small enough to test and commit cleanly.
4. When a new issue is noticed during play, add it to New Notes Inbox first.
5. When fixed or clarified, move it into the appropriate checklist section and update status.
6. Keep older docs as reference, but let this doc be the current steering wheel.
