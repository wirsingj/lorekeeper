# Provider UI Bridge

Lorekeeper uses supported provider web UIs as visible AI execution surfaces. The MVP must not require
provider API keys.

ChatGPT, Claude, and similar provider tabs are treated as places where the model runs. Lorekeeper
remains the local campaign app that builds prompts, imports responses, and manages canon.

## Core Behavior

1. User explicitly selects or saves a supported provider tab as the campaign companion.
2. Lorekeeper builds a prompt from campaign state.
3. Lorekeeper inserts the prompt into the visible provider input.
4. Lorekeeper submits the prompt.
5. Lorekeeper detects generation in progress.
6. Lorekeeper detects completion.
7. Lorekeeper reads the latest assistant response.
8. Lorekeeper imports the response for review and state extraction.

## Firefox Headless Bridge Shape

For Firefox, Lorekeeper runs as the local app while a headless WebExtension bridges to ChatGPT in a
logged-in provider tab.

The bridge uses:

- a content script on `https://chatgpt.com/*` and `https://chat.openai.com/*`
- a local-app content script on `localhost` / `127.0.0.1` to relay app requests to the extension
- tab discovery in the background script
- tab-scoped messages from the local app to the ChatGPT content script
- a saved companion session in extension local storage

This keeps ChatGPT visible and user-controlled while Lorekeeper handles campaign state, prompts,
review, and storage.

## Campaign Provider Conversation Contract

Lorekeeper should prefer a saved provider conversation for a campaign/provider pair, not one global
ChatGPT scratch chat. For ChatGPT, the default project hint is `LoreKeeper`. A local campaign can
have one or more provider conversations over time:

- `Campaign Name [campaignid-01]`
- `Campaign Name [campaignid-02]`
- later chats used after the provider context grows stale or too large

The active provider conversation id, provider title, provider URL, project hint, and conversation
hint are stored in the campaign SQLite file under `providerSettings`.

When a turn is submitted from Lorekeeper:

1. The app asks the extension for the active campaign provider conversation.
2. The extension reuses the saved browser surface if it still exists.
3. If the saved browser surface is gone, the extension prefers an existing ChatGPT conversation that
   visibly matches the campaign conversation hint, campaign title, or campaign id.
4. A matching `LoreKeeper` project alone is not enough to reuse a conversation, because several
   campaigns may live in that project.
5. If no suitable campaign conversation exists, the extension opens ChatGPT, preferring a detected
   `LoreKeeper` project URL when possible.
6. If the provider is logged out or the prompt input is unavailable, the extension reports
   `loginRequired` and Lorekeeper waits for user action.
7. If the prompt input is available, the extension sends the prompt, waits for a stable assistant
   response, returns focus to Lorekeeper, and gives the response text back to the app.

Lorekeeper never handles provider credentials. Login, account selection, project selection,
subscription prompts, and provider-side consent stay in the provider UI.

## Adapter Responsibilities

Each provider adapter should:

- detect supported provider tabs
- locate the input box
- insert prompt text
- submit the prompt
- detect generation in progress
- detect completion
- read the latest assistant response
- report failures clearly

Adapters should be isolated because provider DOMs will change.

## Manual Fallback

If DOM automation fails, Lorekeeper should still support:

- copy prompt button
- import latest copied response button
- manual paste into provider
- manual copy from provider

This workflow also provides a safer first implementation before automated send/wait/import is ready.

## Security And Privacy Boundaries

- Never read credentials.
- Never bypass login, subscriptions, paywalls, or provider access controls.
- Never access unrelated tabs.
- Require explicit provider tab selection before treating a tab as the saved companion.
- Store campaign data locally.
- Make automation visible, pauseable, and easy to stop.
- Report provider UI failures clearly.

## Consent And Enablement

Lorekeeper can automate a chosen provider tab after the user enables it, but that enablement must be
obvious and reversible. The user should always be able to pause or stop an automation run.
