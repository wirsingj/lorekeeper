# Desktop Migration

LoreKeeper is moving from a local web app plus browser-extension sidecar toward a self-contained desktop app.

## Current Architecture

- React/Vite renderer mounted in `app/App.jsx` with behavior in `app/app.js`.
- Node HTTP API in `scripts/serve.js`.
- SQLite campaign files in `data/campaigns`, one portable `.lorekeeper.sqlite` file per campaign.
- Firefox extension bridge for ChatGPT provider UI automation.
- Context packs and prompts are built from SQLite-backed campaign state.
- Provider responses are imported as player-facing text plus `json lorekeeper_updates`.

## Target Architecture

- Electron main process owns application lifecycle, local file access, and provider processes.
- React renderer owns the table UI, setup screens, streaming display, and state review.
- Local API/service layer remains reusable by web dev server and Electron.
- SQLite remains canon.
- Ollama is the normal local provider.
- Browser bridge remains an optional advanced/debug provider.

## Migration Risks

- `app/app.js` is still an imperative DOM controller under a React shell. It works, but it will become painful as streaming and setup state grow.
- Provider bridge code is intentionally brittle because provider DOMs change.
- Existing update workflow still auto-approves valid model updates. This is useful for prototyping, but the long-term workflow needs an explicit review queue before canon commit.
- `sql.js` is portable but not ideal for high-frequency writes or large desktop-scale campaign libraries. Native SQLite can be considered later.
- Ollama model performance varies sharply by hardware, context size, quantization, and model.

## Opportunities

- Keep `scripts/serve.js` as a development compatibility layer while extracting services into reusable modules for Electron.
- Treat providers as interchangeable adapters with a shared result shape.
- Move turn orchestration into a service instead of having the renderer decide every step.
- Use the same NDJSON streaming contract in web dev mode and Electron IPC.
- Keep campaign files portable regardless of desktop packaging.

## Staged Plan

1. Provider abstraction and Ollama REST provider.
2. Local AI setup: detect runtime, list models, download models, test generation.
3. Streaming playable turn loop with cancellation.
4. Contract validation and explicit review workflow.
5. Electron shell and installer/distribution strategy.
6. Model benchmarking and recommendation updates.

## Desktop Packaging Direction

The preferred first Electron shape is:

- Electron main starts or imports the local service layer.
- Renderer loads the Vite-built app.
- Campaign storage location defaults to app data but can be changed in Settings.
- Ollama is detected, not bundled with model weights.
- The app can deep-link to install instructions and call `ollama pull`/API pull for model setup.

## Runtime Baseline

This branch moves the project baseline to Node `>=22.12.0` so the desktop app can track current Electron releases instead of pinning to an older runtime. Existing web/dev scripts may still run on older Node versions for now, but Electron development should use Node 22 or newer.
