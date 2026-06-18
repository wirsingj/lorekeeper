# LoreKeeper Maintainer Guide

Updated: 2026-06-18

Start with:

- `docs/state-of-the-table.md`: current product state, priorities, and checklist.
- `docs/ARCHITECTURE.md`: durable ownership boundaries and important files.
- `docs/living-world.md`: world-memory and goal-horizon model.

This guide is the practical "what do I run and where do I look?" map.

## Daily Commands

```powershell
npm run dev
npm run build
npm test
```

Focused checks:

```powershell
npm run test:engine
npm run test:contract
npm run test:multiplayer
npm run test:storage
npm run test:security
npm run test:regression
npm run test:observability
npm run test:all
```

Internal harnesses:

```powershell
npm run inspect:diagnostics -- --limit 20
npm run inspect:diagnostics -- --sqlite data/campaigns/ruined-shrine-628.lorekeeper.sqlite --limit 20
npm run test:ui
npm run test:ui -- --scenario visual-audit-screenshots
npm run test:ui -- --scenario table-talk-posts-immediately
npm run test:ui -- --chaos-only --chaos-runs 3 --seed chaos-edge-batch
npm run test:ui -- --chaos --chaos-runs 3 --seed full-table-shake
```

`test:ui` uses Playwright and is intentionally opt-in. If Chromium is not installed locally, run `npx playwright install chromium`. It builds the app before running unless `--skip-build` is supplied, starts its own temporary server, uses a temporary campaign root, and cleans up test campaign SQLite files after successful scenarios. Failed runs keep screenshots, HTML, renderer diagnostics, and server output under `data/runtime/ui-flow-artifacts/`. The `visual-audit-screenshots` scenario also writes successful screenshots under `data/runtime/ui-flow-artifacts/<timestamp>/visual-audit/` for home, App Preferences, New Adventure, ready table, Friends and Seats, `/guest`, combat, and DM Recovery states.

The default run covers scenario permutations for home load, settings tabs, pre-lobby party setup, binder party creation, campaign creation, RP posts, choice buttons, real Ollama contract parsing on a quick installed model, combat turn flow, Start Adventure visibility and pre-opening action gates, Table Talk posting, and remote guest browser-tab flows. Chaos mode adds seeded desktop/tabletop permutations for delayed DM generation, Table Talk during generation, cancel/retry, dialogs, pre-lobby Add Crew uniqueness, pre-opening Nudge/Send locks, AI companion combat locks, app-owned combat turns, and common buttons. Narrow/mobile chaos is opt-in with `--mobile-chaos`; desktop/tabletop is the primary target. These are hidden/internal harnesses for maintainers and agents; do not turn them into visible player controls.

Desktop:

```powershell
npm run desktop
```

Local server only:

```powershell
npm run api
```

Cleanup stuck local processes:

```powershell
npm run cleanup
```

## Important Files

- Shell/layout: `app/App.jsx`, `app/styles.css`
- Renderer orchestration: `app/app.js`
- Local server/routes: `scripts/serve.js`
- Table phase projection: `src/engine/table-session-engine.js`
- Copyable debug summary: `src/engine/table-debug-snapshot.js`
- Internal trace helper: `src/observability/trace-log.js`
- Diagnostics inspector: `scripts/inspect-diagnostics.js`
- UI flow scenario harness: `scripts/test-ui-flow.js`
- Living world continuity: `src/engine/living-world-engine.js`, `docs/living-world.md`
- Turn lifecycle: `src/engine/turn-engine.js`, `app/turn-flow-runtime.js`
- Provider orchestration: `src/engine/provider-orchestrator.js`, `src/ai/provider-service.js`
- Provider contract/agency: `src/model-contract/turn-json-contract.js`
- Combat authority: `src/engine/combat-engine.js`, `src/rules/combat-turns.js`
- Multiplayer authority: `src/multiplayer/local-table.js`
- Guest auto-resolution policy: `app/guest-auto-resolve-controller.js`
- Campaign adoption/polling policy: `app/campaign-adoption-controller.js`, `app/table-background-polling-controller.js`
- SQLite/repository: `src/storage/sqlite-store.js`, `src/storage/campaign-repository.js`, `src/storage/sqlite-migrations.js`
- Recovery/import projections: `app/provider-import-controller.js`, `app/turn-repair-controller.js`, `app/staged-input-recovery-controller.js`
- Play log projection: `app/play-log-controller.js`

## Do Not Grow These Files

- `app/app.js`: still wires DOM, turns, provider calls, recovery, multiplayer, rendering. Extract pure decisions to `app/*controller.js` or `src/engine/*`.
- `scripts/serve.js`: still mixes routing, auth, campaign repository calls, provider streaming, and multiplayer mutations. Extract route modules or a future `MultiplayerSessionEngine`.

Add logic here only when it is truly glue. If a branch answers "should this happen?", it probably belongs in a small tested module.

## Debug Snapshot

Diagnostics include `debugSnapshot`, built by `src/engine/table-debug-snapshot.js`.

Use Settings -> Table Diagnostics -> Copy Details, or call:

```text
GET /api/diagnostics?full=1
```

Look for:

- `identity.campaignId`, `identity.tableId`, `identity.sessionId`
- `mode.phase`, `mode.expectedActor`, `mode.nextStep`
- `turn.id`, `turn.activeActorId`, `turn.controller`
- `provider.state`, `provider.phase`, `provider.text`
- `combat.currentTurnId`, `combat.round`
- `multiplayer.stagedGuestInputs`
- `review.pendingChanges`
- `recovery.reason`
- `lastErrors`

If a table feels haunted, copy this blob first.

## Internal Harnesses

Hidden runtime hooks:

- Server trace: `GET /api/diagnostics/trace?full=1`
- Clear server trace: `POST /api/diagnostics/trace/clear`
- Renderer hook: `window.__lorekeeperDebug`
- Diagnostics bundle: `GET /api/diagnostics?full=1`

The server trace captures API request timing/status plus provider request/response lifecycle events, including prompt previews, response previews, parse/validation outcomes, and repair attempts. It is auth-protected when the local API token is enabled and should remain internal.

CLI inspection:

```powershell
npm run inspect:diagnostics -- --limit 20
```

Use this to inspect the active campaign SQLite for recent errors, provider runs/events, and recent messages without opening the app.

UI scenario inspection:

```powershell
npm run test:ui
npm run test:ui -- --scenario create-campaign-and-hide-start-adventure-after-use
```

The Playwright harness starts its own temporary server and campaign directory. It can open multiple pages in one browser context, so host and `/guest` tabs share the same local server while preserving separate renderer/session state. It mocks provider generation inside scenarios that need deterministic DM output with a persistent page route, and keeps one real Ollama provider-contract scenario to catch parser drift against an installed quick model. Use `--keep-temp` only when intentionally preserving a failed temp campaign root for inspection.

Real multiplayer QA should model the intended release shape: one provider-hosting authority, often the Electron desktop app with Ollama/provider configured, plus guests using `http://<host-ip>:4173/guest` in a browser or another desktop install. "Host" means table/provider authority, not necessarily the only machine running the app.

## Debugging Owners

Provider output:

- Start with `debugSnapshot.provider` and `lastErrors`.
- Inspect `src/model-contract/turn-json-contract.js`.
- Inspect `app/provider-import-controller.js` for import/auto-commit decisions.
- Run `npm run test:contract` and `npm run test:regression`.

Turn flow:

- Start with `debugSnapshot.mode`, `turn`, and `recovery`.
- Inspect `src/engine/table-session-engine.js`, `src/engine/turn-engine.js`, `app/turn-flow-runtime.js`.
- Run `npm run test:engine`.

Combat:

- Start with `debugSnapshot.combat` and `turn.activeActorId`.
- Inspect `src/engine/combat-engine.js`, `src/rules/combat-turns.js`, `app/combat-resolution-controller.js`.
- Run `npm run test:engine` and `npm run test:regression`.

Multiplayer:

- Start with `debugSnapshot.identity` and `multiplayer`.
- Inspect `src/multiplayer/local-table.js` first, then route glue in `scripts/serve.js`.
- Run `npm run test:multiplayer`, `npm run test:security`, and `npm run test:regression`.

SQLite/storage:

- Start with `/api/diagnostics?full=1`, campaign path, and `lastErrors`.
- Inspect `src/storage/campaign-repository.js`, `src/storage/sqlite-store.js`, `src/storage/sqlite-migrations.js`.
- Run `npm run test:storage`.

Recovery state:

- Start with `debugSnapshot.recovery`, `review`, and `lastErrors`.
- Inspect `app/turn-repair-controller.js`, `app/staged-input-recovery-controller.js`, `app/host-response-review-controller.js`.
- Run `npm run test:engine` and `npm run test:regression`.

## Failure Playbooks

### Stuck DM Generation

Symptoms:

- Status says DM is resolving for too long.
- Send button stays locked.
- Provider status is `working`, `retrying_dm`, or timeout-like.

Likely owner:

- `src/engine/provider-orchestrator.js`
- `src/ai/provider-service.js`
- `scripts/serve.js` provider streaming route

Inspect:

- `debugSnapshot.provider`
- `lastErrors` for `provider_generation_failed`
- `data/launcher.log`, `data/electron.log`

Run:

```powershell
npm run test:engine
npm run test:contract
npm run test:regression
```

Common fix direction:

- Ensure stale/cancelled provider responses do not settle the current turn.
- Preserve staged guest input on failure.
- Keep timeout/retry wording in recovery controllers, not scattered UI branches.

### Provider Output Rejected

Symptoms:

- Review DM Response appears.
- Try Again, Details, or Use Anyway is shown.
- Rich response exists but did not apply.

Likely owner:

- `src/model-contract/turn-json-contract.js`
- `app/provider-import-controller.js`
- `app/turn-repair-controller.js`

Inspect:

- `debugSnapshot.recovery`
- `lastErrors` parse/validation errors
- raw details only after reading table-facing summary

Run:

```powershell
npm run test:contract
npm run test:regression
```

Common fix direction:

- Add or tighten fixtures before changing prompts.
- Preserve app authority: reject bad output without mutating state.
- Improve repair/readability only after validation is safe.

### Guest Cannot Join

Symptoms:

- Guest waiting room shows empty/stale table.
- Host does not see waiting guest.
- Guest gets a vague rejection.

Likely owner:

- `src/multiplayer/local-table.js`
- `scripts/serve.js` multiplayer routes
- `app/multiplayer-session-panel.js`

Inspect:

- `debugSnapshot.identity`
- local table `campaignId`, `tableId`, `sessionId`
- guest URL and waiting-room status

Run:

```powershell
npm run test:multiplayer
npm run test:security
npm run test:regression
```

Common fix direction:

- Validate explicit campaign/table/session identity.
- Prefer `/guest` waiting room over fixed join-as links for normal flow.
- Do not let stale sessions silently attach to the active campaign.

### Guest Action Not Resolving

Symptoms:

- Guest sees sent/waiting forever.
- Host sees staged input but Send Turn is confusing.
- Input disappears after failed DM generation.

Likely owner:

- `src/multiplayer/local-table.js`
- `app/staged-input-recovery-controller.js`
- `src/engine/table-session-engine.js`

Inspect:

- `debugSnapshot.multiplayer.stagedGuestInputs`
- `mode.phase` and `mode.nextStep`
- pending input disposition in play log

Run:

```powershell
npm run test:multiplayer
npm run test:engine
npm run test:regression
```

Common fix direction:

- Keep failed inputs staged unless a DM response actually imported.
- Ensure host approval/group-turn settings are reflected in the table phase.
- Drop stale input explicitly, never as fake DM resolution.

### Combat Turn Stuck

Symptoms:

- Combat tracker waits on wrong actor.
- Send button is locked on a party turn.
- DM narration says combat advanced but initiative did not.

Likely owner:

- `src/engine/combat-engine.js`
- `app/combat-resolution-controller.js`
- `src/model-contract/turn-json-contract.js`

Inspect:

- `debugSnapshot.combat.currentTurnId`
- `debugSnapshot.turn.activeActorId`
- latest provider validation errors

Run:

```powershell
npm run test:engine
npm run test:contract
npm run test:regression
```

Common fix direction:

- Combat advances through app-owned mechanics, not narration alone.
- Provider must resolve only the active actor.
- AI companion combat nudges are suggestions until host-approved.

### Character Agency Rejection

Symptoms:

- DM response is rejected because it spoke or acted for a PC.
- Remote/host character appears to act without submitted input.

Likely owner:

- `src/model-contract/turn-json-contract.js`
- `src/engine/agency-controller.js`

Inspect:

- controlled party members in request context
- `user.playerInputs`
- validation error text

Run:

```powershell
npm run test:contract
npm run test:regression
```

Common fix direction:

- Add a fixture for the phrase that slipped through or was over-blocked.
- Allow neutral presence/staging.
- Reject speech, thoughts, resolve, body language, scanning, movement, and purposeful action for controlled PCs without submitted input.

### Campaign Load/Save Issue

Symptoms:

- Campaign opens wrong table.
- Save appears lost.
- Deleted campaign vanished unexpectedly.
- Old campaign cannot load.

Likely owner:

- `src/storage/campaign-repository.js`
- `src/storage/sqlite-store.js`
- `src/storage/sqlite-migrations.js`
- `scripts/serve.js` campaign routes

Inspect:

- `/api/diagnostics?full=1`
- `identity.campaignId`
- `activeCampaign.sqlitePath`
- `data/campaigns/.deleted`

Run:

```powershell
npm run test:storage
npm run test:security
npm run test:regression
```

Common fix direction:

- Keep SQLite as canon.
- Add migration steps for any schema change.
- Do not hard-delete campaign files; recycle first.
- Reset active runtime state when switching campaigns.
