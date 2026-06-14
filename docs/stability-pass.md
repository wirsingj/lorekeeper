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
