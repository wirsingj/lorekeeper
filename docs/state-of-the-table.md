# LoreKeeper State Of The Table

Updated: 2026-06-15

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

Status legend:

- Fixed: covered by current code and tests or a successful smoke check.
- Improved: materially better, but needs real-session soak testing or more fixtures.
- Open: still a product or architecture risk.
- Watch: acceptable for now, but likely to regress without tests or fixtures.

## North Star

LoreKeeper should feel like sitting at a natural D&D 5E table.

The party members are the people around the table. The DM is the app plus the AI provider. The app owns continuity, state, rules, recovery, and table flow. The model provides narration, NPC behavior, atmosphere, suggested checks, and structured proposals inside app-owned rails.

The user should not feel like they are debugging a model, managing queue machinery, or translating software concepts while trying to play.

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
13. CombatEngine can now resolve app-owned DC checks and opposed checks/contests with logged rolls, success/failure effects, and initiative advancement.
14. The unified front door now treats Host, Join, and Provider Setup as first-class app-level flows.

### Still Risky

1. Combat resolution is still partly provider-led for enemy turns and improvised actions.
2. `app/app.js` still owns too much orchestration around submit/import/repair/recovery/combat/multiplayer.
3. Repair/retry/import still exposes some software-shaped concepts.
4. AI companion approval is still a button/badge flow, not yet a smooth table beat.
5. Party-vote collection is only schema/UI-labeled. Guests cannot yet cast separate votes with host tie-break resolution.
6. Local multiplayer still needs longer two-machine soak testing.
7. Guest "sent / host received / resolving / resolved" state needs to be clearer.
8. Table Talk can be missed during active play.
9. Provider narration can still restate the player's action or lean on option panels too much.
10. Pending input cleanup still depends on successful provider import and can leave intent queued after failure.
11. Active campaign changes reset TurnFlow, but app-level helper state still coexists with engine state.
12. Context retrieval is still coarse and recent-message heavy compared with the desired actor/place/consequence/thread retrieval.
13. Settings are still physically one dialog; app-level preferences and campaign-level settings need a fuller split after the front-door shell stabilizes.

## Live Acceptance Matrix

| Table expectation | Status | Notes |
| --- | --- | --- |
| Player can tell whose turn it is. | Improved | Combat tracker and input placeholder cover basic cases. Long encounters need richer context. |
| Player can tell who controls each character. | Improved | Badges/actions exist. Language still needs user testing. |
| DM does not speak for controlled PCs. | Improved | Prompt, context, renderer recovery, and suppression help. Needs scenario fixtures. |
| AI companions feel like party members. | Improved | Nudge flow and creation defaults help. Approval flow still needs polish. |
| DM can address party or specific party members. | Improved | Choice metadata supports party, character, subset, vote, and combat actor. Full vote flow is open. |
| Guest players know whether input was sent/waiting/resolved. | Improved | Wording/lifecycle improved. Needs two-machine soak. |
| Combat has one row per combatant. | Fixed | Grouped enemy expansion exists. |
| Combat rolls and HP changes are visible. | Improved | Mechanics rendering exists. App-owned resolution needs broader coverage. |
| DM can continue scenes without forcing options. | Improved | Prompt/choice suppression improved. Needs social/travel/downtime fixtures. |
| DM has story beyond current scene. | Improved | Hidden arcs exist and are private. Needs scenario testing for adaptation and non-leakage. |
| Recovery after provider failure is understandable. | Improved | Player echoes and staged inputs show lifecycle. Repair/retry still needs table-shaped flow. |
| Character creation is consistent. | Fixed | Shared compact auto-complete and controller defaults are in place. |

## Priority Queue

### Critical

1. Make common combat action resolution app-owned before provider narration: action validation, roll, check/save, damage/healing, HP/resource/condition updates, and initiative advancement.
2. Continue moving recovery decisions out of `app/app.js` into TurnFlow, ProviderOrchestrator, CombatEngine, and multiplayer domain modules.
3. Add scenario fixtures proving the provider cannot speak for host/remote PCs across social, combat, join-transfer, and AI-companion cases.

### High

4. Build actual party-vote flow: host can call a vote from a party prompt, guests cast votes from LoreKeeper Join, host breaks ties, winning option resolves.
5. Make AI companion approval feel like a table beat: suggest, approve, resolve, or decline.
6. Add enemy-turn and player-turn combat fixtures that verify one actor is resolved per provider response.
7. Strengthen the "what the table is waiting for" surface so it covers every stuck state.
8. Run the two-machine playtest checklist and log every friction point.
9. Make guest-side "sent / host received / resolving / resolved" state unmistakable.
10. Make host-side "guest is waiting on you" affordance stronger.

### Medium

11. Make scene tension, consequences, and optional hidden-story debug summaries more visible in Settings/diagnostics, not live play.
12. Add curated regression campaigns for social negotiation, wilderness travel, mystery, downtime, and combat.
13. Improve context retrieval around present actors, active place, relationships, consequences, unresolved threads, and private story arcs.
14. Continue combat tracker density work: concentration, richer resources, reactions, conditions, movement, action state.
15. Add route-level API/security tests for LAN/private route classification.
16. Add long-campaign performance fixtures and eventually virtualize long play logs.

### Low

17. Replace remaining overly specific placeholder text with neutral table examples.
18. Add campaign-aware character auto-complete that uses party theme/premise/existing characters without overriding supplied fields.
19. Add explicit party-template flow for "four dwarf soldiers" or "heist crew."
20. Add backup/export/recycle affordances before destructive delete in release builds.

## Working Checklist

### Model I/O And DM Quality

- [x] Strict JSON contract for local model turns.
- [x] Qwen3 adapter avoids Ollama JSON mode and uses `/no_think`.
- [x] Bad empty structured responses are rejected and logged.
- [x] Hidden long/mid/short story threads are sent as private DM planning.
- [x] Choice targeting supports party, character, subset, vote, combat actor, and free prompts.
- [ ] Add provider-output fixtures for controlled-PC agency failures.
- [ ] Add fixtures for social, travel, mystery, downtime, combat, and recovery scenes.
- [ ] Improve context retrieval beyond recent history/context pack breadth.
- [ ] Add hidden-story scenario tests for adaptation without leaking future twists.
- [ ] Tighten prompts so normal scene turns can be rich without always forcing choices.

### Table Flow And Recovery

- [x] Main status strip uses table-facing language.
- [x] Submitted player bubbles show waiting/answered/review/failed lifecycle.
- [x] Auto-resumed unresolved turns mark the original bubble as recovering.
- [x] Failed provider turns keep approved/remote inputs visibly staged.
- [x] Diagnostics include table timeline and session health summary.
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
- [ ] Add fixtures for save, spell, help, disengage, hide, flee/chase, richer intimidation/de-escalation contests, and enemy turn.
- [ ] Make enemy turns app-bounded: provider may choose intent/narrate, app owns state mutation.
- [ ] Add crisp AI companion combat approval flow.
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
- [ ] Let host choose host/AI/unassigned during additional character creation.

### Multiplayer And LoreKeeper Join

- [x] Host owns SQLite, model calls, canon review, and persistence.
- [x] Guest/join clients do not need Ollama or provider controls.
- [x] Join-as flow supports richer character proposal and host integration note.
- [x] Guest inputs are visible table messages and can become structured `user.playerInputs[]`.
- [x] Guest snapshots redact hidden DM notes and enemy HP.
- [x] Remote-to-AI/host controller transfer clears stale guest links.
- [x] LoreKeeper has a single visible Host/Join front door; the old ThinLoreKeeper desktop identity is removed.
- [x] Provider Setup is reachable as a first-class front-door flow.
- [ ] Run first real two-machine playtest.
- [ ] Make guest sent/received/resolving/resolved states clearer.
- [ ] Make host "guest waiting" state harder to miss.
- [ ] Add actual party-vote collection and host tie-break flow.
- [ ] Add disconnect/reconnect/campaign-switch soak tests.
- [ ] Consider WebSocket/broadcast later after polling semantics are solid.

### Character Creation

- [x] Campaign creation requires one host character.
- [x] Campaign creation supports `+` additional characters.
- [x] Post-start host-created character flow uses same compact creator.
- [x] Guest join and LoreKeeper Join use aligned compact fields.
- [x] Auto-complete preserves supplied fields and fills missing details.
- [ ] Make auto-complete campaign-aware without overriding user facts.
- [ ] Add party-template flow for repeated related companions.
- [ ] Improve class/spell/equipment depth beyond shallow 5E-lite starts.

### UI Comfort

- [x] Raw provider meta hidden during normal play.
- [x] Debug meta toggle available in Settings diagnostics.
- [x] Binder can collapse to give play surface more room.
- [x] Empty states use more table-shaped language.
- [x] Main menu separates Host, Join, and Provider Setup from the in-campaign rails.
- [ ] Split settings into App Preferences and Campaign Settings as separate surfaces.
- [ ] Soak-test scroll behavior during long sessions.
- [ ] Keep debug/repair tools tucked away unless action is required.
- [ ] Consider context-sensitive binder sections or tabs after playtest.
- [ ] Make Table Talk harder to miss without making it noisy.

### Storage, Diagnostics, And Safety

- [x] SQLite is the canonical campaign store.
- [x] Errors table records provider/session diagnostics.
- [x] Ollama context cache is campaign/model/mode scoped and non-canon.
- [x] Diagnostics can show recent errors and session health.
- [ ] Add route-level tests for private/guest API split.
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
9. Copy Join-As link or specific character invite.

### Guest Join Flow

1. Open LoreKeeper on the guest machine and choose Join.
2. Paste invite link.
3. Confirm preview shows campaign, party, and public situation without hidden DM notes.
4. Guest enters table name and character details.
5. Use Auto-Complete if helpful.
6. Submit join request.
7. Host approves.
8. Confirm guest sees table and can identify their character.

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

## How To Use This Doc

1. Start here before continuing broad polish work.
2. Pick the highest-priority unchecked item that matches the current pain.
3. Keep changes small enough to test and commit cleanly.
4. When a new issue is noticed during play, add it to New Notes Inbox first.
5. When fixed or clarified, move it into the appropriate checklist section and update status.
6. Keep older docs as reference, but let this doc be the current steering wheel.
