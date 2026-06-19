# LoreKeeper State Of The Table

Updated: 2026-06-19

This is the sliding-window working doc for LoreKeeper's current product state, goal, and improvement checklist. When we say "keep working through the state-of-the-table," this is the doc to use first.

This file has absorbed the old tabletop reality checks, playtest notes, model I/O notes, deep-audit notes, authority/session-isolation notes, and recovery checklists that used to live as separate temporary docs. The long-lived companion docs are `docs/ARCHITECTURE.md` for ownership boundaries, `docs/MAINTAINER_GUIDE.md` for commands/debugging/failure playbooks, and `docs/living-world.md` for continuity memory.

Status legend:

- Fixed: covered by current code and tests or a successful smoke check.
- Improved: materially better, but needs real-session soak testing or more fixtures.
- Open: still a product or architecture risk.
- Watch: acceptable for now, but likely to regress without tests or fixtures.

## North Star

LoreKeeper should feel like sitting at a natural D&D 5E table.

The party members are the people around the table. The host is one of those party members, plus the software-side table owner for setup, invites, provider access, and recovery decisions. The DM at the table is the provider/DM Voice operating inside app-owned rails. The app owns continuity, state, rules, recovery, and table flow; the provider supplies narration, NPC behavior, atmosphere, suggested checks, and structured proposals.

The user should not feel like they are debugging a model, managing queue machinery, or translating software concepts while trying to play.

Every table surface should answer the same practical questions a real table answers without explanation: where are we, whose attention is needed, who controls this character, what just happened, what can I do now, and what is remembered as true.

## Project Read

LoreKeeper's goal is unusually strong because it is not "chat with a fantasy bot." It is a digital table: host, guests, party members, DM Voice, rules, memory, authority, recovery, and table flow all have separate jobs. That distinction is the project's best product insight and should stay protected.

The project has made real progress from prototype/tooling shape toward table-sim shape. Earlier debt came from building around provider/import/debug mechanics first; recent work has been correctly moving authority into app-owned state, combat, multiplayer, recovery, and phase projections while pushing raw machinery behind table language and hidden harnesses.

The codebase is healthier than its size suggests. The important direction is right: pure controllers and engine modules are being extracted, tests increasingly cover behavior instead of snapshots, and Playwright now exercises real host plus `/guest` flows. The main architectural risk is still concentration of orchestration in `app/app.js` and route glue in `scripts/serve.js`; every new gate should become a tested controller or engine invariant, not another renderer-only condition.

Product management has been unusually effective because playtest frustration is being translated into principles, not just one-off fixes: "host is not DM," "Start Adventure is the first table beat," "nothing should be possible too early," and "the table must feel trustworthy" are durable product rules. The best next guidance pattern is the same one: identify moments that make a player ask "why did that happen?" and convert them into state invariants plus harness coverage.

The current state is promising but not yet release-calm. Core mechanics, storage, multiplayer authority, combat rails, recovery, and harnesses are now credible. The remaining work is making the experience feel inevitable: fewer visible controls, clearer phase-specific actions, more polished combat decisions, recovery that feels like a table ruling, and real two-machine soak. The project feels past "can this work?" and into "can this feel smooth enough that players trust it for a whole session?"

## Steam-Ready UX Direction

LoreKeeper should feel like a focused tabletop app, not a utilities dashboard.

- The front door should answer only three questions: continue hosting, start a new table, or join someone else's table.
- Provider/model setup should feel like DM Voice readiness, not a core gameplay mode.
- Normal play surfaces should use table language: Host, Join, Guests, DM, Table, Seat, Continue, Troubleshooting.
- Technical language such as SQLite, provider import, raw payloads, bridge/manual sync, and diagnostics belongs behind troubleshooting or developer details.
- Settings should become two calmer surfaces: app preferences before play, and table settings while hosting.
- Every screen should show the next likely action and hide controls that are not relevant to the current phase.
- Guest flow should prefer one plain LAN link with a table list and seat requests; direct deep links can remain optional power-user shortcuts.

### Current Product Decisions

- Side rails may stay open by default. The center story log should dominate, but the table does not need every inch of horizontal space; Party, Notebook, and Table Talk can remain visible when they are calm, useful, and resizable.
- Guest `/guest` flow should require host approval for requested seats for now. Future trust can remember a returning person/account/IP for a prior seat, but the near-term product should be explicit and safe.
- New Adventure should create/load a ready table first, then offer a clear Start control once the host has finished last-minute invites and party edits. That Start should run a strong opening DM narration like a real first session.
- Visual target: dark tabletop, dungeon, and storybook atmosphere. Avoid sterile admin/app chrome even when the underlying controls are practical.
- AI companions should occasionally interject on their own when appropriate and nobody controlled by a host/remote is actively typing, while still respecting agency, cooldowns, and major-decision guardrails.

## Trust Risks

Trust rule: every action must be allowed, visible, outcome-clear, recoverable, and unable to silently fail or silently mutate table state.

Current trust score: 6 open "that was weird" risks. Count one point for any remaining behavior likely to make a player ask "why was I able to do that?" or "why did that happen?"

### Fixed Trust Violations

- Fresh tables now have an explicit pre-opening phase. Start Adventure is the only first provider turn; DM Nudge, companion Nudge, Send Turn, debug submit, and pre-opening guest actions are gated until the opening starts.
- Start Adventure now disappears after the host requests opening narration for the current local-table session, duplicate clicks are ignored, and the action can return only when a fresh re-hosted table is still pre-opening.
- Guest actions, guest snapshots, guest choice votes, waiting-room registrations, and auto-resolve timers are pinned to campaign/table/session identity so stale joins and delayed work cannot mutate a new table.
- Guest leave/rejoin and campaign-switch flows clear stale connection/controller state instead of silently reviving old approvals.
- Table Talk refreshes while DM Voice is generating so side chat does not appear to vanish until the DM response posts.
- Review commits now save through the active campaign update queue, preserving route-side Table Talk and remote guest state that land during provider import.
- Recovery Retry and Use Anyway now share a pure action gate so hidden/debug clicks cannot run recovery actions while another DM response is generating or when no reviewed response is active.
- AI companion Nudge is gated by table phase, guest/client role, and combat active actor; disabled nudge buttons are tested to prove they cannot start generation or trigger recovery.
- Common combat resolution owns active actor, initiative, legal options, action economy, and enemy-turn advancement enough to reject provider phrasing that would skip or resolve the wrong actor.
- Campaign delete is visible from the front door and recycles local SQLite files instead of exposing undeletable backend placeholder campaigns.
- The hidden Playwright harness uses temp campaign roots, host plus `/guest` tabs, deterministic provider mocks, remote chaos, and failure artifacts so trust bugs do not pollute real campaign files.

### Remaining Trust Risks

- `app/app.js` still owns broad orchestration around provider/import/recovery/combat/multiplayer. Any new visible gate must also have a route/controller invariant so an alternate entry point cannot bypass it.
- Recovery is more table-shaped, but the manual replacement/use-anyway escape path still feels like a tool for fixing software rather than a table ruling.
- Combat still needs deeper phase-specific action surfaces for spells, reactions, movement, concentration, richer conditions, and improvised actions so players do not wonder why a legal-looking action is unavailable.
- Real two-machine LAN play remains the highest confidence gap for guest waiting-room presence, reconnects, firewall/device behavior, and perceived timing.
- Provider failure, cancel, campaign switch, stale invite, and combat interruption paths have coverage, but chaos should keep adding explicit "nothing mutated" assertions after every rejected or interrupted action.
- Host play still blends party-member input with software-owner controls. Host-only controls should keep moving into tucked-away table-owner surfaces so the shared table never looks like an admin panel.

### Recurring Patterns

- UI button gates are necessary but insufficient; debug hooks, public routes, delayed timers, and message-bubble actions need the same state invariant.
- Delayed async work must carry campaign/table/session identity and stand down when that identity changes.
- Rejected actions should prove a negative: no provider call, no play-log message, no staged input, no combat turn advance, no controller transfer, no recovery modal.
- Harness provider queues can hide mistakes if a test only checks the happy-path text. Chaos tests should verify state before and after actions, not only the visible response.
- Copy changes can create trust debt when labels drift from ownership reality. Host is the software-side owner and party member; DM Voice/provider is the DM.

## State Invariant Matrix

| State | Allowed actions | Forbidden actions | Hidden/disabled expectations |
| --- | --- | --- | --- |
| App front door | Continue a selected adventure, create New Adventure, Join A Table, open DM Voice or Preferences, delete selected visible campaign. | Provider turns, guest actions, combat changes, hidden starter campaign selection/deletion. | Table rails, notes, command input, diagnostics, and last-table controls stay hidden until a flow is chosen. |
| Host setup / New Adventure | Edit premise/hero/party, add AI/remote/host seats, copy pre-table guest link, seat pre-table guests, create the ready table. | Provider calls, combat starts, guest character actions, deleting unrelated campaigns from the setup workspace. | Start Adventure is not shown until the campaign exists; old table rails stay hidden during setup. |
| Adventure draft / opening ready | Host may Start Adventure, invite/seat guests, edit party/notes where safe, use Table Talk. | DM Nudge, Send Turn, AI companion Nudge, guest action/pass/vote, debug submit, combat advancement. | Composer disabled with Start Adventure copy; Start Adventure visible once per current table session; duplicate clicks do not call provider twice. |
| Adventure live / roleplay | Host sends party action, guest sends assigned character action, Table Talk both directions, Nudge DM, stage/resolve approved companion or remote inputs. | Guest acting for other characters, stale-session actions, provider generation from empty input, hidden-state mutation from rejected requests. | Send Turn wakes only for text/staged inputs; guest pending/resolved states remain visible; host-only controls stay out of the shared play surface where possible. |
| Guest waiting room | Guest previews public table, chooses a requestable seat, edits join draft, asks to join, leaves/back home. | Seeing hidden notes/enemy HP, sending table actions, voting, provider settings, host mutations. | Composer/action controls hidden or disabled until seated; host sees waiting guest without diagnostics. |
| Guest seated | Guest Table Talk, assigned-character action/pass/vote only when table phase and combat turn allow it, leave/rejoin. | Host settings, other-character actions, pre-opening actions, wrong-combat-turn actions, stale-table/session actions. | Public routes reject wrong campaign/table/session; rejected guest routes must not alter host phase, messages, inputs, combat, or recovery. |
| Provider generating | Cancel current generation, Table Talk refresh, wait for DM Voice. | New provider turn, recovery actions, duplicate Start Adventure, campaign-switch carryover. | Send/Nudge/Start/recovery actions disabled; side chat remains live; stale provider completions are ignored if campaign/session changed. |
| Combat active | Active host/guest/AI/enemy actor resolves one turn at a time through app-owned mechanics and visible rolls/effects. | Non-active actor actions, provider advancing initiative by phrasing alone, guest acting outside assigned combat turn, duplicate enemy turn resolution. | Combat rail names active actor/controller; legal actions are phase-specific; enemy HP is redacted for guests. |
| Recovery / review | Try Again, Details, Use Anyway only when allowed; hard agency violations force Try Again/Details; host can inspect review summary. | New turn submission, hidden Use Anyway on hard agency block, recovery actions during active generation, silent import of bad response. | Recovery CTA visible beside Now/Next; raw fallback stays tucked away; handlers guard the same states as disabled buttons. |

## Product UX/UI Redesign Audit

### Information Hierarchy

- Tier 1, always visible: story log, current table status, command input, current turn/active actor, minimal party ownership signal.
- Tier 2, contextual: party details, combat order, guest seating, table talk, active vote state, recovery actions.
- Tier 3, collapsed/drawer: world notes, player notes, people/places/things/threads, campaign library details, provider choices, invite link utilities.
- Tier 4, diagnostics only: raw provider text, JSON/import language, API/session identity, SQLite details, manual state sync, debug metadata, route/storage errors.

Permanent screen space should be reserved for play. The table should not ask players to visually parse campaign records, networking controls, diagnostics, and notes unless that information is part of the current moment.

### Screen Review

1. Front Door: improved, but still should eventually feel more like a game launcher with big Continue/New/Join affordances and DM Voice as secondary.
2. New Adventure: improved by using full-screen setup, but still reads like a form. It should evolve into an adventure-builder flow with sections for Premise, Hero, Party, Friends.
3. Join Flow: plain `/guest` is the right direction. The next UX step is a friendly table list plus seat cards, with direct links treated as shortcuts.
4. Main Table: highest debt. Story must dominate; rails should be notebook/party shelves, not dashboards. Current pass collapses notes by default and compacts party cards, but phase-specific table chrome is still needed.
5. Combat: mechanically stronger, but visually still too similar to roleplay. Combat should eventually emphasize initiative, current actor, available actions, visible rolls/effects, and clear end-turn flow.
6. Notes: should feel like a notebook/codex opened when needed. Current pass moves toward this by collapsing World and Player notes by default.
7. Preferences: still too much one-dialog surface. Split into App Preferences, Table Settings, DM Voice, and Developer Tools.
8. Local Table: should become "Invite Friends" and "Seats" in normal play, with network details hidden behind advanced details.
9. Diagnostics: should remain available but never visually compete with play unless the table is stuck.
10. Recovery: table-facing copy is better, but the long-term design should feel like "DM needs a ruling" rather than software repair.

### Top UX/UI Debt Sources

Critical:

1. Main table still has three permanent columns competing with the story.
2. Settings and table-management concepts are too close to play.
3. Combat and roleplay share almost the same visual mode.
4. Recovery still has diagnostic/manual-review escape hatches near normal play.
5. Empty/new-table state still feels sparse instead of guiding the first table beat.

High:

6. Party cards still carry too much descriptive text for permanent rail space, though now clamped by default.
7. Notes are records rather than a true notebook/codex experience.
8. Local-table/guest tools still expose hosting mechanics in places.
9. DM Voice setup still feels like configuration, not choosing a storyteller.
10. Guest seat requests need more immediate, friendly host-side presentation.

Medium:

11. Table Talk is useful but should feel like side conversation, not another admin panel.
12. Campaign management is still list/select driven.
13. Right rail needs true drawer/tab behavior later, not only collapsed details.
14. Command deck is serviceable but should adapt to phase: RP, vote, combat, waiting, review.
15. Campaign Notes extraction quality will determine whether the notebook feels magical or noisy.

Low:

16. Some placeholders are still more implementation examples than play prompts.
17. Icon language is mixed between app controls and table concepts.
18. Advanced model settings need deeper progressive disclosure.
19. The desktop/window frame still reads like a dev app until the in-app shell becomes more immersive.
20. Visual theme is readable but not yet distinctive enough as a tabletop product.

### Future Table Mode Exploration

Do not implement Table Mode yet. The viable path is incremental:

1. First, make table phase explicit everywhere via `TableSessionEngine`.
2. Then turn the current rails into contextual shelves: Party, Notebook, Friends, Combat.
3. Then introduce a centered "table surface" view where story is central, active actors have presence, and notes/talk slide in as overlays.

Advantages:

- Stronger feeling of sitting down with people.
- Less permanent dashboard clutter.
- Easier guest/player mental model.
- Clearer distinction between roleplay, combat, and recovery.

Risks:

- A table metaphor can become gimmicky if it hides necessary controls.
- Combat needs tactical clarity, not decorative table dressing.
- Multiplayer state must be rock-solid before a more immersive table surface can be trusted.

## Table Model

1. The DM voice is app/provider owned. It describes the world, NPCs, consequences, rules calls, and combat outcomes.
2. Party members are table voices with agency. Host-controlled and remote-controlled party members must not be spoken for by the DM/provider unless the controller submitted that speech/action.
3. AI companions are party members, not NPCs. They can make brief low-stakes RP contributions when nudged or when the table is idle, but major choices and combat turns still need host/controller approval.
4. Enemies and NPCs are DM actors. They may act on their turns without player input, but combat state should remain structured and visible.
5. The DM can address the whole party, one character, a subset, the current combat actor, or call for a party vote.
6. The host is software-authoritative for campaign state, remote approvals, provider/model calls, canon review, and tie-breaking, while remaining a party member rather than the DM.
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
14. The unified front door now treats Host, Join, and DM Voice readiness as first-class app-level flows.
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
28. Normal Guest Links now use plain `/guest`; guest actions still receive table/session identity after waiting-room registration so stale requests cannot mutate a different active table.
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
43. Party-vote panels give the host a draft action when remote votes have a clear leader.
44. Live recovery controls now use table-facing labels: Try Again, Details, and Use Anyway instead of Retry/Inspect/Import.
45. Agency fixtures now cover host-controlled, remote-controlled, unassigned, and AI companion boundaries.
46. CombatEngine fixtures now cover app-owned Help, Disengage, Hide, and Flee/escape outcomes.
47. Player Notes now persist into the campaign SQLite snapshot with localStorage migration fallback, while remaining player scratch space rather than DM canon.
48. Implicit combat turn advancement now requires visible resolved mechanics, so initiative cannot move forward from provider narration/phrasing alone.
49. Party vote panels now distinguish table leaning from tied votes and make the host action draft the leading choice for final send.
50. AI companion nudge approvals now read as table beats: Stage For DM, Pass, and staged-for-next-Send-Turn status.
51. Server HTTP integration tests now run against a temporary campaign root and prove API-token protection plus stale campaign-pin rejection on a real mutation route.
52. Server HTTP integration tests now prove stale public guest actions and choice votes reject wrong table/session identity through real routes.
53. CombatEngine fixtures now cover chase positioning, intimidation contests, readied reactions, concentration conditions, healing spells, and half-damage-on-save spells.
54. AI companion nudge beats can now be staged, passed, or resolved immediately as structured companion input.
55. Diagnostics/manual review labels now say Table Diagnostics, Copy Details, and Review DM Response instead of exposing JSON/import/state-sync language during ordinary recovery.
56. Session health now prioritizes a `Next:` line for stuck/waiting states, including repair, provider wait, guest seating/approval, queued guest input, combat ownership, and companion combat turns.
57. Provider turn requests now include an app-owned AI companion interjection policy with rarity/cooldown gates, explicit nudge bypass, and low-stakes constraints.
58. Combat response validation now rejects wrong `resolvedActorId` and next-actor overreach for enemy turns as well as player turns.
59. JSON contract fixtures now include richer full-turn social, travel, mystery, downtime, combat, and recovery scenes that render without forced option panels.
60. Context packs now start with a Scene Focus section and scene retrieval includes current-place/thread/consequence-linked relationships and timeline events, not only recent chat or explicit participants.
61. Hidden-story fixtures now reject visible narration/choice text that directly leaks private DM story phrases while allowing subtle public clues plus `dm_only` story updates.
62. AI companion combat nudges now work only on that companion's active initiative turn and request a host-approved suggestion rather than resolving mechanics.
63. Try Again now marks the original player action as "Trying again" and updates that same bubble after the retry result lands.
64. Scene retrieval now ranks actor/thread-linked relationships and events above noisy same-place history, with a long-campaign-noise fixture.
65. CombatEngine now rejects explicit legal option IDs that are stale, unavailable, or incompatible with the requested action type.
66. Context-pack load coverage now builds a thousands-record campaign and asserts Scene Focus stays relevant, bounded, and under a generous performance ceiling.
67. Manual review/use-anyway live copy now avoids JSON/contract/import wording and frames failures as table checks, with raw details kept in diagnostics.
68. Turn repair display/use-anyway policy is extracted into a small recovery controller with direct tests instead of living only as renderer string handling.
69. Narration-first prompt policy now explicitly tells local models to leave `choices.options` empty on ordinary scene turns, while preserving combat/immediate-danger choices.
70. Multiplayer regression coverage now proves a guest snapshot with a previous local-table session id is rejected after host table restart.
71. Long play logs now render through a bounded projection with a Show Earlier control, so old transcript entries remain reachable without repainting the entire campaign log every turn.
72. Hosts can drop stale staged guest actions without falsely marking them as DM-resolved; dropped inputs get their own transcript lifecycle.
73. SQLite storage now has bounded recent-message and record-query helpers, with a long-campaign fixture proving transcript paging and campaign-record reads stay capped.
74. Common combat actions now cover app-owned Attack, Dodge, Help, Dash, Disengage, Hide, Ready, checks/contests, simple spells, healing, saves, concentration, reactions, surrender, and retreat fixtures.
75. Staged input recovery policy now lives in a small controller that decides whether approved/remote inputs are submitted, cleared, or kept staged after a DM run.
76. Agency validation now distinguishes neutral controlled-PC presence from piloting, and host name mentions only authorize that character when the submitted text actually gives them an action.
77. The Review DM Response section now starts with a host-facing table-check summary projection before the paste/use controls, so repair state is framed as a table decision instead of raw diagnostics first.
78. Campaign delete now removes the campaign from LoreKeeper but recycles the SQLite/WAL/SHM files into `data/campaigns/.deleted/...` for manual recovery.
79. Provider import outcome copy now comes from a small controller instead of branching inside `app.js`, keeping another recovery/import decision out of the renderer.
80. Raw diagnostics are now tucked behind a Raw Details disclosure so table-facing health/review summaries are the first thing hosts see.
81. Latest-provider-response empty/unchanged/duplicate/import decisions now live in `provider-import-controller.js` with direct tests instead of branching inside `app.js`.
82. SQLite schema validation now goes through a versioned migration module; current schema passes as `current`, and unsupported old/new versions fail loudly with a migration-path error.
83. Imported bundle assets are copied into `data/assets/<campaign>/...` when loaded, and campaign asset records point at the app-owned copy while preserving the original source path.
84. Agency validation fixtures now cover cinematic body-language overreach for remote PCs, such as a model tightening Mira's grip or leaning her into action without submitted input, while still allowing hostile NPC focus on her.
85. Local multiplayer regression coverage now includes stale guest snapshot/action rejection after host campaign switch, in addition to disconnect, reconnect, stale table, and stale session cases.
86. Character auto-complete now lives in a small controller and uses explicit campaign/draft party context, preserving user-supplied facts while filling missing details from party theme.
87. Host New now has an Add Party Set action that creates three related AI companion cards from the primary character/draft party theme for quick "four dwarf soldiers" style setup.
88. Generated 5E-lite sheets now include class-appropriate equipment/inventory and structured spell metadata, while context packs and sheet text areas render those details as readable names.
89. Provider review auto-commit policy now lives in `provider-import-controller.js`, including hidden story-arc auto-approval and major/invalid/rejected change blocking.
90. Agency validation now catches subtle remote-PC resolve/body-language overreach from play logs, including "doesn't back down" and eyes/grip locking into action without submitted input.
91. The left rail now explicitly contains dense party/combat content so long card text and button clusters wrap or truncate instead of forcing horizontal scroll.
92. Staged-input failure wording now lives with the staged recovery controller, so retry/keep-staged language is tested outside `app.js`.
93. `TableSessionEngine` now provides a unified table phase projection for roleplay, waiting player/guest/DM, party vote, combat, host review, and recovery states.
94. `TableDebugSnapshot` now gives one copyable diagnostics blob for campaign/table/session identity, table phase, active actor/controller, provider state, combat, staged guest inputs, review/recovery, and recent errors.
95. Future-maintainer docs now include a practical Maintainer Guide with commands, owner files, danger files, and failure playbooks.
96. Focused npm test commands now exist for engine, contract, multiplayer, storage, security, regression, and all checks.
97. A high-risk regression pack now covers provider rejection without state carryover, stale guest session rejection, controlled-PC agency, combat narration-only guardrails, staged input preservation, campaign-switch wiring, and delete recycling.
98. Major remaining `app.js` and `serve.js` responsibilities now have danger-zone comments and intended extraction targets.
99. LivingWorldEngine now derives long/mid/short goal horizons from existing goals, quests, hidden story arcs, and scene goals.
100. Context packs now include DM Goal Horizon and Living World Memory sections before recent history, giving the provider narrative gravity and durable NPC/faction/location/consequence memory.
101. Consequences can link to goals, and scene retrieval can pull goal-linked consequences back into focus many turns later.
102. Provider JSON requests now include `context.goalHorizon` and `context.livingWorld`, plus continuity rules that ask whether new content serves active goals before inventing threats.
103. CombatEngine now applies app-owned turn economy for resolved party combat actions: action, bonus action, reaction, and movement costs are validated, logged, and reflected in the combat tracker state.
104. Stale combat-prompt repair policy now lives in `combat-prompt-repair-controller.js`, with tests proving DM prompts cannot silently hand initiative to the wrong party actor unless the persisted combat turn is stale and non-party-owned.
105. RelationshipEngine now normalizes and applies relationship state transitions, so reviewed changes can durably shift relationships through states like neutral, respectful, friendly, loyal, distrustful, fearful, and hostile.
106. WorldMemoryEngine now normalizes durable faction beliefs/memory and location scars/history, with canonical-change integration so reviewed DM proposals become retrievable world facts.
107. Implicit combat-turn advancement during provider import now lives in `combat-import-controller.js`, with direct tests proving provider narration alone cannot advance initiative without resolved mechanics for the active actor.
108. Combat-start and missing-combatant import fallbacks now also live in `combat-import-controller.js`, with tests proving combat only auto-starts on a hostile signal with inferred enemies and enemy sync does not duplicate known combatants.
109. Implicit scene-progress import fallback now lives in `scene-import-controller.js`, with tests proving it updates immediate situation only from DM narration, ignores choice-list text, and skips when a structured scene change already exists.
110. Senior-dev/security/UX/DM review pass checked the main app shell, server routes, Electron boundary, engine ownership, multiplayer authority, provider authority, and table-flow docs against the current architecture.
111. Host-style combat join mutations on the guest-public combat route now require local app authorization when no guest connection id is supplied.
112. Server integration coverage now proves arbitrary local asset reads require authorization, stay inside allowed asset roots, and do not allow built-asset path traversal.
113. Remaining visible ThinLoreKeeper join wording in multiplayer-created character notes now uses the unified LoreKeeper Join identity.
114. Guest table refresh copy now avoids "sync/resync" wording on ordinary table-facing controls and status messages.
115. Pre-action DM nudges with living-world object memory no longer crash provider request construction when compacting NPC/faction/place memory.
116. Host New Remote Invite seats now persist as unassigned remote-player seats, stay joinable after campaign creation, and automatically open/copy the Guest Link when the campaign starts.
117. Host New now publishes an in-memory pre-table lobby to `/guest`, so same-network guests can see the current draft table, request Remote Invite seats, and remain visible to the host before Create And Start.
118. Stale detailed `/guest?...campaign/table/session...` URLs no longer drive the normal waiting-room preview; the guest page asks the host server what is currently joinable.
119. Host New waiting guests can be seated before Create And Start; reserved draft seats are adopted into the real local table as remote controllers when the campaign launches.
120. New campaign seed text no longer appears as the visible first DM bubble; the opening message now tells the host to press Start Adventure for the first DM narration.
121. First-pass Steam-ready wording made early front-door and preferences copy calmer, replacing more technical provider/SQLite/import wording in normal paths.
122. Starting a fresh local table session now resets stale remote runtime state: old connected/pending guests are disconnected, waiting-room records are closed, remote controllers are released, and open seats become requestable again instead of silently reviving old approvals.
123. Guest seating now updates live renderer session state, not only localStorage/snapshot state, and carries table/session identity forward so a seated guest does not see a "join first" command deck.
124. Character panel Auto-Complete now re-seeds generated pitch, look/vibe, party integration, and DM-note text from the current basics instead of only filling blanks and leaving stale generated flavor behind.
125. Create And Start no longer auto-runs the first DM generation; the host lands on a ready table with Start Adventure available, and waiting-guest cues refresh roughly once per second even while the DM is generating.
126. Product UX wording and hierarchy now push harder toward story-first table language: Continue/New Adventure/Find Table/DM Voice, friend seats, seat requests, host review, Scratchpad, collapsed Player Notes, quieter rails, and a more dominant play log.
127. Product hierarchy now treats notes as a notebook shelf instead of a permanent open binder: World and Player notes are collapsed by default, party cards clamp long descriptive text until hover/focus, Table Talk is smaller, and the center story surface receives more default space.
128. The first visible silhouette pass removes the strongest developer-tool cues: the gridpaper background is gone from the main play surface, the front door now reads as a larger game-style launcher, side rails are narrower/translucent shelves, message bubbles are softer, and the command deck is less terminal-like.
129. Table shelf sizing is now user-adjustable and saved locally: left Party shelf, right Notebook shelf, World notes, Your Notes, and Table Talk can be dragged without opening settings. Expanded right-rail panels scroll inside their own bodies when content exceeds the chosen size. Party cards no longer expand on hover, so their action buttons stay reachable.
130. Use Anyway is now hard-blocked for DM responses that speak or act for controlled party members. Format/proposed-change weirdness can still be reviewed by the host, but controlled-character agency failures require Try Again or Details instead of becoming table text.
131. Host New pre-lobby waiting guests now show seat buttons for every open Invite Friend slot, even when the guest did not pick a specific character before asking to join.
132. Character Auto-Complete now behaves like a reroll for generated flavor: it preserves hard facts such as name, ancestry, class, and level, while rotating the pitch, party tie, and DM note on each click.
133. Preferences now open as calmer App, DM Voice, Friends, and Troubleshooting tabs, with local-table tools, diagnostics, and DM recovery hidden until that section is chosen.
134. Settings entry points are now intent-aware: front-door Preferences opens App Preferences, DM Voice opens the storyteller setup surface, and the in-table gear opens Friends And Seats instead of app-level options.
135. The in-table settings gear is now a labeled Friends control, so normal play points hosts toward seating/share actions instead of generic configuration.
136. The front door now gives primary weight to Continue Adventure and Join A Table, with DM Voice demoted to the lower utility strip so setup no longer reads as a third play mode.
137. Seat Guest now opens the Friends And Seats surface directly, so waiting-player prompts land on the relevant host action instead of a generic settings dialog.
138. The command deck now shows a compact Now/Next cue from `TableSessionEngine`, making the input area reflect roleplay, combat, waiting, review, or recovery state instead of looking identical in every phase.
139. The app shell now exposes `data-table-phase` and `data-table-tone`, giving the table screen a single phase hook for combat/recovery/waiting styling instead of scattered local flags.
140. The default action prompt is now campaign-neutral instead of heist-specific, so new tables do not inherit an unrelated tone from placeholder copy.
141. New tables now open with a clearer multi-line setup beat: location, seated party, premise, and a direct Next instruction to press Start Adventure for the opening narration.
142. Table focus projection now lives in `app/table-focus-controller.js`, so phase-to-surface decisions are tested outside `app/app.js`; combat, party/waiting, and review states can visually elevate the right rail/section through a single `data-table-focus` hook.
143. Preferences now open as separate intent surfaces: App Preferences shows only app startup behavior, DM Voice shows only storyteller setup, in-table Friends And Seats shows only seating/share controls, and diagnostics/recovery stay behind explicit troubleshooting or recovery entry points.
144. Settings surface mode/copy/tab visibility now lives in `app/settings-surface-controller.js` with direct tests, so future settings UX changes do not have to add more policy to `app/app.js`.
145. Start Adventure now has an in-wizard progress/error status and repeat-submit guard, so campaign creation failures no longer look like a dead button while the global table status is hidden.
146. Freshly created ready tables now expose a table-level Start Adventure action that runs a dedicated first-session opening narration prompt after the host finishes last-minute invites and party edits.
147. Friends And Seats now leads with the normal Guest Link/open/copy flow and tucks seat-link/check/collection controls under Table Options, reducing the old wall-of-settings feeling for host seating.
148. Start Adventure opening readiness, button state, and first-session prompt policy now live in `app/table-opening-controller.js` with direct tests instead of being renderer-owned string/visibility logic.
149. The front door now presents Continue Adventure, New Adventure, and Join A Table as three first-class launcher choices, with DM Voice/preferences still demoted to utility actions.
150. Fresh-table Start Adventure now appears in the command deck next-step area instead of the status-strip action pile, making the first real table action harder to miss.
151. Normal DM Nudge prompt policy now lives in `app/dm-nudge-controller.js` with direct tests, reducing another renderer-owned table-flow instruction string.
152. Table action visibility for Nudge, Cancel DM Response, Start Adventure, Seat Guest, Review DM Response, Use Anyway, Try Again, and Read Latest now flows through `app/table-action-controller.js`, giving phase-aware CTAs one tested projection instead of scattered renderer functions.
153. Seat Guest and DM recovery actions now live in the command deck's current-action area beside Now/Next, while provider transport controls stay in the status strip.
154. The command input now consumes `TableSessionEngine` phase state, so DM-thinking, recovery, host-review, party-vote, waiting-guest, and guest-sent states show phase-aware placeholders and locking instead of generic disabled input.
155. Send-turn preflight policy now lives in `app/turn-submit-controller.js`, so busy/repair/empty-turn blocking copy is tested outside `app/app.js`.
156. Nudge DM and Start Adventure command gates now live beside the table action projection, so host/busy/opening-readiness checks are tested outside `app/app.js`.
157. Table phase focus now reaches the permanent rails: party, combat, notebook, and Table Talk receive tested primary/supporting/quiet states from `TableSessionEngine` projection, and provider-status changes repaint the composer so the Now/Next cue and input placeholder do not disagree.
158. Combat tracker now has an active-turn cue that names who controls the turn, what the table should do next, and the active actor's current legal actions from app-owned combat rules, making combat visually and functionally less like ordinary roleplay.
159. The manual copied-response fallback is no longer a normal recovery row: it stays hidden unless bridge/manual handoff is active or copied text is already present, so DM Recovery leads with the table-check summary instead of a visible paste box or fallback disclosure.
160. Inspecting a paused DM response now opens a focused DM Recovery settings surface instead of the broader Troubleshooting drawer, with `settings-surface-controller.js` owning the one-tab recovery mode and target panel filtering.
161. Live playtest fixed two table-flow bugs: Table Talk now repaints from fresh multiplayer snapshots while the DM is thinking, and app-owned enemy turns only mark themselves handled after initiative actually leaves the enemy; enemy attack messages now read as short table narration instead of bare roll receipts.
162. Join-client internals now use `join`/`host` runtime modes and `join-client` renderer names instead of the old `thin` naming, while legacy launch/package aliases remain as compatibility shims.
163. The New Adventure seed helper is now product-named as adventure seed presets instead of `dev-jump-start`, and its visible action reads as a creative table aid instead of a developer shortcut.
164. Campaign Chat fallback/progress copy now lives in `app/provider-chat-controller.js` with direct tests, so app.js executes provider-chat recovery plans instead of owning another cluster of fallback strings.
165. Campaign Notes now start with a Scene notebook section fed by scene retrieval, surfacing current situation, tensions, consequences, threads, and relevant relationships without making them permanent center-stage chrome.
166. Start Adventure now disappears after the host requests the opening narration for the current table session, while a fresh re-hosted local table session can show it again if the campaign is still pre-opening.
167. Opening narration now gives the model explicit neutral-presence examples for controlled party members, and DM Recovery summarizes agency blocks as table language instead of exposing raw `table[n]` validator diagnostics.
168. Current-schema campaign SQLite files now repair a missing `errors` diagnostics table before server diagnostics read recent errors; older local files with current metadata but missing the table no longer stay in a half-current state.
169. Internal observability harnesses now cover bounded/redacted trace logs, hidden server diagnostics trace endpoints, provider prompt/response lifecycle events, a SQLite diagnostics inspector, a hidden renderer debug hook, and an opt-in Playwright UI scenario script without adding player-facing chrome.
170. The Playwright harness now runs twelve hidden UI scenario permutations for home load, context-aware settings tabs, pre-lobby Add Crew uniqueness, binder party creation, campaign creation, RP posts, choice drafting, real Ollama contract parsing on a quick installed model, combat turn flow, Start Adventure button hiding after use, immediate Table Talk posting, and remote guest flows; failures capture screenshots, HTML, renderer diagnostics, and server output under `data/runtime/ui-flow-artifacts/`.
171. UI chaos mode now runs seeded desktop/tabletop permutations for delayed DM generation, Table Talk during generation, cancel/retry, dialog churn, pre-lobby Add Crew uniqueness, provider recovery, AI companion combat locks, app-owned combat turns, common button affordances, host-plus-guest Table Talk/action flow, and random non-destructive button-mashing across wizard, table, and combat phases.
172. `test:ui` builds before running by default, uses per-scenario temporary campaign roots, and cleans up test campaign SQLite files after successful scenarios so harness campaigns do not pollute real `data/campaigns`.
173. The UI harness provider mock is now a persistent page route with a mutable response queue, so cancel/retry tests remain deterministic and do not accidentally fall through to a real Ollama request except in the explicit Ollama contract smoke scenario.
174. Combat context pack text now sanitizes object-shaped action labels and enemy HP before provider prompts, preventing `[object Object]` leaks in legal options or enemy summaries.
175. Windows SQLite saves now retry transient atomic-replace collisions, reducing `EPERM`/`EBUSY` failures when review commits, Table Talk, diagnostics, and provider saves overlap under test pressure.
176. The Playwright harness now opens separate host and `/guest` browser tabs for remote-player coverage: pre-lobby guest request/adoption, active-table guest request, guest leave/rejoin, stale old-session rejection, new-game join, guest Table Talk, host Table Talk, guest action staging, remote party voting, and host/provider resolution.
177. Combat enemy-sync fallback now treats generic inferred hostiles as already covered by more specific provider-declared enemies, so an Ash Wolf does not become a second `enemy-wolf`/Massive wolf initiative row.
178. Campaign/table switches now clear stale transient turn carryover without clearing same-campaign in-flight turns, and background local-table polling/guest auto-resolution stands down while a new campaign is being created. This prevents old table actions from leaking into or racing a newly hosted campaign.
179. Guest auto-resolution policy now lives in `app/guest-auto-resolve-controller.js` with direct tests for host/client mode, campaign creation, table-running state, approval/group-hold settings, busy turn flow, host draft text, and staged-input readiness.
180. Campaign payload adoption and multiplayer background polling branch order now live in `app/campaign-adoption-controller.js` and `app/table-background-polling-controller.js`, so campaign-switch transient resets, guest waiting-room refreshes, Table Talk during DM generation, and new-campaign wizard polling pauses are tested outside `app.js`.
181. Hidden provider-status accessibility copy now uses DM Voice language instead of "Provider/manual bridge," closing one more player-facing naming leak without changing internal provider ids.
182. The Playwright UI harness now has an intentional visual audit mode: `npm run test:ui -- --scenario visual-audit-screenshots` captures successful screenshots for home, App Preferences, New Adventure, ready table, Friends and Seats, `/guest`, combat, and DM Recovery states under `data/runtime/ui-flow-artifacts/<timestamp>/visual-audit/`.
183. Provider response import planning now lives in `app/provider-import-controller.js`: implicit scene/combat fallback changes, review-batch construction, choice-owner message metadata, and import diagnostics metadata are planned outside the renderer, while `app.js` executes the resulting append/commit/render side effects.
184. Provider response cleanup and table-message splitting now live in `app/provider-import-controller.js`, including inline JSON/status-tail removal, readable choice formatting, companion beat extraction, and host-controlled PC autopost suppression hooks.
185. AI companion Nudge is now gated before the first Start Adventure opening, for guests, and during non-active combat turns through `table-action-controller.js`; UI chaos now verifies a disabled pre-opening companion Nudge cannot start generation or trigger recovery.
186. Fresh ready tables now have a first-class `opening_ready` table phase: the Now/Next strip says Ready To Start, the composer and Send Turn are locked until Start Adventure, DM Nudge is also gated by opening readiness, and the UI harness starts RP/combat scenarios through the explicit opening beat.
187. The front door now hides backend starter seed campaigns from saved-adventure counts/pickers and lets hosts delete real saved adventures from the starting page using the same recycled-file delete flow as the in-table rail.
188. Failure-pattern audit tightened alternate entry points that bypassed visible button gates: public guest actions/passes now reject pre-opening submissions and wrong combat turns in `src/multiplayer/local-table.js`, guest choice votes must match the current DM-authored choice/options, the remote UI harness directly probes pre-opening guest action rejection, and companion "Resolve Now" checks the turn gate before mutating message status.
189. New Adventure now says Set The Table while campaign files/seats are being prepared, leaving Start Adventure as the single explicit opening narration action on the table. Guest pre-opening composer copy now says it is waiting for the host to begin instead of implying the host already started.
190. The front door now uses Set Up Table and DM Voice language, the DM Voice panel uses table-facing DM Source/model/test labels, and the join panel no longer exposes a duplicate Advanced join dialog beside the normal invite-link flow.
191. DM Voice and Friends setup copy no longer exposes "AI" tabs, Guest Page labels, provider prompts, provider bridge, manual fallback, or campaign-chat status wording in normal live paths; visible host status now uses DM Voice, ChatGPT DM, Guest Lobby, and handoff language.
192. Visual audit caught DM Voice leaking into Friends And Seats because host chrome refreshes were unhiding whole settings panels after the settings-surface projection ran. Host chrome no longer overrides scoped settings-panel visibility, and the UI harness asserts DM Voice stays hidden inside Friends And Seats.
193. Host-controlled combat input now prompts the host to choose the active character's action, spell, movement, or tactic instead of saying "Act as..." a party member.
194. Product docs now explicitly separate host and DM roles: the host is a party member plus software-side table owner for setup/invites/provider access/recovery, while the provider/DM Voice is the DM at the table inside app-owned rails.
195. Settings surfaces are now single-purpose at runtime: Preferences, DM Voice, Friends And Seats, Diagnostics, and DM Recovery no longer expose cross-surface tabs to normal users, while the hidden UI harness can still open diagnostics directly for chaos/audit coverage.
196. DM Recovery no longer invites users to open a replacement-response path when nothing is waiting, and the copied-response fallback is hidden unless it is actually relevant to a bridge/manual handoff or pasted draft.
197. Slow ChatGPT DM progress copy no longer promises the replacement-response fallback while the app is still in extension/waiting mode; it tells the host they can keep waiting or start a new DM chat.
198. Play-log lifecycle wording for waiting, recovery, retries, dropped guest actions, staged guest inputs, and the Stage/Drop message-action projection now lives in `app/play-log-controller.js` with direct tests instead of being embedded in `app/app.js` DOM rendering.
199. AI companion approval projection now lives in `app/party-suggestion-controller.js`: provider-authored filtering, Stage For DM / Resolve Now / Pass copy, status labels, meta/activity text, and structured companion input packaging are tested outside the renderer.
200. Party-vote choice projection now lives in `app/choice-vote-controller.js`: vote counts, tie/leader state, host leading-choice projection, guest vote lookup, and selected-choice activity text are tested outside the renderer. Choice identity keys are shared with multiplayer authority through `src/engine/choice-vote-identity.js`.
201. Remote party-vote UI coverage now exercises a second `/guest` tab voting on provider-authored semantic option ids, then verifies the host sees the vote count and can draft the leading party choice.
202. Removed the stale `multiplayer.lastChoices` guest snapshot field. Choice prompts now have one visible source of truth: public play-log message metadata plus the authoritative choice-vote records.
203. Review commits now apply through the active campaign update queue instead of saving a stale full snapshot, preserving live route-side mutations such as Table Talk and remote guest state that land while a DM response is still importing.
204. Remaining visible provider/settings/state-save copy in the app-mode, DM Voice settings, join-mode, and review-commit paths now uses DM Voice/table-memory language instead of provider, bridge, AI, or extracted-state wording.
205. New Adventure companion setup now says "Scene cue for DM Voice" instead of "Host note for the DM," keeping table setup focused on story fit rather than software roles.
206. Guest table previews now filter starter scaffold ids/threads and strip host-only "Next:" setup instructions, so `/guest` sees table fiction, party, and useful seat context instead of backend placeholder records.
207. Combat active-turn labels now render host-controlled party turns as "Your turn" in the host app while preserving "Host turn" for observer contexts and separate friend/companion/DM/table turn labels.
208. The stale renderer-local provider speaker-splitting helper is removed; provider response speaker parsing now has one owner in `app/provider-import-controller.js`, and architecture tests guard against `app.js` growing that import policy back.
209. Table Talk source freshness now lives in `app/table-talk-controller.js` with direct tests for guest snapshots, stale local campaign chat, route-side snapshot updates during generation, and bad data fallback instead of inline renderer branching.
210. Successful imported player turns now clear the renderer's stale `currentTurn` pointer, so diagnostics and subsequent Send Turn attempts do not keep reasoning about the previous completed action; the exact remote chaos seed that exposed this now passes.
211. The command deck Send action is now content-aware for host and guest composers: connected/ready state alone no longer enables an empty submit, while typed text, approved companion beats, or active staged remote inputs wake the button. The input composer repaints on typed and programmatic draft changes.
212. The New Adventure wizard's first companion card now uses the same "Scene cue for DM Voice" wording as dynamically added party cards, removing the last visible "Host note for the DM" setup leak.
213. Additional visible copy leaks now use table language: returning home points to Continue/New Adventure/Join/DM Voice, local model readiness says local DM Voice instead of local AI, and delete confirmation describes a local backup instead of SQLite/deleted-campaigns/manual recovery internals.
214. Guest lobby previews now collapse fresh-table setup scaffolding down to table fiction/premise and the remote join helper asserts guests do not see "The table is set..." or host-only Next instructions.
215. Rejected remote guest actions, passes, and choice votes now capture a host trust snapshot before and after the route call, proving stale/forbidden guest submissions do not change table phase, provider generation, recovery, play-log messages, staged inputs, active turn, combat turn, or waiting-room state.
216. Start Adventure duplicate-click coverage now proves a rapid second click cannot create a second provider call or duplicate opening narration.
217. Recovery Retry/Use Anyway action gating now lives in `app/turn-repair-controller.js`; handlers block busy/no-repair/no-reviewed-response/hard-blocked states even if a hidden recovery button or debug path is invoked directly.
218. The 5E-lite character sheet seed/profile/equipment/spell policy moved out of `app/app.js` into `src/rules/character-seed.js`, with direct tests and architecture guards preventing renderer ownership from creeping back.
219. Play-message block parsing now lives in `app/message-block-controller.js`: DM/provider prose grouping, mechanics rows, parsed choice panels, structured choice override, and latest-choice lookup are tested outside `app/app.js`.
220. DM Voice settings/model projection now lives in `app/provider-settings-controller.js`: provider defaults, campaign-creation model fallback, Ollama status labels, setup hints, model option labels, and selected-model chips are tested outside `app/app.js`.
221. Renderer diagnostics/session-health/table-timeline projection now lives in `app/renderer-diagnostics-controller.js`, including debug play-log message normalization, diagnostics snapshot serialization, bounded timeline/event slices, and turn-flow timeline wording.

### Still Risky

1. Combat resolution is still partly provider-led for improvised/richer actions and some manual import paths, though explicit legal-option mismatches, active-actor mismatches, and resolved-turn action economy are now app-owned.
2. `app/app.js` still owns too much orchestration around submit/import/recovery/combat/multiplayer, though turn repair display/use-anyway policy, staged input recovery decisions/failure wording, play-log lifecycle/action wording, play-message block parsing, DM Voice settings/model projection, renderer diagnostics/session-health/table-timeline projection, AI companion approval projection, party-vote choice math, send-turn preflight including pre-opening locks, guest auto-resolution gating, campaign adoption resets, background multiplayer polling branch order, campaign-chat fallback/progress copy, provider import outcome copy, latest-response import gating, provider review auto-commit policy, stale combat-prompt repair policy, scene import fallback policy, combat import fallback policies, core opening/nudge prompt policies, Nudge/Start command gates, AI companion Nudge gates, and Nudge/table action visibility policy are now extracted. Watch remaining message-bubble actions, debug hooks, and public routes for phase/session bypasses whenever a new UI gate is added.
3. Recovery is more table-shaped in the live status strip, retry lifecycle, review/use-anyway copy, Settings labels, hard-blocked agency failures, focused DM Recovery surface, host review summary, and hidden copied-response fallback, but the underlying manual review textarea still exists as a rare bridge/manual fallback.
4. AI companion approval now has table-shaped Stage/Pass/Resolve Now language in a tested controller, combat nudges are active-turn-only suggestions, and app-owned enemy turns now guard against stuck initiative after resolution, but the flow still needs real combat playtest polish.
5. Party-vote collection now works for remote guests, clear leaders can be drafted by the host, ties are visible, and vote math/key identity are controller-tested. Final confirmation is still the normal Send Turn path rather than a dedicated modal.
6. Local multiplayer still needs longer two-machine soak testing.
7. Guest "sent / host received / resolving / resolved" state is clearer, but still needs two-machine soak testing.
8. Table Talk has a subtle unread cue and now refreshes during active DM generation, with hidden UI coverage proving local immediacy. It should still be checked during two-machine play.
9. Provider narration can still restate the player's action or lean on option panels too much in real-model soak, though the contract now has stronger narration-first instructions.
10. Failed staged inputs now remain visible and can be dropped by the host, but broader retry/cleanup guidance still needs real-session polish.
11. Active campaign changes reset TurnFlow, but app-level helper state still coexists with engine state.
12. Rail containment is improved, but long-session scroll behavior still needs a real campaign soak with many party members, notes, and combatants.
13. Context retrieval now has scene-focus, noisy ranking, thousands-record load fixtures, bounded SQLite query helpers, and bounded play-log rendering; the app still needs to use the query helpers more broadly instead of hydrating whole snapshots everywhere.
14. Settings still share one dialog component internally, but entry points now behave like separate App Preferences, DM Voice, Friends And Seats, Diagnostics, and DM Recovery surfaces instead of a tabbed control panel. A later visual pass can give each surface more bespoke layout.
15. Pre-table guest lobby is improved for Host New drafts, but still needs live UX soak: guests can request and reserve Remote Invite seats before Create And Start, and the host can seat waiting guests from the draft lobby. Guests cannot yet edit their own character sheet in the shared draft lobby.
16. Player Notes are campaign-SQLite-backed for local/host continuity, but not yet a proper per-user private/shared notes model for multiplayer devices.
17. Campaign Notes are populated from campaign records, but extraction/retrieval quality still needs scenario testing to prove the right people, places, things, and threads appear at the right time.
18. The migration runner exists and blocks unsupported versions, but no historical upgrade steps exist yet because there is only one SQLite schema lineage in the repo.
19. TableSessionEngine is currently a projection layer. The status strip, diagnostics, command deck, command input, and table-focus hook now consume it, but more UI surfaces still need to consume it directly before the table fully stops combining local flags.
20. `app/app.js` and `scripts/serve.js` are better marked, but still large enough that future fixes can accidentally create hidden coupling if new decisions are added there.
21. `debugSnapshot` summarizes current runtime state, and the Playwright harness stores failure artifacts, but there is not yet a persisted session recorder or replay tool for whole provider/UI exchanges.
22. Living-world memory now has projections, fixtures, relationship-state transitions, faction memory, and location-scar helpers, but provider output still needs real-model soak to prove it consistently creates useful relationship/consequence/faction/place updates.
23. World-memory helpers are in place, but scene-ending capture still depends on provider proposals and host review rather than an app-owned post-scene summarizer.
24. Guest-public routes are substantially covered, but every new multiplayer endpoint must keep proving whether it is a guest action or a host-authorized mutation; mixed-purpose routes are easy to get subtly wrong.
25. The app still has too many visible controls across table rails and campaign/table management. Preferences are calmer now via top-level tabs, but Steam-ready UX still needs fewer always-visible surfaces, clearer phase-specific actions, stronger empty-table guidance, and a fuller split between app preferences and table settings.
26. Automated UI coverage is now much stronger, including host plus `/guest` browser-tab flows, but it is still a local harness. The real multiplayer target remains a provider-hosting Electron/desktop authority plus one or more guests on `/guest` in a browser or desktop app.
27. The Playwright harness now has a stable visual-audit screenshot mode for core host, guest, combat, and recovery states, but it remains a local browser harness. Visual QA still needs occasional Electron-host and real LAN guest review to catch shell/window/device details.
28. Host play still blends party-member table play with software-owner controls in one shell. That is functional for authority, but the UX needs a clearer stance: host-only controls should feel like a tucked-away table-owner surface, while the center surface feels shared with the players and the provider remains the DM voice.

## Live Acceptance Matrix

| Table expectation | Status | Notes |
| --- | --- | --- |
| Player can tell whose turn it is. | Improved | Combat tracker, input placeholder, active-turn cue, and stuck-enemy guard cover basic cases. Long encounters need richer context. |
| Player can tell who controls each character. | Improved | Badges/actions exist. Language still needs user testing. |
| DM does not speak for controlled PCs. | Improved | Prompt, context, renderer recovery, suppression, and obvious output validation help. Needs broader scenario fixtures. |
| AI companions feel like party members. | Improved | Nudge flow, creation defaults, table-shaped Stage/Pass/Resolve Now language, and idle rarity/cooldown policy help. Combat-turn approval still needs polish. |
| DM can address party or specific party members. | Improved | Choice metadata supports party, character, subset, vote, and combat actor. Remote vote counters, tie language, and host draft action exist. |
| Guest players know whether input was sent/waiting/resolved. | Improved | Host/guest wording, message lifecycle, and faster waiting-room visibility are covered by tests/static guards. Needs two-machine soak. |
| Combat has one row per combatant. | Fixed | Grouped enemy expansion exists. |
| Combat rolls and HP changes are visible. | Improved | Mechanics rendering exists. Common app-owned combat actions now have fixtures, and enemy attack messages now include a short narration beat. Richer spell/effect rules and live-play polish are still open. |
| DM can continue scenes without forcing options. | Improved | Prompt/choice suppression and rich full-turn fixtures now cover social, travel, mystery, downtime, combat, and recovery. Needs real-model soak for repeated turns. |
| DM has story beyond current scene. | Improved | Hidden arcs exist, are private, and have non-leakage fixtures. Still needs pacing/adaptation scenario testing over longer sessions. |
| Notes support table memory. | Improved | Campaign Notes and Player Notes are split, with a Scene section surfacing current situation/consequences/threads from retrieval. Player Notes are campaign-backed local scratch space, but not yet a full per-user shared/private notes model. |
| Recovery after provider failure is understandable. | Improved | Player echoes, staged inputs, retry bubbles, table-facing labels, and session `Next:` guidance show lifecycle. Manual review still needs a less developer-shaped surface. |
| Character creation is consistent. | Fixed | Shared compact auto-complete and controller defaults are in place; Auto-Complete preserves hard facts while refreshing generated character flavor. |
| Forbidden actions fail safely. | Improved | Pre-opening host/companion/guest gates, stale session route tests, and the Playwright trust snapshot check prove key rejected actions do not silently mutate state. Expand this pattern to every interrupted/canceled action. |

## Priority Queue

### Critical

1. Continue making common combat action resolution app-owned before provider narration: broader action validation, richer damage/healing/effects, out-of-turn reactions, concentration saves, complex movement, and edge-case initiative handling.
2. Continue moving recovery decisions out of `app/app.js` into TurnFlow, ProviderOrchestrator, CombatEngine, and multiplayer domain modules.
3. Continue long-campaign scaling: play-log rendering and core SQLite query helpers are bounded, but more live paths still need to stop hydrating whole snapshots as campaigns age.
4. Keep future changes out of `app/app.js` and `scripts/serve.js` unless they are glue; extract policy/authority decisions into tested modules first.
5. Continue strengthening living-world capture after scene endings: consequences, relationship shifts, faction memory, and location scars now have app-owned storage helpers, but meaningful post-scene capture still needs provider soak and eventual app-side summarization.

### High

6. Continue validating party-vote host resolution in live play: guest voting, table leaning, ties, and host draft/send flow are implemented, but still need two-machine feel testing.
7. Playtest AI companion combat approval flow for wording, speed, and whether Stage/Resolve/Pass feels natural mid-combat.
8. Replace the remaining manual review textarea escape hatch with a fuller guided host review flow. Current state: repair summary guidance exists, the copied-response fallback stays hidden unless bridge/manual handoff or pasted draft text makes it relevant, fallback copy/state lives in the host response review controller, and Inspect opens a focused DM Recovery surface instead of broad Troubleshooting.
9. Run the two-machine playtest checklist and log every friction point.
10. Soak-test guest-side "sent / host received / resolving / resolved" state on two machines.
11. Soak-test host-side "guest is waiting on you" affordance on two machines.
12. Soak-test clicked desktop invite links across fresh guest machine, guest reconnect, host campaign switch, combat, and new campaign/table flows.
13. Continue tuning agency validation against real play logs; neutral presence and accidental host-name mentions now have fixtures, but broader phrasing still needs soak.
14. Keep the Maintainer Guide current whenever a new subsystem or debugging path is added.
15. Simplify app UX toward release quality: split Preferences/Table Settings, hide troubleshooting until needed, reduce always-visible rail controls, make empty-table states more inviting, and make the front door feel like a game launcher instead of a settings hub. Current state: front-door DM Voice readiness is now secondary, settings entry points are single-purpose instead of visibly tabbed, table-facing copy and visual hierarchy are improved, but the table still exposes too many knobs for Steam-ready flow.
16. Keep the host-surface stance explicit: the host is a party member and software-side table owner, not the DM. Host-only controls should collect setup, invites, provider/model access, party ownership, recovery, and tie-breaking without making the main table feel like a DM console.

### Medium

17. Make scene tension, consequences, and optional hidden-story debug summaries more visible in Settings/diagnostics, not live play.
18. Add curated regression campaigns for social negotiation, wilderness travel, mystery, downtime, and combat.
19. Tighten prompts so normal scene turns can be rich without always forcing choices, then validate with repeated real-model turns.
20. Continue combat tracker density work: concentration, richer resources, reactions, conditions, movement, action state.
21. Continue expanding route-level API/security tests as new routes are added; current coverage includes classification, API-token protection, stale identity rejection, local asset blocking, and real mutation routes.
22. Wire bounded SQLite query helpers into more live surfaces and eventually upgrade the play log from chunked rendering to true virtualization if needed.
23. Expand visual audit coverage as the UX evolves: add richer table phases, a cleaner host-only table-owner surface once it exists, and any release-critical Electron shell states that the local browser harness cannot see.

### Low

24. Replace remaining overly specific placeholder text with neutral table examples. Current state: the main command deck fallback is now campaign-neutral; secondary placeholders still need occasional review as screens evolve.
25. Add pre-table guest lobby: read-only campaign/party setup for guests, editable own character only, clear ready state.
26. Continue improving campaign-aware character auto-complete quality; current behavior preserves supplied hard facts while letting the button regenerate derived pitch/integration text from party theme, premise, and existing characters.
27. Add explicit party-template flow for "four dwarf soldiers" or "heist crew."
28. Add fuller backup/export/restore affordances before release; delete now recycles local SQLite files, but there is not yet a restore UI.

## Working Checklist

### Model I/O And DM Quality

- [x] Strict JSON contract for local model turns.
- [x] Qwen3 adapter avoids Ollama JSON mode and uses `/no_think`.
- [x] Bad empty structured responses are rejected and logged.
- [x] Hidden long/mid/short story threads are sent as private DM planning.
- [x] Choice targeting supports party, character, subset, vote, combat actor, and free prompts.
- [x] Add provider-output fixtures for obvious controlled-PC agency failures.
- [x] Reject obvious controlled-PC agency violations during response validation.
- [x] Add richer provider-output fixtures for social, travel, mystery, downtime, combat, and recovery scenes.
- [x] Improve context retrieval beyond recent history/context pack breadth.
- [x] Add long-campaign retrieval/ranking fixture for noisy relationship and event history.
- [x] Add large-campaign context-pack performance/load fixture.
- [x] Add long-campaign SQLite query fixture for bounded transcript and campaign-record reads.
- [x] Add hidden-story scenario tests for adaptation without leaking future twists.
- [x] Tighten prompts so normal scene turns can be rich without always forcing choices.

### Table Flow And Recovery

- [x] Main status strip uses table-facing language.
- [x] Submitted player bubbles show waiting/answered/review/failed lifecycle.
- [x] Auto-resumed unresolved turns mark the original bubble as recovering.
- [x] Failed provider turns keep approved/remote inputs visibly staged.
- [x] Let hosts drop stale staged guest inputs without marking them DM-resolved.
- [x] Diagnostics include table timeline and session health summary.
- [x] Session health names the waiting character and the next table responsibility for guest inputs.
- [x] Add a first-class TableSessionEngine projection for table phase, expected actor, DM status, review, recovery, combat, and multiplayer waiting state.
- [x] Make repair retry lifecycle as table-shaped as auto-resume.
- [x] Make fresh ready tables a first-class opening phase: Start Adventure is the only first provider turn, while DM Nudge, companion Nudge, Send Turn, and debug submit are blocked until the opening starts.
- [ ] Move remaining recovery/import decisions out of `app/app.js`. Current state: turn repair display/use-anyway policy, staged input recovery decisions/failure wording, play-log lifecycle/action wording, play-message block parsing, DM Voice settings/model projection, renderer diagnostics/session-health/table-timeline projection, AI companion approval projection, party-vote choice math, send-turn preflight including pre-opening submit locks, guest auto-resolution gating, campaign adoption resets, background multiplayer polling branch order, campaign-chat fallback/progress copy, provider import outcome copy, provider response import planning, provider response cleanup/table-message splitting, latest-response import gating, provider review auto-commit policy, stale combat-prompt repair policy, scene import fallback policy, combat import fallback policies, copied-response fallback copy/state, core opening/nudge prompt policies, Nudge/Start command gates, and Nudge/table action visibility policy are extracted; broader provider/import side-effect orchestration remains.
- [x] Replace technical wording in live recovery controls.
- [x] Replace remaining technical wording in diagnostics/manual import controls where it leaks into ordinary play.
- [x] Soften manual review/use-anyway lifecycle wording so table surfaces do not mention JSON contracts or import mechanics.
- [x] Add a host-facing DM response review summary before raw pasted-response fallback controls.
- [x] Tuck copied-response fallback controls behind a guided table-facing disclosure instead of showing a paste box in normal recovery.
- [x] Extract turn repair display/use-anyway policy out of `app/app.js`.
- [x] Ensure every stuck state answers who is waiting and what the host can do next.

### Combat

- [x] Combat tracker shows active actor, round, party/enemy rows, and HP labels.
- [x] Grouped enemies expand into separate initiative rows.
- [x] Provider is instructed not to resolve the next actor in one response.
- [x] Party-member combat turns are input turns, including AI companions.
- [x] Surrender/de-escalation can end combat without only HP defeat.
- [x] Make common combat resolution app-owned.
- [x] Add fixtures for app-owned attack, dodge, surrender, de-escalation, DC check, and opposed skill contest.
- [x] Add fixtures for app-owned simple spell save, spell-slot spending, and save-gated conditions.
- [x] Add fixture for app-owned enemy attack turn.
- [x] Add fixtures for chase, richer intimidation/de-escalation contests, reactions, concentration, and richer spell/effect cases.
- [x] Reject stale/unavailable/mismatched explicit combat legal-option IDs.
- [x] Make auto-resolved enemy turns app-bounded: app owns rolls/effects/initiative before narration.
- [x] Add enemy-turn and player-turn fixtures that verify one actor is resolved per provider response.
- [x] Add crisp AI companion combat approval flow.
- [x] Reject provider combat responses that resolve the wrong active actor.
- [x] Ensure initiative never advances by provider phrasing alone.
- [x] Apply app-owned turn economy for resolved party combat turns, including action/bonus/reaction/movement validation and logging.
- [x] Fix combat-start enemy identity drift caught by `combat-player-and-enemy-turns`: provider-declared enemies, imported/missing combatants, and inferred hostile actors now collapse to one canonical enemy row before app-owned enemy turns advance initiative.

### Party Agency And AI Companions

- [x] First campaign character is host-controlled.
- [x] Additional created characters default to AI companions.
- [x] AI companion cards use Nudge, not Play.
- [x] Nudge prompts ask for brief low-stakes RP only.
- [x] Choice prompts can target individual party members.
- [x] Make AI companion suggestions appear as approve/resolve/decline table beats.
- [x] Add idle companion interjection rules with cooldown/rarity so they feel alive but not noisy.
- [x] Add fixtures for host-controlled, remote-controlled, unassigned, and AI companion agency boundaries.
- [x] Gate AI companion Nudge before the first Start Adventure opening, for guests, and outside the companion's active combat turn.
- [ ] Tune agency validation against real play logs so it catches overreach without blocking neutral presence/staging narration. Current state: neutral presence, hostile focus, host-name-as-object, remote-PC body-language overreach, "doesn't back down" resolve-overreach fixtures, and friendlier opening/recovery copy are covered.
- [x] Let host choose host/AI/unassigned during additional character creation.

### Multiplayer And LoreKeeper Join

- [x] Host owns software-side campaign files, provider access/model calls, canon review, guest approvals, and persistence; the provider remains the DM voice.
- [x] Guest/join clients do not need Ollama or provider controls.
- [x] Join-as flow supports richer character proposal and host integration note.
- [x] Guest inputs are visible table messages and can become structured `user.playerInputs[]`.
- [x] Party-scoped DM choices are host-submitted decisions; remote guests vote on options instead of drafting locked action text.
- [x] Guest snapshots redact hidden DM notes and enemy HP.
- [x] Remote-to-AI/host controller transfer clears stale guest links.
- [x] Desktop protocol invite links preload the Join screen and clear stale saved sessions for different invites.
- [x] Fixed-seat invite joins require a table-visible guest name.
- [x] LoreKeeper has a single visible Host/Join front door; the old ThinLoreKeeper desktop identity is removed.
- [x] DM Voice setup is reachable as a first-class front-door flow.
- [x] Browser `/guest` waiting room lets guests ask for a seat before receiving any campaign state.
- [x] Browser `/guest` previews the active host table and lets guests request an available non-host character seat.
- [x] Host can copy a same-network Guest Link from Local Table.
- [x] Waiting-room guests are visible to the host without digging through diagnostics, including requested character seat.
- [x] Stale waiting-room guests expire instead of lingering as broken seat buttons.
- [x] Guest Leave notifies the host, releases the remote controller to Host, and makes the vacated seat requestable again.
- [x] Fresh local table sessions do not silently revive old approved guests from a previous session.
- [x] Waiting-room seating updates live guest session state so the guest composer and send path agree with the visible "seated as" state.
- [x] Normal Guest Links use plain `/guest`; actions/snapshots still validate campaign/table/session identity after registration.
- [x] Guest snapshots and staged actions reject wrong campaign/table/session identity when supplied.
- [x] Add host plus `/guest` UI harness coverage for pre-lobby join/adoption, active-table join, leave/rejoin, stale old-session rejection, new-game join, guest/host Table Talk, remote party voting, and remote action staging/resolution.
- [ ] Run first real two-machine playtest. Network connectivity and guest table sync were proven; the seat-request lobby needed hardening.
- [x] Make guest sent/received/resolving/resolved states clearer.
- [x] Make host "guest waiting" state harder to miss.
- [x] Add explicit host tie-break/confirm flow for party votes. Current state: vote counters, tie/leader language, and "Draft leading choice" action exist; final confirmation remains the normal Send Turn path.
- [x] Show party-choice vote counters and let guests switch their vote.
- [x] Add stale-session reconnect regression for guest snapshots after host table restart.
- [x] Add disconnect/reconnect/campaign-switch soak tests. Current state: deterministic local regression coverage exists; real two-machine soak remains tracked separately.
- [ ] Consider WebSocket/broadcast later after polling semantics are solid.

### Character Creation

- [x] Campaign creation requires one host character.
- [x] Campaign creation supports `+` additional characters.
- [x] Host New hides the previous table and uses a full setup workspace.
- [x] Campaign creation can mark seats as Host, AI, or Remote Invite.
- [x] Remote Invite seat intent survives campaign record creation and appears as a joinable guest seat after Create And Start.
- [x] Host New has an explicit Back action and no stale table rails while setup is open.
- [x] Post-start host-created character flow uses same compact creator.
- [x] Guest join and LoreKeeper Join use aligned compact fields.
- [x] Auto-complete preserves supplied fields and fills missing details.
- [x] Build shared pre-table lobby for invited players with read-only campaign/party state and editable own character. Current state: `/guest` shows the table preview, open character seats, and an optional character draft card; waiting-room registrations carry the draft through pre-table and active-table seating so the host can see what the guest is bringing.
- [x] Let Host New Remote Invite slots appear on `/guest` before campaign start and preserve waiting guest requests after Create And Start.
- [x] Let the host seat waiting guests from Host New before Create And Start.
- [x] Make auto-complete campaign-aware without overriding user facts.
- [x] Add party-template flow for repeated related companions.
- [x] Improve class/spell/equipment depth beyond shallow 5E-lite starts.

### UI Comfort

- [x] Raw provider meta hidden during normal play.
- [x] Debug meta toggle available in Settings diagnostics.
- [x] Right rail separates Campaign Notes from Player Notes, with Table Talk kept at the bottom.
- [x] Empty states use more table-shaped language.
- [x] Main menu separates Host, Join, and DM Voice setup from the in-campaign rails.
- [x] Main menu hides last-table rails, notes, and command input until a flow is chosen.
- [x] Host on the main menu opens a selected campaign instead of implicitly resuming the last active campaign.
- [x] Join setup hides table rails and command input until connected to a host table.
- [x] Campaign/table view can return to the main menu without closing the app.
- [x] Split settings into App Preferences and Campaign Settings as separate surfaces. Current state: the shared dialog component remains, but the runtime surfaces are single-purpose App Preferences, DM Voice, Friends And Seats, Diagnostics, and DM Recovery views with cross-surface tabs hidden from normal entry points.
- [x] Rename first-pass technical UI language so normal users see Host/Join/DM Voice/Guests/Troubleshooting instead of provider/SQLite/import/control-panel wording.
- [x] Reduce visible Preferences controls to App, DM Voice, Friends, and Troubleshooting tabs, with diagnostics/recovery hidden unless troubleshooting is chosen.
- [ ] Rework the table screen into phase-aware action surfaces so users see what matters now instead of every system at once. Current state: the command deck now shows a TableSessionEngine-driven Now/Next cue, fresh-table Start Adventure, Seat Guest, and DM recovery actions live beside that cue, `app/table-action-controller.js` owns the main table CTA visibility policy, `app/table-focus-controller.js` maps phase to the surface that deserves attention, and the shell exposes `data-table-phase`/`data-table-focus`; the party, combat, notebook, and Table Talk rails now receive tested primary/supporting/quiet focus states, provider-status updates repaint the composer to keep phase copy aligned, Start Adventure hides after the host requests the opening for the current table session, pre-opening DM/AI companion nudges and Send Turn are disabled until that opening has begun, backend starter seed campaigns are hidden from the front door, combat has an active-turn cue with controller responsibility plus legal actions, and Inspect opens a focused recovery settings surface. Deeper combat action workflows and broader settings split work still need phase-specific behavior.
- [x] Make the front door feel closer to a game launcher: recent campaign, new table, join table, DM Voice readiness, and no hidden last-table background. Current state: the primary grid now presents Continue Adventure, New Adventure, and Join A Table as first-class choices, with DM Voice and Preferences in the lower utility strip.
- [x] Bound initial play-log rendering and keep older transcript entries reachable with Show Earlier.
- [x] Soak-test scroll behavior during long sessions. Current state: hidden UI harness helpers can seed/append synthetic play-log messages, and `long-session-scroll-soak` proves bounded rendering, Show Earlier, reader-position preservation, and bottom auto-follow without requiring hundreds of real provider turns.
- [x] Keep debug/repair tools tucked away unless action is required.
- [x] Add a context-sensitive Scene section to Campaign Notes. Current state: full note tabs can wait for playtest, but current scene/retrieval context is now visible in the notebook shelf.
- [x] Persist Player Notes to campaign SQLite or an explicit per-user notes store before relying on them for long campaigns.
- [x] Make Table Talk harder to miss without making it noisy.
- [x] Refresh Table Talk during active DM generation so side chat does not wait for the DM turn to finish.
- [x] Keep the left rail stable when party cards and combat rows have long names/actions.
- [x] Add an intentional visual-audit/screenshot harness mode for home, setup, table, combat, recovery, settings, and `/guest` states. Current state: `test:ui -- --scenario visual-audit-screenshots` captures home, App Preferences, New Adventure, ready table, Friends and Seats, guest lobby, combat, and DM Recovery screenshots against a temp campaign root.

### Storage, Diagnostics, And Safety

- [x] SQLite is the canonical campaign store.
- [x] Errors table records provider/session diagnostics. Current state: diagnostics now repair current-schema files that claim to be up to date but are missing the `errors` table.
- [x] Ollama context cache is campaign/model/mode scoped and non-canon.
- [x] Diagnostics can show recent errors and session health.
- [x] Add internal trace/debug harnesses for API/provider/renderer/UI investigation. Current state: server diagnostics include an auth-protected trace ring, provider generation emits prompt/response lifecycle events, `inspect:diagnostics` reads campaign SQLite diagnostics, and `test:ui` is an opt-in Playwright scenario harness with seeded desktop chaos mode, deterministic provider mocking, temp campaign roots, pre-opening DM/companion Nudge and Send Turn checks, and failure artifacts.
- [x] Add trust-invariant assertions to the UI harness for rejected role/session actions. Current state: forbidden/stale guest action, pass, and choice-vote probes now capture host state before and after the route call and assert no provider generation, play-log, staged-input, turn, combat, recovery, phase, or waiting-room mutation.
- [x] Add route-level tests for private/guest API split.
- [x] Add route-level integration tests with API token enabled and stale campaign/table/session payloads.
- [x] Add local asset and path traversal integration coverage for the server.
- [x] Gate host-style combat join mutations behind local app authorization when they share a guest-public route.
- [x] Add migration modules before public release. Current state: versioned runner exists and unsupported schema/user_version combinations fail loudly; future schema changes still need explicit migration entries.
- [x] Add backup/export/recycle story before destructive delete in release builds. Current state: delete recycles SQLite files to `data/campaigns/.deleted`; restore UI remains future polish.
- [x] Move imported assets into app-owned portable asset storage. Current state: imported bundle assets are copied into `data/assets/<campaign>/...`; broader export/restore asset packaging remains future polish.
- [x] Add a Maintainer Guide with focused commands, debug owners, and common failure playbooks.
- [x] Add a compact table debug snapshot to renderer/server diagnostics.
- [x] Add high-risk regression pack for authority/recovery/combat/storage promises.
- [x] Add focused npm test scripts so future maintainers can run subsystem checks without memorizing file names.
- [x] Add living-world goal horizons and memory retrieval so consequences, relationships, NPCs, factions, and locations can influence later scenes.
- [x] Add living-world documentation and long-campaign-noise fixture for recurring NPC/location/faction memory.
- [x] Add relationship-state transition helper and canonical-change integration for durable NPC/faction/party relationship shifts.
- [x] Add faction/location memory helpers and canonical-change integration for durable beliefs, memory, scars, history, and related goal links.
- [x] Add model-contract coverage for pre-action nudge requests that include object-shaped living-world memory.

## Two-Machine Playtest Checklist

### Before Guest Joins

1. Open LoreKeeper on the host machine and choose Host.
2. Open the campaign to show.
3. Confirm DM Voice is ready.
4. Confirm debug meta in play log is off.
5. Confirm Local Table is off until ready.
6. Create/confirm host character.
7. Add AI companions before invite if desired.
8. Open the Guest Lobby.
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
- 2026-06-15: The DM should be able to target individual party members or the whole party, and party votes should become an actual table flow with host tie-breaks. Current state: targeting, votes, counters, and host draft action exist; two-machine feel testing remains.
- 2026-06-15: AI companions should occasionally feel alive with brief unprompted contributions, but not every response cycle and not for major decisions. Current state: idle companion interjections are rarity/cooldown gated in the provider request.
- 2026-06-15: App-owned combat resolution now covers common attacks, checks, contests, saves, simple spells, healing, reactions, concentration, retreat/surrender, and enemy turns. Remaining work is live-play polish for richer improvised actions and edge cases.
- 2026-06-16: Player Notes are now campaign-backed for local/host continuity. Remaining design decision: whether multiplayer notes become per-user private notes, host-visible table notes, or both.
- 2026-06-16: Pre-table guest seating now has a draft table/session identity and is published to the normal `/guest` page while Host New is open. Hosts can reserve a requested seat before launch. Remaining work: guest-editable character draft state and live local-browser soak.
- 2026-06-16: Remote party-choice voting is usable, with leader/tie language and a host draft action. Remaining work is two-machine feel testing to decide whether the normal Send Turn confirmation is enough.
- 2026-06-16: Next local playtest target should be host app plus local browser guest through `/guest`: join waiting room, seat request, party vote, guest leave/rejoin, one combat turn, and one provider recovery.
- 2026-06-18: Round 2 audit found stale "early scaffold/sidecar" product copy and visible disabled provider roadmap options. README, default campaign copy, prompt/template labels, server/check strings, and Preferences AI source now use current LoreKeeper/table DM language; stored prompt template IDs remain stable for compatibility.
- 2026-06-18: Automated UI chaos should stay desktop/tabletop-first for now. Mobile/narrow viewports are useful only as an opt-in stress check; release confidence should prioritize Electron host plus `/guest` browser/desktop guest flows.
- 2026-06-18: Test campaign SQLite files must stay isolated to temporary harness roots and be cleaned after successful bundles. Failed bundles may keep artifacts for debugging, but should not pollute real `data/campaigns`.
- 2026-06-18: Remote multiplayer UI harness now uses a real second `/guest` page against the same temp host server. It catches renderer/session wiring regressions, but two-machine play is still needed for LAN/firewall/browser-device behavior.
- 2026-06-18: Nightly rerun results: `npm run test:all`, `npm run build`, focused Table Talk, remote pre-lobby join, remote active-table leave/rejoin/new-game, and 3 seeded chaos runs passed. The default UI pack failed at `combat-player-and-enemy-turns` because the combat-start mock declared `enemy-ash-wolf`, app-owned enemy resolution completed, then initiative drifted to an inferred `enemy-wolf`/Massive wolf instead of the expected party actor.
- 2026-06-18: Follow-up fixed the combat identity drift plus related remote/new-campaign stale-turn and background-poll races. Verification: `npm run build`, `npm run test:engine`, focused combat UI, focused remote leave/rejoin/new-game UI, seeded chaos UI (`combat-sync-polish`, 3 runs), full `npm run test:ui -- --skip-build`, and `npm run test:all` all passed.
- 2026-06-18: Guest auto-resolution policy was extracted from `app.js` into a tested controller. Verification: `npm run build`, `npm run test:engine`, focused remote leave/rejoin/new-game UI, seeded chaos UI (`guest-auto-resolve-policy`, 3 runs), full `npm run test:ui -- --skip-build`, and `npm run test:all` all passed.
- 2026-06-18: Campaign adoption and multiplayer background polling policy were extracted from `app.js` into tested controllers. This keeps campaign-switch transient resets, local-table polling pauses during Host New, guest waiting-room refreshes, and Table Talk refresh during DM generation explicit and regression-covered. Verification: `npm run build`, `npm run test:engine`, focused Table Talk UI, focused remote leave/rejoin/new-game UI, `npm run test:regression`, and `npm run test:all` passed.
- 2026-06-18: Table-sim alignment audit: architecture is moving the right direction through app-owned state/combat/continuity and extracted renderer policies, but the host UX still reads partly like a software console/settings hub. Highest product gaps are phase-specific combat actions, host-only controls as a tucked-away table-owner surface, manual recovery escape hatch polish, guest-editable pre-table drafts, two-machine soak, and a first-class visual-audit screenshot mode.
- 2026-06-18: Visual audit screenshots are now first-class in the hidden UI harness. Verification: `npm run test:ui -- --scenario visual-audit-screenshots --skip-build` passed and produced home, App Preferences, New Adventure, ready table, Friends and Seats, guest lobby, combat, and DM Recovery screenshots.
- 2026-06-18: Provider response import planning was extracted from `app.js` into `provider-import-controller`, covering implicit scene/combat fallback changes, review-batch creation, and message import metadata. Verification: `npm run build`, `npm run test:all`, focused RP import UI, and focused combat import UI passed.
- 2026-06-18: Provider response cleanup and table-message splitting moved into `provider-import-controller`, including readable choice cleanup and host-controlled PC autopost suppression hooks. Verification: `npm run build`, `npm run test:all`, focused RP import UI, and focused combat import UI passed.
- 2026-06-18: Fresh-campaign playtest found AI companion Nudge was available before Start Adventure, which could send a model turn before the table's opening beat and fall into DM Recovery. Fix: companion Nudge is now disabled before the opening, and focused plus chaos UI harness coverage clicks the disabled button to prove it cannot start generation or recovery.
- 2026-06-18: Pre-opening table flow now treats Start Adventure as the only first provider turn. The table phase is `opening_ready`, Now/Next says Ready To Start, the composer/Send Turn/DM Nudge/AI companion Nudge/debug submit are gated until the opening begins, and UI scenarios now start RP/combat through Start Adventure. Verification: `npm run build`, `npm run test:engine`, focused pre-opening/RP/combat UI, seeded chaos UI (`pretest-phase-gates`, 2 runs), and full `npm run test:ui -- --skip-build` passed.
- 2026-06-18: Front-door library polish: saved-adventure picker/counts now hide backend starter seed campaigns, Continue/Delete disable when no real saved adventures exist, and the starting page can delete selected saved adventures through the recycled-file delete dialog. Verification: `npm run test:engine`, `npm run build`, focused `home-delete-campaign` UI, and focused `home-baseline` UI passed.
- 2026-06-18: Failure-pattern audit of the latest bug cluster found the shared smell: new phase/session rules often landed in visible controls first, while alternate entry points stayed permissive. Hardened public guest action/pass routes, choice-vote authority, and companion Resolve Now side effects. Verification: `npm run test:multiplayer`, focused remote `/guest` UI scenario, `npm run test:regression`, and `npm run test:engine` passed.
- 2026-06-18: Launcher wording pass removed the duplicate "Start Adventure" mental model from campaign creation. New Adventure now sets the table, and Start Adventure remains the table-level opening beat. Verification: `npm run test:engine`, `npm run build`, and focused `create-campaign-and-hide-start-adventure-after-use` UI passed.
- 2026-06-18: Front-door/join/DM Voice polish changed Start New to Set Up Table, Check AI to DM Voice, softened the DM Voice panel's visible source/model/test labels, and removed the duplicate Advanced join button from the normal join panel. Verification: `npm run test:engine`, `npm run build`, focused `home-baseline`, and focused `settings-navigation-and-diagnostics` UI passed.
- 2026-06-18: DM Voice/Friends copy pass changed the Settings tab from AI to DM, changed Guest Page actions to Guest Lobby, replaced provider-prompt/bridge/manual-fallback live statuses with DM turn/ChatGPT DM/handoff wording, and tightened `table-status` matching so readiness does not look like active DM thinking. Verification: `npm run test:engine`, focused `settings-navigation-and-diagnostics`, `create-campaign-and-hide-start-adventure-after-use`, and `rp-post-narration-import` UI passed.
- 2026-06-18: Visual audit found Friends And Seats still rendering the DM Voice panel. Root cause: `applyHostModeChrome()` used an old broad setup-section unhide helper after scoped settings projection. Fix keeps host chrome from overriding panel visibility and adds a UI assertion for the Friends surface.
- 2026-06-18: Combat command-deck copy now asks the host to choose the active character's action/spell/movement/tactic instead of "Act as" that character. Verification: `npm run test:engine`, `npm run build`, and focused `combat-player-and-enemy-turns` UI passed.
- 2026-06-18: Product stance clarified: the host is not the DM. The host is a party member and the software-side table owner for campaign setup, invites, party management, provider/model access, recovery, and tie-breaking. The provider/DM Voice is the DM inside app-owned rails.
- 2026-06-18: Settings entry points now behave like single-purpose surfaces instead of a visible tabbed preferences console. Preferences, DM Voice, Friends And Seats, Diagnostics, and DM Recovery no longer expose cross-surface tabs to normal users; diagnostics remain reachable through the hidden UI harness. Verification: `npm run test:engine`, `npm run build`, and focused `settings-navigation-and-diagnostics` UI passed.
- 2026-06-18: DM Recovery now hides the copied-response fallback unless bridge/manual handoff is active or pasted draft text exists, idle recovery no longer tells users to open the replacement-response path, and slow ChatGPT DM progress no longer promises a hidden fallback control. Verification: `npm run test:engine`, `npm run build`, and focused `visual-audit-screenshots` UI passed.
- 2026-06-18: UI chaos gained random non-destructive button-mashing in wizard, table, and combat phases. The first smoke found a harness false-positive where seed reroll could rewrite the fixed test title after setup; the mash pool now avoids post-fill seed rerolls. Verification: seeded chaos smoke (`afk-mash-smoke`, 2 runs) and ramp (`afk-mash-ramp`, 8 runs) passed.
- 2026-06-18: Remote party-vote harness coverage found duplicated choice-key identity logic between the renderer projection and multiplayer authority. Shared choice identity now lives in `src/engine/choice-vote-identity.js`, and the focused remote `/guest` scenario verifies semantic provider option ids can be voted on and drafted by the host. Verification: focused remote party-vote UI, `npm run test:multiplayer`, `npm run test:engine`, and `npm run build` passed.
- 2026-06-18: Follow-up choice-state audit removed the never-populated `multiplayer.lastChoices` guest snapshot path so future guest choice work cannot accidentally consume stale sidecar state. Verification: `npm run test:multiplayer` passed and no `lastChoices`/snapshot choice-field references remain.
- 2026-06-18: Remote chaos now opens a real `/guest` page in every chaos run, verifies pre-opening action rejection, Table Talk both directions, and post-opening guest auto-resolution. The ramp found review commits could overwrite route-side Table Talk when provider import saved from a stale campaign snapshot; review commits now run through `updateActiveCampaign`. Verification: seeded remote chaos ramp (`afk-remote-chaos-ramp`, 3 runs), `npm run test:engine`, `npm run test:regression`, and `npm run build` passed.
- 2026-06-18: Visible copy sweep replaced remaining provider/bridge/AI/extracted-state wording in app-mode notes, Join-mode DM Voice status, DM Voice settings save states, empty DM paste fallback, and review commit status. Verification: focused `settings-navigation-and-diagnostics` UI passed.
- 2026-06-18: New Adventure companion setup wording now uses scene-cue/DM Voice language, and the provider prompt prefix for those cues is table-facing. Verification: focused `create-campaign-and-hide-start-adventure-after-use` UI passed.
- 2026-06-18: Visual audit found `/guest` lobby previews leaking starter scaffold chips (`place-starting-location`, "Open the first thread") and host-only setup instructions. Join preview rendering now resolves friendly place names, filters scaffold records, and strips `Next:` setup copy. Verification: `npm run build`, focused remote pre-lobby UI, and visual-audit UI passed.
- 2026-06-18: Combat rail copy now treats the host app as the player seat for host-controlled active party turns ("Your turn") while keeping remote, companion, DM, and unassigned table turns distinct. Verification: `npm run test:engine`, focused combat UI, `npm run build`, and visual-audit UI passed.
- 2026-06-18: Guest join-preview cleanup/projection policy now lives in `app/join-preview-controller.js` instead of renderer orchestration. Direct tests cover setup-line collapse, scaffold record filtering, friendly place names, and join hints; focused remote pre-lobby, active leave/rejoin/new-game, and party-vote UI scenarios passed.
- 2026-06-18: Guest auto-resolve timers are now pinned to the campaign/table/session that scheduled them and are cleared when scheduling becomes invalid. This hardens host plus `/guest` campaign switching against delayed remote actions landing in the wrong table. Verification: `npm run test:engine`, `npm run build`, focused remote active leave/rejoin/new-game UI, and seeded remote chaos (`stale-guest-pin-remote-chaos`, 4 runs) passed.
- 2026-06-18: Choice selection parsing, structured choice normalization, audience labels, edited-choice preservation, pending clicked-choice matching, and provider choice meta copy moved into `app/choice-vote-controller.js`, with architecture guards keeping that grammar out of `app/app.js`. Verification: `npm run test:engine`, `npm run build`, focused remote party-vote UI, and focused RP import UI passed.
- 2026-06-18: Long-session scroll soak is now automated through hidden UI harness play-log seeding/append hooks. Verification: `npm run build` and focused `long-session-scroll-soak` UI passed.
- 2026-06-18: `/guest` waiting-room joins now expose the optional character draft card and carry those notes through pre-table and active waiting-room seating. Verification: `npm run test:multiplayer`, focused remote pre-lobby UI, and focused remote active leave/rejoin/new-game UI passed.
- 2026-06-18: Provider result metadata and contract-issue selection moved into `app/provider-result-controller.js`, with architecture guards keeping that pure repair/import policy out of `app/app.js`. Verification: `npm run test:engine` and `npm run build` passed.
- 2026-06-19: Trust pass started. SotT now tracks Trust Risks explicitly, and rejected guest-action probes compare host trust snapshots before/after to catch silent mutation, not just HTTP rejection. Verification: `node --check scripts/test-ui-flow.js`, focused remote leave/rejoin/new-game UI, and seeded chaos UI (`trust-invariant-smoke`, 2 runs) passed.
- 2026-06-19: Trust route probes now cover pre-opening guest action, pass, and choice-vote attempts with the same no-mutation host snapshot invariant. Verification: `node --check scripts/test-ui-flow.js`, focused remote leave/rejoin/new-game UI, and seeded chaos UI (`trust-route-smoke`, 2 runs) passed.
- 2026-06-19: Start Adventure duplicate-click trust coverage now fires two clicks on the opening control and asserts only one provider generation plus one visible opening narration. Verification: `node --check scripts/test-ui-flow.js` and focused `create-campaign-and-hide-start-adventure-after-use` UI passed.
- 2026-06-19: Recovery action handlers now use a tested repair-action gate so Retry/Use Anyway cannot run from hidden/debug entry points during active generation, without an active repair, without reviewed text, or after a hard agency block. Verification: `npm run test:engine`, node syntax checks, and visual-audit UI passed.
- 2026-06-19: `v0.5.0-work` branch began the larger `app/app.js` teardown. First extraction moved 5E-lite character seed/profile/equipment/spell rules into `src/rules/character-seed.js`, deleting roughly 340 renderer lines and adding direct module/architecture tests. Verification: `npm run test:engine`, `npm run build`, focused wizard party UI, and focused Start Adventure UI passed.
- 2026-06-19: Play-message block parsing moved out of `app/app.js` into `app/message-block-controller.js`, covering DM/provider prose grouping, mechanics rows, parsed choice panels, structured choice override, and latest-choice lookup. Verification: node syntax checks, `npm run test:engine`, `npm run build`, focused Start Adventure UI, and focused RP choice-drafting UI passed.
- 2026-06-19: DM Voice settings/model projection moved out of `app/app.js` into `app/provider-settings-controller.js`, covering provider defaults, campaign-creation fallback model selection, Ollama status/setup copy, option labels, and selected-model chips. Verification: node syntax checks, `npm run test:engine`, `npm run build`, and focused settings/diagnostics UI passed.
- 2026-06-19: Renderer diagnostics/session-health/table-timeline projection moved out of `app/app.js` into `app/renderer-diagnostics-controller.js`, covering debug play-log message normalization, diagnostics snapshot serialization, bounded timeline/event slices, and turn-flow timeline wording. Verification: node syntax checks, `npm run test:engine`, `npm run build`, and focused settings/diagnostics UI passed.

## How To Use This Doc

1. Start here before continuing broad polish work.
2. Pick the highest-priority unchecked item that matches the current pain.
3. Keep changes small enough to test and commit cleanly.
4. When a new issue is noticed during play, add it to New Notes Inbox first.
5. When fixed or clarified, move it into the appropriate checklist section and update status.
6. Keep older docs as reference, but let this doc be the current steering wheel.
