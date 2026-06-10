# Extension

Lorekeeper's extension layer hosts the campaign framework UI and connects to provider web UIs as
sidecars.

The first target is Firefox:

- `firefox/manifest.json`: Firefox WebExtension scaffold using `sidebar_action`.
- `firefox/sidebar/`: sidebar UI for selecting a logged-in ChatGPT tab and moving prompts/responses.
- `firefox/background.js`: tab discovery and message routing.
- `firefox/content-scripts/chatgpt-bridge.js`: ChatGPT DOM bridge content script.

Current bridge behavior is intentionally conservative:

- detect logged-in ChatGPT tabs
- check whether the prompt input exists
- insert a Lorekeeper prompt into the ChatGPT input
- read the latest visible assistant response

Auto-submit should remain an explicit later setting because it sends data to the provider.

## Local Firefox Loading

For development, open Firefox and load `extension/firefox/manifest.json` as a temporary extension
from `about:debugging#/runtime/this-firefox`.
