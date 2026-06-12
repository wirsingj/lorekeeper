# Local AI Provider

LoreKeeper now has the first version of a local provider layer centered on Ollama.

## Provider Modes

- `ollama`: local generation through Ollama's native REST API.
- `bridge`: existing browser extension workflow for ChatGPT/provider tabs.

Provider selection is stored in campaign `providerSettings`, alongside:

- `selectedModel`
- `generationTimeoutMs`
- `outputLimit`
- `fastMode`
- `ollamaBaseUrl`

## Ollama Integration

Default endpoint:

```text
http://127.0.0.1:11434
```

Used endpoints:

- `GET /api/tags` for installed models.
- `POST /api/generate` for streaming text generation.
- `POST /api/pull` for model download.

The local API exposes:

- `GET /api/provider/status`
- `POST /api/provider/settings`
- `POST /api/provider/generate-turn`
- `POST /api/ollama/pull`
- `POST /api/ollama/test`

Streaming responses use newline-delimited JSON:

```json
{"type":"start","provider":"ollama","model":"llama3.1:8b"}
{"type":"token","text":"The rain"}
{"type":"done","result":{"text":"...","durationMs":12000}}
```

## Setup Flow

1. Open Setup.
2. Choose `Ollama Local`.
3. Refresh local AI status.
4. Pick or download a model.
5. Test the model.
6. Start playing.

## Status States

- `ollama_not_installed`
- `ollama_not_running`
- `model_not_selected`
- `selected_model_missing`
- `ready`

## Cancellation

The renderer uses `AbortController` for local generation. The server forwards the abort signal to the Ollama request when the client cancels or disconnects.

## Fast Mode

Fast Mode trims the context pack to the highest-value sections:

- current scene
- recent play history
- active party
- active quests/threads
- combat state
- style rules

It also lowers output limits for faster turns.

