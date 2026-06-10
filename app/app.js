import { buildContextPack } from "../src/context-packs/build-context-pack.js";
import { findById } from "../src/campaign-state/formatters.js";
import { normalizeCampaign } from "../src/campaign-state/schema.js";
import { createSampleCampaign } from "../src/campaign-state/sample-campaign.js";
import { createStarterCampaign } from "../src/campaign-state/starter-campaign.js";
import { createReviewBatch, decideChange, getCommittableChanges } from "../src/canon-review/proposals.js";
import { extractLorekeeperUpdates } from "../src/canon-review/extract-updates.js";
import { createPlayerTurn } from "../src/play-loop/session-turn.js";

const bundleUrl = "/data/imports/veil-of-the-towers.bundle.json";
const apiCampaignUrl = "/api/campaign";
const apiCommitReviewUrl = "/api/review/commit";
const extensionRequestType = "lorekeeper.appBridge.request";
const extensionResponseType = "lorekeeper.appBridge.response";
const companionOptions = {
  providerId: "chatgpt",
  projectHint: "LoreKeeper",
  returnToCaller: true,
};
const state = {
  campaign: null,
  contextPack: null,
  currentTurn: null,
  reviewBatch: null,
  prompt: "",
  playMessages: [],
  sourceMode: "loading",
  bridge: {
    mode: "unknown",
    ready: false,
    lastRun: null,
  },
};

const elements = {
  title: document.querySelector("#campaign-title"),
  sceneLocation: document.querySelector("#scene-location"),
  providerStatus: document.querySelector("#provider-status"),
  saveStatus: document.querySelector("#save-status"),
  partyList: document.querySelector("#party-list"),
  partyCount: document.querySelector("#party-count"),
  questList: document.querySelector("#quest-list"),
  questCount: document.querySelector("#quest-count"),
  contextSections: document.querySelector("#context-sections"),
  contextCount: document.querySelector("#context-count"),
  promptOutput: document.querySelector("#prompt-output"),
  promptSize: document.querySelector("#prompt-size"),
  assetGrid: document.querySelector("#asset-grid"),
  assetCount: document.querySelector("#asset-count"),
  bridgeStatus: document.querySelector("#bridge-status"),
  checkSidecar: document.querySelector("#check-sidecar"),
  copyProviderPrompt: document.querySelector("#copy-provider-prompt"),
  newCampaign: document.querySelector("#new-campaign"),
  loadImported: document.querySelector("#load-imported"),
  playLog: document.querySelector("#play-log"),
  playerForm: document.querySelector("#player-form"),
  playerInput: document.querySelector("#player-input"),
  responseImport: document.querySelector("#response-import"),
  pasteResponse: document.querySelector("#paste-response"),
  importResponse: document.querySelector("#import-response"),
  reviewList: document.querySelector("#review-list"),
  reviewCount: document.querySelector("#review-count"),
  applyApproved: document.querySelector("#apply-approved"),
};

window.addEventListener("error", (event) => {
  reportUiError(event.error ?? event.message);
});

window.addEventListener("unhandledrejection", (event) => {
  reportUiError(event.reason);
});

elements.copyProviderPrompt.addEventListener("click", async () => {
  await copyPromptToClipboard(state.prompt, {
    emptyMessage: "Build a turn first",
    successMessage: "Provider prompt copied",
    failureMessage: "Clipboard blocked; prompt is in the drawer",
  });
});

elements.checkSidecar.addEventListener("click", async () => {
  await ensureCompanionSidecar({ openIfMissing: true });
});

elements.newCampaign.addEventListener("click", () => {
  state.campaign = createStarterCampaign({
    title: "New Campaign Binder",
    premise: "A new D&D 5e-lite campaign ready to grow through play.",
  });
  state.sourceMode = "new";
  state.reviewBatch = null;
  elements.responseImport.value = "";
  state.contextPack = buildContextPack(state.campaign, {
    purpose: "new_campaign_start",
  });
  state.prompt = "";
  seedPlayLog();
  render();
  elements.bridgeStatus.textContent = "New campaign binder opened";
});

elements.loadImported.addEventListener("click", async () => {
  await loadCampaign();
  seedPlayLog();
  render();
  elements.bridgeStatus.textContent = "Imported binder loaded";
});

elements.importResponse.addEventListener("click", () => {
  importProviderResponse(elements.responseImport.value.trim());
});

elements.pasteResponse.addEventListener("click", async () => {
  try {
    elements.responseImport.value = await navigator.clipboard.readText();
    elements.bridgeStatus.textContent = "Response pasted from clipboard";
  } catch {
    elements.bridgeStatus.textContent = "Clipboard paste unavailable";
  }
});

elements.applyApproved.addEventListener("click", () => {
  const approved = state.reviewBatch ? getCommittableChanges(state.reviewBatch) : [];
  if (approved.length === 0) {
    elements.bridgeStatus.textContent = "No approved changes to apply";
    return;
  }

  commitApprovedChanges(approved);
});

elements.playerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const playerMessage = elements.playerInput.value.trim();
  if (!playerMessage) {
    elements.bridgeStatus.textContent = "Type an action first";
    return;
  }

  state.currentTurn = createPlayerTurn({
    campaign: state.campaign,
    playerMessage,
  });
  state.contextPack = state.currentTurn.contextPack;
  state.prompt = state.currentTurn.providerPrompt;
  const visiblePlayerText = state.currentTurn.parsedMessage?.inWorldText;
  if (visiblePlayerText) {
    state.playMessages.push({
      role: "player",
      title: "You",
      body: visiblePlayerText,
    });
  }
  elements.playerInput.value = "";
  render();
  await runPromptThroughSidecar(state.prompt);
});

await boot();

async function boot() {
  await loadCampaign();
  seedPlayLog();
  render();
}

async function loadCampaign() {
  const apiResponse = await fetch(apiCampaignUrl);
  if (apiResponse.ok) {
    const payload = await apiResponse.json();
    state.campaign = normalizeCampaign(payload.campaign);
    state.sourceMode = payload.source ?? "sqlite";
    state.sqlitePath = payload.sqlitePath;
    state.contextPack = buildContextPack(state.campaign, {
      purpose: "play_screen_initial_context",
    });
    state.prompt = "";
    state.reviewBatch = null;
    return;
  }

  const response = await fetch(bundleUrl);
  if (response.ok) {
    const bundle = await response.json();
    state.campaign = normalizeCampaign(bundle.campaign);
    state.sourceMode = "imported";
  } else {
    state.campaign = createSampleCampaign();
    state.sourceMode = "sample";
  }

  state.contextPack = buildContextPack(state.campaign, {
    purpose: "play_screen_initial_context",
  });
  state.prompt = "";
  state.reviewBatch = null;
}

async function commitApprovedChanges(approved) {
  try {
    elements.bridgeStatus.textContent = "Committing approved changes to SQLite...";
    const response = await fetch(apiCommitReviewUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        reviewBatch: state.reviewBatch,
      }),
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    const result = await response.json();
    state.campaign = normalizeCampaign(result.campaign);
    state.contextPack = buildContextPack(state.campaign, {
      purpose: "post_commit_context",
    });
    state.reviewBatch = null;
    elements.bridgeStatus.textContent = `${result.applied.length} change${result.applied.length === 1 ? "" : "s"} saved to SQLite`;
    render();
  } catch (error) {
    elements.bridgeStatus.textContent = "SQLite commit failed";
    render();
  }
}

function seedPlayLog() {
  const campaign = state.campaign;
  const currentPlace = findById(campaign.places, campaign.scene.currentPlaceId);
  state.playMessages = [
    {
      role: "dm",
      title: "DM",
      body: campaign.scene.immediateSituation,
      meta: currentPlace?.name ? `Scene: ${currentPlace.name}` : "",
    },
  ];
}

function render() {
  const campaign = state.campaign;
  const currentPlace = findById(campaign.places, campaign.scene.currentPlaceId);

  elements.title.textContent = campaign.title;
  elements.sceneLocation.textContent = currentPlace?.name ?? "Current scene";
  elements.providerStatus.textContent = "Provider: ChatGPT sidecar/manual";
  if (state.bridge.mode === "extension") {
    elements.providerStatus.textContent = state.bridge.ready
      ? "Provider: ChatGPT companion ready"
      : "Provider: ChatGPT companion waiting";
  }
  elements.saveStatus.textContent = `Binder: ${state.sourceMode} / SQLite target`;
  if (state.sqlitePath) {
    elements.saveStatus.textContent = "SQLite: active campaign file";
  }

  renderPlayLog();
  renderParty(campaign);
  renderQuests(campaign);
  renderContextPack(state.contextPack);
  renderPrompt(state.prompt);
  renderReviewBatch();
  renderAssets(campaign);
}

function importProviderResponse(responseText) {
  if (!responseText) {
    elements.bridgeStatus.textContent = "Paste a provider response first";
    return;
  }

  state.playMessages.push({
    role: "dm",
    title: "DM",
    body: stripLorekeeperUpdateBlock(responseText),
  });

  const extraction = extractLorekeeperUpdates(responseText);
  state.reviewBatch = createReviewBatch({
    campaignId: state.campaign.id,
    source: "manual_import",
    rawResponse: responseText,
    proposedChanges: extraction.proposedChanges,
  });

  elements.responseImport.value = "";
  if (extraction.error) {
    elements.bridgeStatus.textContent = `DM response imported; ${extraction.error}`;
  } else {
    elements.bridgeStatus.textContent =
      extraction.proposedChanges.length > 0
        ? `${extraction.proposedChanges.length} proposed change${extraction.proposedChanges.length === 1 ? "" : "s"} found`
        : "DM response imported with no proposed changes";
  }
  render();
}

async function ensureCompanionSidecar({ openIfMissing = false } = {}) {
  const probe = await probeExtensionBridge();
  if (!probe.available) {
    state.bridge = {
      mode: "manual",
      ready: false,
      lastRun: null,
    };
    elements.bridgeStatus.textContent = "Extension not connected; reload Firefox extension";
    return probe;
  }

  if (!openIfMissing) {
    return handleCompanionCheckResult(probe.result);
  }

  const message = {
    type: "lorekeeper.ensureCompanionSession",
    options: {
      ...companionOptions,
      readyTimeoutMs: 30000,
    },
  };

  try {
    elements.bridgeStatus.textContent = "Checking ChatGPT companion...";
    const result = await sendExtensionMessage(message, 35000);
    return handleCompanionCheckResult(result);
  } catch (error) {
    state.bridge = {
      mode: "manual",
      ready: false,
      lastRun: null,
    };
    elements.bridgeStatus.textContent = "Extension not connected; reload Firefox extension";
    return {
      ready: false,
      error: error instanceof Error ? error.message : "Extension bridge unavailable.",
    };
  }
}

async function runPromptThroughSidecar(prompt) {
  if (!prompt.trim()) {
    elements.bridgeStatus.textContent = "Build a provider prompt first";
    return;
  }

  try {
    const probe = await probeExtensionBridge();
    if (!probe.available) {
      await copyPromptToClipboard(prompt, {
        successMessage: "Extension not connected; prompt copied",
        failureMessage: "Extension not connected; copy from prompt drawer",
      });
      state.bridge = {
        mode: "manual",
        ready: false,
        lastRun: null,
      };
      return;
    }

    elements.bridgeStatus.textContent = "Sending turn to ChatGPT companion...";
    const progress = startSidecarProgress();
    const result = await sendExtensionMessage(
      {
        type: "lorekeeper.runCompanionPrompt",
        prompt,
        options: {
          ...companionOptions,
          readyTimeoutMs: 30000,
          responseTimeoutMs: 90000,
        },
      },
      125000,
    );
    progress.stop();

    state.bridge = {
      mode: "extension",
      ready: Boolean(result.ready),
      lastRun: result,
    };

    if (result.sent && result.response?.text) {
      importProviderResponse(result.response.text);
      elements.bridgeStatus.textContent = "ChatGPT response imported for canon review";
      return;
    }

    if (result.loginRequired) {
      await copyPromptToClipboard(prompt, {
        successMessage: "ChatGPT needs login; prompt copied",
        failureMessage: "ChatGPT needs login; copy from prompt drawer",
      });
      render();
      return;
    }

    await copyPromptToClipboard(prompt, {
      successMessage: "Sidecar did not return a response; prompt copied",
      failureMessage: "Sidecar did not return a response; copy from prompt drawer",
    });
  } catch (error) {
    stopSidecarProgress();
    await copyPromptToClipboard(prompt, {
      successMessage: "Sidecar failed; prompt copied",
      failureMessage: "Sidecar failed; copy from prompt drawer",
    });
    state.bridge = {
      mode: "manual",
      ready: false,
      lastRun: null,
    };
    render();
  }
}

async function copyPromptToClipboard(prompt, messages = {}) {
  if (!prompt?.trim()) {
    elements.bridgeStatus.textContent = messages.emptyMessage ?? "No provider prompt ready";
    return false;
  }

  try {
    await navigator.clipboard.writeText(prompt);
    elements.bridgeStatus.textContent = messages.successMessage ?? "Prompt copied";
    return true;
  } catch {
    elements.bridgeStatus.textContent = messages.failureMessage ?? "Clipboard blocked; prompt is in the drawer";
    openPromptDrawer();
    return false;
  }
}

function openPromptDrawer() {
  const drawer = document.querySelector(".prompt-drawer");
  if (drawer) {
    drawer.open = true;
  }
}

function reportUiError(error) {
  const message = error instanceof Error ? error.message : String(error ?? "Unknown UI error");
  if (elements.bridgeStatus) {
    elements.bridgeStatus.textContent = `UI error: ${message}`;
  }
}

let activeProgressTimers = [];

function startSidecarProgress() {
  stopSidecarProgress();
  activeProgressTimers = [
    window.setTimeout(() => {
      elements.bridgeStatus.textContent = "Waiting for ChatGPT response...";
    }, 8000),
    window.setTimeout(() => {
      elements.bridgeStatus.textContent = "Still waiting on the companion tab...";
    }, 30000),
    window.setTimeout(() => {
      elements.bridgeStatus.textContent = "Provider run is taking a while; manual fallback remains available";
    }, 65000),
  ];

  return {
    stop: stopSidecarProgress,
  };
}

function stopSidecarProgress() {
  for (const timer of activeProgressTimers) {
    window.clearTimeout(timer);
  }
  activeProgressTimers = [];
}

async function probeExtensionBridge() {
  try {
    const result = await sendExtensionMessage(
      {
        type: "lorekeeper.getCompanionSession",
        options: companionOptions,
      },
      2500,
    );
    return {
      available: true,
      result,
    };
  } catch (error) {
    return {
      available: false,
      ready: false,
      error: error instanceof Error ? error.message : "Extension bridge unavailable.",
    };
  }
}

function handleCompanionCheckResult(result) {
  state.bridge = {
    mode: "extension",
    ready: Boolean(result.ready),
    lastRun: result,
  };

  if (result.ready) {
    elements.bridgeStatus.textContent = result.created
      ? "ChatGPT companion opened and ready"
      : "ChatGPT companion ready";
  } else if (result.loginRequired) {
    elements.bridgeStatus.textContent = "ChatGPT needs login or project selection";
  } else {
    elements.bridgeStatus.textContent = "No ChatGPT companion tab found";
  }

  render();
  return result;
}

function sendExtensionMessage(message, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const requestId = `lk-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const timeout = window.setTimeout(() => {
      window.removeEventListener("message", handleResponse);
      reject(new Error("Lorekeeper extension did not respond."));
    }, timeoutMs);

    function handleResponse(event) {
      if (event.source !== window || event.data?.type !== extensionResponseType || event.data.requestId !== requestId) {
        return;
      }

      window.clearTimeout(timeout);
      window.removeEventListener("message", handleResponse);

      if (event.data.ok) {
        resolve(event.data.result);
      } else {
        reject(new Error(event.data.error ?? "Lorekeeper extension bridge failed."));
      }
    }

    window.addEventListener("message", handleResponse);
    window.postMessage(
      {
        type: extensionRequestType,
        requestId,
        message,
      },
      window.location.origin,
    );
  });
}

function renderPlayLog() {
  elements.playLog.replaceChildren(
    ...state.playMessages.map((message) => {
      const wrapper = document.createElement("article");
      wrapper.className = `play-message ${message.role}`;

      const title = document.createElement("strong");
      title.textContent = message.title;

      const body = document.createElement("p");
      body.textContent = message.body;

      wrapper.append(title, body);
      if (message.meta) {
        const meta = document.createElement("small");
        meta.textContent = message.meta;
        wrapper.append(meta);
      }
      return wrapper;
    }),
  );
  elements.playLog.scrollTop = elements.playLog.scrollHeight;
}

function renderParty(campaign) {
  elements.partyCount.textContent = String(campaign.party.length);
  elements.partyList.replaceChildren(
    ...campaign.party.map((member) =>
      recordElement({
        title: member.name,
        body: `${member.ancestryClass || "unknown role"}${member.stats?.hp ? `, HP ${member.stats.hp.current}/${member.stats.hp.max}` : ""}${member.notes?.length ? ` - ${member.notes[0]}` : ""}`,
      }),
    ),
  );
}

function renderQuests(campaign) {
  const active = campaign.quests.filter((quest) => quest.status !== "completed").slice(0, 8);
  elements.questCount.textContent = String(active.length);
  elements.questList.replaceChildren(
    ...active.map((quest) =>
      recordElement({
        title: quest.title,
        body: quest.stakes || quest.openQuestions?.join(" "),
      }),
    ),
  );
}

function renderContextPack(contextPack) {
  elements.contextCount.textContent = String(contextPack.sections.length);
  elements.contextSections.replaceChildren(
    ...contextPack.sections.slice(0, 6).map((section) => {
      const wrapper = document.createElement("article");
      wrapper.className = "context-section";

      const heading = document.createElement("h3");
      heading.textContent = section.title;

      const list = document.createElement("ul");
      list.replaceChildren(
        ...section.entries.slice(0, 4).map((entry) => {
          const item = document.createElement("li");
          item.textContent = entry;
          return item;
        }),
      );

      wrapper.append(heading, list);
      return wrapper;
    }),
  );
}

function renderReviewBatch() {
  const changes = state.reviewBatch?.proposedChanges ?? [];
  elements.reviewCount.textContent = String(changes.length);
  elements.reviewList.replaceChildren(
    ...changes.map((change) => {
      const wrapper = document.createElement("article");
      wrapper.className = `review-card ${change.status}`;

      const heading = document.createElement("h3");
      heading.textContent = `${change.operation} / ${change.domain}`;

      const summary = document.createElement("p");
      summary.textContent = change.summary;

      const meta = document.createElement("small");
      meta.textContent = `${change.confidence ?? "unknown"} confidence${change.targetId ? ` / ${change.targetId}` : ""}`;

      const actions = document.createElement("div");
      actions.className = "review-actions";

      const approve = document.createElement("button");
      approve.type = "button";
      approve.textContent = "Approve";
      approve.addEventListener("click", () => updateReviewDecision(change.id, "approved"));

      const reject = document.createElement("button");
      reject.type = "button";
      reject.textContent = "Reject";
      reject.addEventListener("click", () => updateReviewDecision(change.id, "rejected"));

      actions.append(approve, reject);
      wrapper.append(heading, summary, meta, actions);
      return wrapper;
    }),
  );
}

function updateReviewDecision(changeId, decision) {
  state.reviewBatch = decideChange(state.reviewBatch, changeId, decision);
  elements.bridgeStatus.textContent = `Change ${decision}`;
  renderReviewBatch();
}

function renderPrompt(prompt) {
  elements.promptOutput.value = prompt;
  elements.promptSize.textContent = `${prompt.length} chars`;
}

function renderAssets(campaign) {
  const assets = campaign.assets.filter((asset) => asset.kind === "image").slice(0, 4);
  elements.assetCount.textContent = String(campaign.assets.length);
  elements.assetGrid.replaceChildren(
    ...assets.map((asset) => {
      const wrapper = document.createElement("article");
      wrapper.className = "asset";

      const image = document.createElement("img");
      image.src = `/local-asset?path=${encodeURIComponent(asset.path)}`;
      image.alt = asset.name;
      wrapper.append(image);

      const body = document.createElement("div");
      body.className = "asset-body";
      const name = document.createElement("strong");
      name.textContent = asset.name;
      const type = document.createElement("span");
      type.textContent = asset.kind;
      body.append(name, type);
      wrapper.append(body);

      return wrapper;
    }),
  );
}

function recordElement({ title, body }) {
  const wrapper = document.createElement("article");
  wrapper.className = "record";

  const heading = document.createElement("h3");
  heading.textContent = title;

  const copy = document.createElement("p");
  copy.textContent = body || "No notes recorded.";

  wrapper.append(heading, copy);
  return wrapper;
}

function stripLorekeeperUpdateBlock(text) {
  return text
    .replace(/```json\s+lorekeeper_updates\s*[\s\S]*?```/gi, "")
    .replace(/```lorekeeper_updates\s*[\s\S]*?```/gi, "")
    .trim();
}
