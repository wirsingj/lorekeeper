# Firefox ChatGPT Sidecar

Lorekeeper can integrate with ChatGPT as a sidecar in Firefox.

The intended shape:

1. User opens Firefox and logs into ChatGPT normally.
2. User loads the Lorekeeper Firefox extension.
3. User opens the local Lorekeeper app.
4. Lorekeeper uses the headless extension bridge to find or open campaign ChatGPT tabs.
5. Lorekeeper inserts prompts into the visible ChatGPT UI.
6. User reviews and submits, or later enables explicit auto-submit.
7. Lorekeeper reads the latest visible assistant response.
8. Lorekeeper proposes canon updates for user review before saving to SQLite.

## Current Scaffold

The Firefox extension scaffold lives in `extension/firefox`.

It currently supports:

- finding open ChatGPT tabs
- checking whether the ChatGPT prompt input is visible
- inserting prompt text into ChatGPT
- explicitly sending a prompt and waiting for the latest response
- reading the latest visible assistant response

Auto-submit should remain attached to an explicit user action because it sends campaign context to
the provider. The local app exposes this through its turn controls and setup dialog; the extension
does not present its own UI.

## Development Loading

In Firefox:

1. Open `about:debugging#/runtime/this-firefox`.
2. Click `Load Temporary Add-on...`.
3. Select `extension/firefox/manifest.json`.
4. Open the local Lorekeeper app.
5. Open or select a logged-in ChatGPT tab from Lorekeeper's setup dialog.

## Boundaries

- Only support selected provider tabs.
- Do not scrape credentials.
- Do not bypass login, subscriptions, paywalls, or provider controls.
- Keep automation visible and stoppable.
- Treat provider DOM selectors as brittle adapter code.
