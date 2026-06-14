# Stability Pass

## 2026-06-13 Slow Stability Pass

Scope: stop feature expansion and harden current user-visible flows around clipboard, invite links, provider lifecycle, campaign switching, thin client packaging, and host/guest state.

### Flows Reviewed

- Desktop clipboard write paths: invite links, provider prompt copy, diagnostics copy.
- Desktop clipboard read path: manual provider response paste.
- Invite generation fallback: link is generated before clipboard copy is attempted, stored in the Local Table panel, and selected if clipboard copy is blocked.
- Campaign switching while provider generation is active.
- Turn runtime reset behavior after campaign changes.
- Local table projection when started, stopped, and when guest mode is active.
- Thin client package build after Electron/preload changes.

### Bugs Fixed

- Clipboard permission denial could make a successful join-as invite look failed. Clipboard write now tries Electron IPC first, browser clipboard second, and leaves a visible copyable invite link when both are blocked.
- Browser-only clipboard paste was another Electron permission mismatch. Manual response paste now tries Electron IPC first with browser fallback.
- Switching campaigns during active provider generation could leave the old generation alive and eligible to import into the newly selected campaign. Campaign changes now reset the turn runtime and cancel active provider work.
- Late provider completions after reset are ignored by turn id/request id instead of reviving stale UI state.

### Tests Added

- Electron-first clipboard write succeeds without browser clipboard.
- Clipboard write falls back to browser when Electron IPC is unavailable.
- Clipboard write blocked state returns a non-throwing failure.
- Electron-first clipboard read succeeds without browser clipboard.
- Clipboard read falls back to browser when Electron IPC is unavailable.
- Clipboard read blocked state returns a non-throwing failure.
- Turn runtime reset cancels active provider work.
- Late provider completion after reset cannot mutate the current turn state.
- Local table stopped projection disables Stop/Resolve controls.

### Manual Verification Notes

- `npm test` passed.
- `npm run build` passed.
- `npm run package:thin` passed.
- The latest ThinLoreKeeper zip should be rebuilt any time `app/`, `electron/`, or shared runtime code changes.

### Remaining Suspicious Areas

- `app/app.js` still owns too much UI orchestration. Continue extracting small, testable helpers rather than adding booleans.
- Provider response import remains a high-risk path because it combines parsing, review, auto-commit, chat rendering, and runtime state updates.
- Local table host/guest networking needs real two-machine manual validation; unit tests cover protocol/state, not Windows firewall or LAN discovery.
- Modal focus and native clipboard behavior should be checked manually in packaged Electron, not only Vite/browser mode.

## 2026-06-14 Focused Overnight Hardening

Scope: fix the highest-risk stuck-turn path and improve scene-aware provider context without adding new user-facing surface area.

### Findings

- Turn cancellation still depended on a provider abort event to fully unwind the active generation. If the provider, fetch stream, or abort event stalled, the UI could remain in a resolving state with Send/Nudge disabled.
- Cancelled provider requests were not remembered as explicitly ignored request ids, so a late completion from a locally cancelled request could still be routed through the generic provider-event path.
- Scene retrieval existed, but provider requests did not yet include a compact app-owned scene intent packet with escalation policy, ownership boundaries, and consequence-first guidance.
- Context packs could emit `active_consequences`, but the JSON request validator did not list that section kind as allowed. That mismatch made the contract more brittle than the runtime.

### Fixes

- `TurnFlowRuntime.cancelGeneration()` is now locally authoritative: it clears `activeRun`, cancels the provider if possible, transitions back to a safe input state immediately, and ignores late provider events for the cancelled request id.
- Provider requests now include `sceneIntent` and `escalationPolicy`, derived from `SceneEngine`, so local models receive clear guidance about whether to let a scene breathe, apply soft consequence pressure, or resolve combat.
- Context packs now include escalation guidance inside the Current Scene section and use a clean ASCII truncation marker.
- The request validator now accepts the `active_consequences` context section emitted by the app.

### Tests Added

- Cancel recovers the UI before provider abort resolves.
- A provider completion from a cancelled request cannot change the turn state.
- Cancel recovers even when the provider never emits an abort/cancel event.
- Scene intent discourages random escalation after a small fight and steers the provider toward consequences.
- Provider task requests include scene intent and escalation policy.
- `active_consequences` context sections validate successfully in turn request envelopes.
