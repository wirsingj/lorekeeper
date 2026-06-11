# Extension

Lorekeeper's extension layer is a headless bridge between the local Lorekeeper app and provider web
UIs. The campaign UI lives in the local React/Vite app; the extension should not present a sidebar
or second control surface during normal play.

The first target is Firefox:

- `firefox/manifest.json`: Firefox WebExtension scaffold for the headless bridge.
- `firefox/background.js`: tab discovery and message routing.
- `firefox/content-scripts/chatgpt-bridge.js`: ChatGPT DOM bridge content script.
- `firefox/content-scripts/lorekeeper-app-bridge.js`: local app to extension relay.

Current bridge behavior is intentionally conservative:

- detect logged-in ChatGPT tabs
- check whether the prompt input exists
- insert a Lorekeeper prompt into the ChatGPT input
- read the latest visible assistant response
- save one ChatGPT tab as the campaign companion
- let the local app send a prompt to that companion and import the response

Auto-submit currently runs only through the explicit Lorekeeper turn action. If ChatGPT needs login
or project selection, the extension opens or focuses ChatGPT and reports that user action is needed.

## Local Firefox Loading

For development, open Firefox and load `extension/firefox/manifest.json` as a temporary extension
from `about:debugging#/runtime/this-firefox`.
