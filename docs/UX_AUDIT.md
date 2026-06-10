# UX Audit

## Product Frame

Lorekeeper should feel like a campaign binder for D&D-style AI play.

The core promise is not "chat with an AI." The promise is:

- start or import a campaign
- keep canon, party state, places, items, quests, relationships, and combat state organized
- use a provider as the sidecar model engine
- review changes before they become canon
- preserve the campaign in a local SQLite file

## Current Usability Findings

### Good Shape

- The handheld shell gives the app a memorable mental model.
- Lorekeeper-owned input is the right primary interaction.
- The central play screen makes provider output feel mirrored into the campaign device.
- Side panels match the binder idea: party/status on one side, canon/state on the other.

### Problems Fixed In This Pass

- The page was too tall and hid the input below the fold.
- Manual fallback had no clear place to paste provider responses.
- Provider update JSON had no visible extraction/review path.
- New-campaign and imported-campaign modes were not visible in the UI.

### Remaining UX Gaps

- The Firefox bridge is still separate from the local app shell.
- Approved review changes are staged in UI, not committed back to SQLite yet.
- New campaign creation in the app is in-memory; it should write a real local SQLite file.
- Imported document/image onboarding needs a real guided flow.
- The right rail is dense and needs tabs or collapsible binder sections as state grows.
- Provider response display should support richer formatting than plain text.

## Recommended Next Steps

1. Connect the local app `Build Turn` flow to the Firefox provider bridge.
2. Add `Import Latest Response` from the bridge into the app shell.
3. Commit approved review changes into SQLite.
4. Add a first-run campaign wizard for scratch campaigns.
5. Add an import wizard for folders of docs/images.
6. Replace the right rail with binder tabs: People, Places, Inventory, Quests, Combat, Review.
7. Add persistent session transcript storage.

