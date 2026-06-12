import { execFile } from "node:child_process";
import { performance } from "node:perf_hooks";
import { promisify } from "node:util";
import { normalizeOllamaModelId, recommendedOllamaModels } from "./provider-settings.js";

const execFileAsync = promisify(execFile);
const defaultBaseUrl = "http://127.0.0.1:11434";

export class OllamaProvider {
  constructor(options = {}) {
    this.id = "ollama";
    this.label = "Ollama";
    this.baseUrl = normalizeBaseUrl(options.baseUrl ?? defaultBaseUrl);
  }

  async getStatus({ selectedModel } = {}) {
    const install = await detectOllamaInstall();
    const runtime = await this.listModels().catch((error) => ({
      ok: false,
      error: error instanceof Error ? error.message : "Ollama runtime unavailable.",
      models: [],
    }));
    const models = runtime.models ?? [];
    const selectedModelAvailable = selectedModel
      ? models.some((model) => normalizeOllamaModelId(model.name || model.model) === normalizeOllamaModelId(selectedModel))
      : false;

    return {
      providerId: this.id,
      label: this.label,
      baseUrl: this.baseUrl,
      installed: install.installed,
      installMessage: install.message,
      running: Boolean(runtime.ok),
      runtimeMessage: runtime.ok ? "Ollama is running." : runtime.error,
      models,
      recommendedModels: recommendedOllamaModels,
      selectedModel: selectedModel ?? null,
      selectedModelAvailable,
      state: statusState({ installed: install.installed, running: Boolean(runtime.ok), selectedModel, selectedModelAvailable }),
    };
  }

  async listModels() {
    const response = await fetch(`${this.baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(3500),
    });
    if (!response.ok) {
      throw new Error(`Ollama tags failed (${response.status}).`);
    }
    const payload = await response.json();
    return {
      ok: true,
      models: Array.isArray(payload.models) ? payload.models : [],
    };
  }

  async pullModel({ model, signal, onProgress } = {}) {
    if (!model?.trim()) {
      throw new Error("Model name is required.");
    }

    const startedAt = performance.now();
    const response = await fetch(`${this.baseUrl}/api/pull`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: model.trim(), stream: true }),
      signal,
    });

    if (!response.ok || !response.body) {
      throw new Error(`Ollama pull failed (${response.status}).`);
    }

    let lastProgress = null;
    for await (const event of readNdjsonStream(response.body)) {
      lastProgress = event;
      onProgress?.(event);
    }

    return {
      model: model.trim(),
      progress: lastProgress,
      durationMs: Math.round(performance.now() - startedAt),
    };
  }

  async generateTurn({ prompt, model, options = {}, signal, onToken, onEvent } = {}) {
    if (!prompt?.trim()) {
      throw new Error("Prompt is required.");
    }
    if (!model?.trim()) {
      throw new Error("Ollama model is required.");
    }

    const startedAt = performance.now();
    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: model.trim(),
        prompt,
        stream: true,
        format: options.format,
        keep_alive: options.keepAlive ?? "10m",
        options: {
          num_predict: options.outputLimit ?? 900,
          temperature: options.temperature ?? 0.75,
          top_p: options.topP ?? 0.9,
        },
      }),
      signal,
    });

    if (!response.ok || !response.body) {
      throw new Error(`Ollama generation failed (${response.status}).`);
    }

    let text = "";
    let finalEvent = null;
    for await (const event of readNdjsonStream(response.body)) {
      onEvent?.(event);
      if (event.response) {
        text += event.response;
        onToken?.(event.response, text);
      }
      if (event.done) {
        finalEvent = event;
      }
    }

    return {
      providerId: this.id,
      model: model.trim(),
      text,
      durationMs: Math.round(performance.now() - startedAt),
      contextSize: prompt.length,
      tokenCounts: {
        prompt: finalEvent?.prompt_eval_count ?? null,
        completion: finalEvent?.eval_count ?? null,
      },
      raw: finalEvent,
    };
  }

  async testGeneration({ model, signal } = {}) {
    const result = await this.generateTurn({
      model,
      prompt: "Reply with exactly: Lorekeeper local model ready.",
      options: {
        outputLimit: 32,
        temperature: 0,
      },
      signal,
    });

    return {
      ...result,
      ok: /lorekeeper local model ready/i.test(result.text),
    };
  }
}

export async function detectOllamaInstall() {
  try {
    const { stdout, stderr } = await execFileAsync("ollama", ["--version"], {
      timeout: 2500,
      windowsHide: true,
    });
    const message = `${stdout || stderr}`.trim();
    return {
      installed: true,
      message: message || "Ollama CLI detected.",
    };
  } catch {
    return {
      installed: false,
      message: "Ollama CLI was not found on PATH.",
    };
  }
}

export async function* readNdjsonStream(body) {
  const decoder = new TextDecoder();
  let buffer = "";

  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true });
    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (line) {
        yield JSON.parse(line);
      }
      newlineIndex = buffer.indexOf("\n");
    }
  }

  const final = buffer.trim();
  if (final) {
    yield JSON.parse(final);
  }
}

function statusState({ installed, running, selectedModel, selectedModelAvailable }) {
  if (!installed && !running) {
    return "ollama_not_installed";
  }
  if (!running) {
    return "ollama_not_running";
  }
  if (selectedModel && !selectedModelAvailable) {
    return "selected_model_missing";
  }
  if (selectedModelAvailable) {
    return "ready";
  }
  return "model_not_selected";
}

function normalizeBaseUrl(value) {
  return String(value || defaultBaseUrl).replace(/\/+$/, "");
}
