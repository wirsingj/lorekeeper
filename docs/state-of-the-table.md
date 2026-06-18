# LoreKeeper State Of The Table

Updated: 2026-06-17

This is the sliding-window working doc for LoreKeeper's current product state, goal, and improvement checklist. When we say "keep working through the state-of-the-table," this is the doc to use first.

This file has absorbed the old tabletop reality checks, playtest notes, model I/O notes, deep-audit notes, authority/session-isolation notes, and recovery checklists that used to live as separate temporary docs. The long-lived companion docs are `docs/ARCHITECTURE.md` for ownership boundaries, `docs/MAINTAINER_GUIDE.md` for commands/debugging/failure playbooks, and `docs/living-world.md` for continuity memory.

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

## Steam-Ready UX Direction

LoreKeeper should feel like a focused tabletop app, not a utilities dashboard.

- The front door should answer only three questions: continue hosting, start a new table, or join someone else's table.
- Provider/model setup should feel like AI readiness, not a core gameplay mode.
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

## Product UX/UI Redesign Audit

### Information Hierarchy

- Tier 1, always visible: story log, current table status, command input, current turn/active actor, minimal party ownership signal.
- Tier 2, contextual: party details, combat order, guest seating, table talk, active vote state, recovery actions.
- Tier 3, collapsed/drawer: world notes, player notes, people/places/things/threads, campaign library details, provider choices, invite link utilities.
- Tier 4, diagnostics only: raw provider text, JSON/import language, API/session identity, SQLite details, manual state sync, debug metadata, route/storage errors.

Permanent screen space should be reserved for play. The table should not ask players to visually parse campaign records, networking controls, diagnostics, and notes unless that information is part of the current moment.

### Screen Review

1. Front Door: improved, but still should eventually feel more like a game launcher with big Continue/New/Join affordances and AI readiness as secondary.
2. New Adventure: improved by using full-screen setup, but still reads like a form. It should evolve into an adventure-builder flow with sections for Premise, Hero, Party, Friends.
3. Join Flow: plain `/guest` is the right direction. The next UX step is a friendly table list plus seat cards, with direct links treated as shortcuts.
4. Main Table: highest debt. Story must dominate; rails should be notebook/party shelves, not dashboards. Current pass collapses notes by default and compacts party cards, but phase-specific table chrome is still needed.
5. Combat: mechanically stronger, but visually still too similar to roleplay. Combat should eventually emphasize initiative, current actor, available actions, visible rolls/effects, and clear end-turn flow.
6. Notes: should feel like a notebook/codex opened when needed. Current pass moves toward this by collapsing World and Player notes by default.
7. Preferences: still too much one-dialog surface. Split into App Preferences, Table Settings, AI Readiness, and Developer Tools.
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
9. AI readiness/provider setup still feels like configuration, not choosing a DM voice.
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
120. New campaign seed text no longer appears as the visible first DM bubble; the opening message now tells the host to Nudge the DM or type the first action.
121. First-pass Steam-ready wording made early front-door and preferences copy calmer, replacing more technical provider/SQLite/import wording in normal paths.
122. Starting a fresh local table session now resets stale remote runtime state: old connected/pending guests are disconnected, waiting-room records are closed, remote controllers are released, and open seats become requestable again instead of silently reviving old approvals.
123. Guest seating now updates live renderer session state, not only localStorage/snapshot state, and carries table/session identity forward so a seated guest does not see a "join first" command deck.
124. Character panel Auto-Complete now re-seeds generated pitch, look/vibe, party integration, and DM-note text from the current basics instead of only filling blanks and leaving stale generated flavor behind.
125. Create And Start no longer auto-runs the first DM generation; the host lands on a ready table with Nudge available, and waiting-guest cues refresh roughly once per second even while the DM is generating.
126. Product UX wording and hierarchy now push harder toward story-first table language: Continue/New Adventure/Find Table/Check AI, friend seats, seat requests, host review, Scratchpad, collapsed Player Notes, quieter rails, and a more dominant play log.
127. Product hierarchy now treats notes as a notebook shelf instead of a permanent open binder: World and Player notes are collapsed by default, party cards clamp long descriptive text until hover/focus, Table Talk is smaller, and the center story surface receives more default space.
128. The first visible silhouette pass removes the strongest developer-tool cues: the gridpaper background is gone from the main play surface, the front door now reads as a larger game-style launcher, side rails are narrower/translucent shelves, message bubbles are softer, and the command deck is less terminal-like.
129. Table shelf sizing is now user-adjustable and saved locally: left Party shelf, right Notebook shelf, World notes, Your Notes, and Table Talk can be dragged without opening settings. Expanded right-rail panels scroll inside their own bodies when content exceeds the chosen size. Party cards no longer expand on hover, so their action buttons stay reachable.
130. Use Anyway is now hard-blocked for DM responses that speak or act for controlled party members. Format/proposed-change weirdness can still be reviewed by the host, but controlled-character agency failures require Try Again or Details instead of becoming table text.
131. Host New pre-lobby waiting guests now show seat buttons for every open Invite Friend slot, even when the guest did not pick a specific character before asking to join.
132. Character Auto-Complete now behaves like a reroll for generated flavor: it preserves hard facts such as name, ancestry, class, and level, while rotating the pitch, party tie, and DM note on each click.
133. Preferences now open as calmer App, AI, Friends, and Troubleshooting tabs, with local-table tools, diagnostics, and DM recovery hidden until that section is chosen.
134. Settings entry points are now intent-aware: front-door Preferences opens App Preferences, Check AI opens the DM Voice surface, and the in-table gear opens Friends And Seats instead of app-level options.
135. The in-table settings gear is now a labeled Friends control, so normal play points hosts toward seating/share actions instead of generic configuration.
136. The front door now gives primary weight to Continue Adventure and Join A Table, with Check AI demoted to the lower utility strip so setup no longer reads as a third play mode.
137. Seat Guest now opens the Friends And Seats surface directly, so waiting-player prompts land on the relevant host action instead of a generic settings dialog.
138. The command deck now shows a compact Now/Next cue from `TableSessionEngine`, making the input area reflect roleplay, combat, waiting, review, or recovery state instead of looking identical in every phase.
139. The app shell now exposes `data-table-phase` and `data-table-tone`, giving the table screen a single phase hook for combat/recovery/waiting styling instead of scattered local flags.
140. The default action prompt is now campaign-neutral instead of heist-specific, so new tables do not inherit an unrelated tone from placeholder copy.
141. New tables now open with a clearer multi-line setup beat: location, seated party, premise, and a direct Next instruction to Nudge the DM or type the first action.
142. Table focus projection now lives in `app/table-focus-controller.js`, so phase-to-surface decisions are tested outside `app/app.js`; combat, party/waiting, and review states can visually elevate the right rail/section through a single `data-table-focus` hook.
143. Preferences now open as scoped surfaces: App Preferences shows only App/AI, AI Readiness shows AI/App, and in-table Friends And Seats shows only Friends/Troubleshooting instead of exposing every settings tab at once.
144. Settings surface mode/copy/tab visibility now lives in `app/settings-surface-controller.js` with direct tests, so future settings UX changes do not have to add more policy to `app/app.js`.
145. Start Adventure now has an in-wizard progress/error status and repeat-submit guard, so campaign creation failures no longer look like a dead button while the global table status is hidden.
146. Freshly created ready tables now expose a table-level Start Adventure action that runs a dedicated first-session opening narration prompt after the host finishes last-minute invites and party edits.
147. Friends And Seats now leads with the normal Guest Link/open/copy flow and tucks seat-link/check/collection controls under Table Options, reducing the old wall-of-settings feeling for host seating.
148. Start Adventure opening readiness, button state, and first-session prompt policy now live in `app/table-opening-controller.js` with direct tests instead of being renderer-owned string/visibility logic.
149. The front door now presents Continue Adventure, New Adventure, and Join A Table as three first-class launcher choices, with AI/preferences still demoted to utility actions.
150. Fresh-table Start Adventure now appears in the command deck next-step area instead of the status-strip action pile, making the first real table action harder to miss.
151. Normal DM Nudge prompt policy now lives in `app/dm-nudge-controller.js` with direct tests, reducing another renderer-owned table-flow instruction string.
152. Table action visibility for Nudge, Cancel DM Response, Start Adventure, Seat Guest, Review DM Response, Use Anyway, Try Again, and Read Latest now flows through `app/table-action-controller.js`, giving phase-aware CTAs one tested projection instead of scattered renderer functions.
153. Seat Guest and DM recovery actions now live in the command deck's current-action area beside Now/Next, while provider transport controls stay in the status strip.
154. The command input now consumes `TableSessionEngine` phase state, so DM-thinking, recovery, host-review, party-vote, waiting-guest, and guest-sent states show phase-aware placeholders and locking instead of generic disabled input.
155. Send-turn preflight policy now lives in `app/turn-submit-controller.js`, so busy/repair/empty-turn blocking copy is tested outside `app/app.js`.
156. Nudge DM and Start Adventure command gates now live beside the table action projection, so host/busy/opening-readiness checks are tested outside `app/app.js`.
157. Table phase focus now reaches the permanent rails: party, combat, notebook, and Table Talk receive tested primary/supporting/quiet states from `TableSessionEngine` projection, and provider-status changes repaint the composer so the Now/Next cue and input placeholder do not disagree.
158. Combat tracker now has an active-turn cue that names who controls the turn, what the table should do next, and the active actor's current legal actions from app-owned combat rules, making combat visually and functionally less like ordinary roleplay.
159. The manual copied-response fallback is now tucked behind a Copied DM Text disclosure with controller-owned copy/state, so DM Recovery leads with the table-check summary instead of a visible paste box.
160. Inspecting a paused DM response now opens a focused DM Recovery settings surface instead of the broader Troubleshooting drawer, with `settings-surface-controller.js` owning the one-tab recovery mode and target panel filtering.

### Still Risky

1. Combat resolution is still partly provider-led for improvised/richer actions and some manual import paths, though explicit legal-option mismatches, active-actor mismatches, and resolved-turn action economy are now app-owned.
2. `app/app.js` still owns too much orchestration around submit/import/recovery/combat/multiplayer, though turn repair display/use-anyway policy, staged input recovery decisions/failure wording, send-turn preflight, provider import outcome copy, latest-response import gating, provider review auto-commit policy, stale combat-prompt repair policy, scene import fallback policy, combat import fallback policies, core opening/nudge prompt policies, Nudge/Start command gates, and Nudge/table action visibility policy are now extracted.
3. Recovery is more table-shaped in the live status strip, retry lifecycle, review/use-anyway copy, Settings labels, hard-blocked agency failures, focused DM Recovery surface, host review summary, and copied-text fallback disclosure, but the underlying manual review textarea still exists as a rare fallback.
4. AI companion approval now has table-shaped Stage/Pass/Resolve Now language, and combat nudges are active-turn-only suggestions, but the flow still needs real combat playtest polish.
5. Party-vote collection now works for remote guests, clear leaders can be drafted by the host, and ties are visible. Final confirmation is still the normal Send Turn path rather than a dedicated modal.
6. Local multiplayer still needs longer two-machine soak testing.
7. Guest "sent / host received / resolving / resolved" state is clearer, but still needs two-machine soak testing.
8. Table Talk has a subtle unread cue, but should still be checked during two-machine play.
9. Provider narration can still restate the player's action or lean on option panels too much in real-model soak, though the contract now has stronger narration-first instructions.
10. Failed staged inputs now remain visible and can be dropped by the host, but broader retry/cleanup guidance still needs real-session polish.
11. Active campaign changes reset TurnFlow, but app-level helper state still coexists with engine state.
12. Rail containment is improved, but long-session scroll behavior still needs a real campaign soak with many party members, notes, and combatants.
13. Context retrieval now has scene-focus, noisy ranking, thousands-record load fixtures, bounded SQLite query helpers, and bounded play-log rendering; the app still needs to use the query helpers more broadly instead of hydrating whole snapshots everywhere.
14. Settings are still physically one dialog, but entry points now route to App Preferences, DM Voice, Friends And Seats, or Troubleshooting. App-level preferences and campaign/table settings still need a fuller split after the front-door shell stabilizes.
15. Pre-table guest lobby is improved for Host New drafts, but still needs live UX soak: guests can request and reserve Remote Invite seats before Create And Start, and the host can seat waiting guests from the draft lobby. Guests cannot yet edit their own character sheet in the shared draft lobby.
16. Player Notes are campaign-SQLite-backed for local/host continuity, but not yet a proper per-user private/shared notes model for multiplayer devices.
17. Campaign Notes are populated from campaign records, but extraction/retrieval quality still needs scenario testing to prove the right people, places, things, and threads appear at the right time.
18. The migration runner exists and blocks unsupported versions, but no historical upgrade steps exist yet because there is only one SQLite schema lineage in the repo.
19. TableSessionEngine is currently a projection layer. The status strip, diagnostics, command deck, command input, and table-focus hook now consume it, but more UI surfaces still need to consume it directly before the table fully stops combining local flags.
20. `app/app.js` and `scripts/serve.js` are better marked, but still large enough that future fixes can accidentally create hidden coupling if new decisions are added there.
21. `debugSnapshot` summarizes current runtime state, but it is not yet a persisted session recorder or replay tool.
22. Living-world memory now has projections, fixtures, relationship-state transitions, faction memory, and location-scar helpers, but provider output still needs real-model soak to prove it consistently creates useful relationship/consequence/faction/place updates.
23. World-memory helpers are in place, but scene-ending capture still depends on provider proposals and host review rather than an app-owned post-scene summarizer.
24. Guest-public routes are substantially covered, but every new multiplayer endpoint must keep proving whether it is a guest action or a host-authorized mutation; mixed-purpose routes are easy to get subtly wrong.
25. The app still has too many visible controls across table rails and campaign/table management. Preferences are calmer now via top-level tabs, but Steam-ready UX still needs fewer always-visible surfaces, clearer phase-specific actions, stronger empty-table guidance, and a fuller split between app preferences and table settings.

## Live Acceptance Matrix

| Table expectation | Status | Notes |
| --- | --- | --- |
| Player can tell whose turn it is. | Improved | Combat tracker and input placeholder cover basic cases. Long encounters need richer context. |
| Player can tell who controls each character. | Improved | Badges/actions exist. Language still needs user testing. |
| DM does not speak for controlled PCs. | Improved | Prompt, context, renderer recovery, suppression, and obvious output validation help. Needs broader scenario fixtures. |
| AI companions feel like party members. | Improved | Nudge flow, creation defaults, table-shaped Stage/Pass/Resolve Now language, and idle rarity/cooldown policy help. Combat-turn approval still needs polish. |
| DM can address party or specific party members. | Improved | Choice metadata supports party, character, subset, vote, and combat actor. Remote vote counters, tie language, and host draft action exist. |
| Guest players know whether input was sent/waiting/resolved. | Improved | Host/guest wording, message lifecycle, and faster waiting-room visibility are covered by tests/static guards. Needs two-machine soak. |
| Combat has one row per combatant. | Fixed | Grouped enemy expansion exists. |
| Combat rolls and HP changes are visible. | Improved | Mechanics rendering exists. Common app-owned combat actions now have fixtures. Richer spell/effect rules and live-play polish are still open. |
| DM can continue scenes without forcing options. | Improved | Prompt/choice suppression and rich full-turn fixtures now cover social, travel, mystery, downtime, combat, and recovery. Needs real-model soak for repeated turns. |
| DM has story beyond current scene. | Improved | Hidden arcs exist, are private, and have non-leakage fixtures. Still needs pacing/adaptation scenario testing over longer sessions. |
| Notes support table memory. | Improved | Campaign Notes and Player Notes are split. Player Notes are now campaign-backed local scratch space, but not yet a full per-user shared/private notes model. |
| Recovery after provider failure is understandable. | Improved | Player echoes, staged inputs, retry bubbles, table-facing labels, and session `Next:` guidance show lifecycle. Manual review still needs a less developer-shaped surface. |
| Character creation is consistent. | Fixed | Shared compact auto-complete and controller defaults are in place; Auto-Complete preserves hard facts while refreshing generated character flavor. |

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
8. Replace the remaining manual review textarea escape hatch with a fuller guided host review flow. Current state: repair summary guidance exists before a collapsed Copied DM Text fallback, fallback copy/state lives in the host response review controller, and Inspect opens a focused DM Recovery surface instead of broad Troubleshooting.
9. Run the two-machine playtest checklist and log every friction point.
10. Soak-test guest-side "sent / host received / resolving / resolved" state on two machines.
11. Soak-test host-side "guest is waiting on you" affordance on two machines.
12. Soak-test clicked desktop invite links across fresh guest machine, guest reconnect, host campaign switch, combat, and new campaign/table flows.
13. Continue tuning agency validation against real play logs; neutral presence and accidental host-name mentions now have fixtures, but broader phrasing still needs soak.
14. Keep the Maintainer Guide current whenever a new subsystem or debugging path is added.
15. Simplify app UX toward release quality: split Preferences/Table Settings, hide troubleshooting until needed, reduce always-visible rail controls, make empty-table states more inviting, and make the front door feel like a game launcher instead of a settings hub. Current state: front-door AI readiness is now secondary, table-facing copy and visual hierarchy are improved, but the table still exposes too many knobs for Steam-ready flow.

### Medium

14. Make scene tension, consequences, and optional hidden-story debug summaries more visible in Settings/diagnostics, not live play.
15. Add curated regression campaigns for social negotiation, wilderness travel, mystery, downtime, and combat.
16. Tighten prompts so normal scene turns can be rich without always forcing choices, then validate with repeated real-model turns.
17. Continue combat tracker density work: concentration, richer resources, reactions, conditions, movement, action state.
18. Continue expanding route-level API/security tests as new routes are added; current coverage includes classification, API-token protection, stale identity rejection, local asset blocking, and real mutation routes.
19. Wire bounded SQLite query helpers into more live surfaces and eventually upgrade the play log from chunked rendering to true virtualization if needed.

### Low

18. Replace remaining overly specific placeholder text with neutral table examples. Current state: the main command deck fallback is now campaign-neutral; secondary placeholders still need occasional review as screens evolve.
19. Add pre-table guest lobby: read-only campaign/party setup for guests, editable own character only, clear ready state.
20. Continue improving campaign-aware character auto-complete quality; current behavior preserves supplied hard facts while letting the button regenerate derived pitch/integration text from party theme, premise, and existing characters.
21. Add explicit party-template flow for "four dwarf soldiers" or "heist crew."
22. Add fuller backup/export/restore affordances before release; delete now recycles local SQLite files, but there is not yet a restore UI.

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
- [ ] Move remaining recovery/import decisions out of `app/app.js`. Current state: turn repair display/use-anyway policy, staged input recovery decisions/failure wording, send-turn preflight, provider import outcome copy, latest-response import gating, provider review auto-commit policy, stale combat-prompt repair policy, scene import fallback policy, combat import fallback policies, copied-response fallback copy/state, core opening/nudge prompt policies, Nudge/Start command gates, and Nudge/table action visibility policy are extracted; broader provider/import orchestration remains.
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

### Party Agency And AI Companions

- [x] First campaign character is host-controlled.
- [x] Additional created characters default to AI companions.
- [x] AI companion cards use Nudge, not Play.
- [x] Nudge prompts ask for brief low-stakes RP only.
- [x] Choice prompts can target individual party members.
- [x] Make AI companion suggestions appear as approve/resolve/decline table beats.
- [x] Add idle companion interjection rules with cooldown/rarity so they feel alive but not noisy.
- [x] Add fixtures for host-controlled, remote-controlled, unassigned, and AI companion agency boundaries.
- [ ] Tune agency validation against real play logs so it catches overreach without blocking neutral presence/staging narration. Current state: neutral presence, hostile focus, host-name-as-object, remote-PC body-language overreach, and "doesn't back down" resolve-overreach fixtures are covered.
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
- [x] Fresh local table sessions do not silently revive old approved guests from a previous session.
- [x] Waiting-room seating updates live guest session state so the guest composer and send path agree with the visible "seated as" state.
- [x] Normal Guest Links use plain `/guest`; actions/snapshots still validate campaign/table/session identity after registration.
- [x] Guest snapshots and staged actions reject wrong campaign/table/session identity when supplied.
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
- [ ] Build shared pre-table lobby for invited players with read-only campaign/party state and editable own character.
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
- [x] Main menu separates Host, Join, and Provider Setup from the in-campaign rails.
- [x] Main menu hides last-table rails, notes, and command input until a flow is chosen.
- [x] Host on the main menu opens a selected campaign instead of implicitly resuming the last active campaign.
- [x] Join setup hides table rails and command input until connected to a host table.
- [x] Campaign/table view can return to the main menu without closing the app.
- [ ] Split settings into App Preferences and Campaign Settings as separate surfaces. Current state: the shared dialog now uses a tested `settings-surface-controller` for mode-scoped App/AI/Table/Troubleshooting surfaces that hide irrelevant tabs per entry point, but it is not yet physically separate full screens.
- [x] Rename first-pass technical UI language so normal users see Host/Join/AI/Guests/Troubleshooting instead of provider/SQLite/import/control-panel wording.
- [x] Reduce visible Preferences controls to App, AI, Friends, and Troubleshooting tabs, with diagnostics/recovery hidden unless troubleshooting is chosen.
- [ ] Rework the table screen into phase-aware action surfaces so users see what matters now instead of every system at once. Current state: the command deck now shows a TableSessionEngine-driven Now/Next cue, fresh-table Start Adventure, Seat Guest, and DM recovery actions live beside that cue, `app/table-action-controller.js` owns the main table CTA visibility policy, `app/table-focus-controller.js` maps phase to the surface that deserves attention, and the shell exposes `data-table-phase`/`data-table-focus`; the party, combat, notebook, and Table Talk rails now receive tested primary/supporting/quiet focus states, provider-status updates repaint the composer to keep phase copy aligned, combat has an active-turn cue with controller responsibility plus legal actions, and Inspect opens a focused recovery settings surface. Deeper combat action workflows and broader settings split work still need phase-specific behavior.
- [x] Make the front door feel closer to a game launcher: recent campaign, new table, join table, AI readiness, and no hidden last-table background. Current state: the primary grid now presents Continue Adventure, New Adventure, and Join A Table as first-class choices, with Check AI and Preferences in the lower utility strip.
- [x] Bound initial play-log rendering and keep older transcript entries reachable with Show Earlier.
- [ ] Soak-test scroll behavior during long sessions.
- [x] Keep debug/repair tools tucked away unless action is required.
- [ ] Consider context-sensitive note sections or tabs after playtest.
- [x] Persist Player Notes to campaign SQLite or an explicit per-user notes store before relying on them for long campaigns.
- [x] Make Table Talk harder to miss without making it noisy.
- [x] Keep the left rail stable when party cards and combat rows have long names/actions.

### Storage, Diagnostics, And Safety

- [x] SQLite is the canonical campaign store.
- [x] Errors table records provider/session diagnostics.
- [x] Ollama context cache is campaign/model/mode scoped and non-canon.
- [x] Diagnostics can show recent errors and session health.
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
- 2026-06-15: The DM should be able to target individual party members or the whole party, and party votes should become an actual table flow with host tie-breaks. Current state: targeting, votes, counters, and host draft action exist; two-machine feel testing remains.
- 2026-06-15: AI companions should occasionally feel alive with brief unprompted contributions, but not every response cycle and not for major decisions. Current state: idle companion interjections are rarity/cooldown gated in the provider request.
- 2026-06-15: App-owned combat resolution now covers DC checks and opposed contests. Current state: saves/spells/enemy-turn bounding and one-actor response validation have coverage; broader app-owned combat resolution remains open.
- 2026-06-16: Player Notes should not remain only local device state if they become part of long-campaign play. Decide whether they are per-user private notes, host-visible table notes, or both.
- 2026-06-16: Pre-table guest seating now has a draft table/session identity and is published to the normal `/guest` page while Host New is open. Hosts can reserve a requested seat before launch. Remaining work: guest-editable character draft state and live local-browser soak.
- 2026-06-16: Remote party-choice voting is now usable, but host resolution should become more explicit than "read the counters and send the choice." Current state: leading vote can draft the host action; a dedicated confirmation flow may still be smoother.
- 2026-06-16: Next local playtest target should be host app plus local browser guest through `/guest`: join waiting room, seat request, party vote, guest leave/rejoin, one combat turn, and one provider recovery.

## How To Use This Doc

1. Start here before continuing broad polish work.
2. Pick the highest-priority unchecked item that matches the current pain.
3. Keep changes small enough to test and commit cleanly.
4. When a new issue is noticed during play, add it to New Notes Inbox first.
5. When fixed or clarified, move it into the appropriate checklist section and update status.
6. Keep older docs as reference, but let this doc be the current steering wheel.
