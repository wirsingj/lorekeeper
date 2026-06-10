# Content Scripts

Provider content scripts run inside supported provider pages after explicit host permission matches.

The packaged Firefox copy lives at `extension/firefox/content-scripts/chatgpt-bridge.js`. It can
detect the prompt input, insert prompt text, and read the latest visible assistant response from
ChatGPT.
