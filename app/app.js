import { buildContextPack } from "../src/context-packs/build-context-pack.js";
import { findById } from "../src/campaign-state/formatters.js";
import { normalizeCampaign } from "../src/campaign-state/schema.js";
import { createSampleCampaign } from "../src/campaign-state/sample-campaign.js";
import { createStarterCampaign } from "../src/campaign-state/starter-campaign.js";
import { previewCanonicalChanges } from "../src/campaign-state/apply-changes.js";
import { createReviewBatch, decideChange, getCommittableChanges } from "../src/canon-review/proposals.js";
import { extractLorekeeperUpdates, stripLorekeeperUpdates } from "../src/canon-review/extract-updates.js";
import { createPlayerTurn } from "../src/play-loop/session-turn.js";

const bundleUrl = "/data/imports/veil-of-the-towers.bundle.json";
const apiCampaignUrl = "/api/campaign";
const apiCampaignsUrl = "/api/campaigns";
const apiSelectCampaignUrl = "/api/campaign/select";
const apiNewCampaignUrl = "/api/campaign/new";
const apiImportedCampaignUrl = "/api/campaign/imported";
const apiCommitReviewUrl = "/api/review/commit";
const apiCampaignRecordUrl = "/api/campaign/record";
const apiCampaignMessageUrl = "/api/campaign/message";
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
  campaigns: [],
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
  campaignSelect: document.querySelector("#campaign-select"),
  sceneLocation: document.querySelector("#scene-location"),
  providerStatus: document.querySelector("#provider-status"),
  saveStatus: document.querySelector("#save-status"),
  partyList: document.querySelector("#party-list"),
  partyCount: document.querySelector("#party-count"),
  peopleList: document.querySelector("#people-list"),
  peopleCount: document.querySelector("#people-count"),
  placeList: document.querySelector("#place-list"),
  placeCount: document.querySelector("#place-count"),
  thingList: document.querySelector("#thing-list"),
  thingCount: document.querySelector("#thing-count"),
  questList: document.querySelector("#quest-list"),
  questCount: document.querySelector("#quest-count"),
  promptOutput: document.querySelector("#prompt-output"),
  promptSize: document.querySelector("#prompt-size"),
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
  recordDialog: document.querySelector("#record-dialog"),
  recordForm: document.querySelector("#record-form"),
  recordDialogTitle: document.querySelector("#record-dialog-title"),
  recordDomain: document.querySelector("#record-domain"),
  recordName: document.querySelector("#record-name"),
  recordNameLabel: document.querySelector("#record-name-label"),
  recordRole: document.querySelector("#record-role"),
  recordRoleLabel: document.querySelector("#record-role-label"),
  recordPath: document.querySelector("#record-path"),
  recordPathRow: document.querySelector("#record-path-row"),
  recordNotes: document.querySelector("#record-notes"),
  closeRecordDialog: document.querySelector("#close-record-dialog"),
  campaignDialog: document.querySelector("#campaign-dialog"),
  campaignForm: document.querySelector("#campaign-form"),
  newCampaignTitle: document.querySelector("#new-campaign-title"),
  newCampaignPremise: document.querySelector("#new-campaign-premise"),
  closeCampaignDialog: document.querySelector("#close-campaign-dialog"),
  confirmDialog: document.querySelector("#confirm-dialog"),
  confirmForm: document.querySelector("#confirm-form"),
  confirmTitle: document.querySelector("#confirm-title"),
  confirmMessage: document.querySelector("#confirm-message"),
  closeConfirmDialog: document.querySelector("#close-confirm-dialog"),
  cancelConfirm: document.querySelector("#cancel-confirm"),
  acceptConfirm: document.querySelector("#accept-confirm"),
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

elements.campaignSelect.addEventListener("change", async () => {
  const sqlitePath = elements.campaignSelect.value;
  if (!sqlitePath || sqlitePath === state.sqlitePath) {
    return;
  }

  await selectCampaignByPath(sqlitePath);
});

elements.checkSidecar.addEventListener("click", async () => {
  await ensureCompanionSidecar({ openIfMissing: true, focusProvider: true });
});

elements.newCampaign.addEventListener("click", async () => {
  openCampaignDialog();
});

elements.loadImported.addEventListener("click", async () => {
  const confirmed = await confirmInApp({
    title: "Load Imported Campaign",
    message: "This will create or open the imported Veil of the Towers bundle and switch the active campaign.",
    acceptLabel: "Load Imported",
  });

  if (!confirmed) {
    elements.bridgeStatus.textContent = "Imported load canceled";
    return;
  }

  await loadImportedCampaign();
  seedPlayLog();
  render();
  elements.bridgeStatus.textContent = "Imported binder loaded";
});

elements.importResponse.addEventListener("click", async () => {
  await importProviderResponse(elements.responseImport.value.trim());
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

document.querySelectorAll("[data-add-domain]").forEach((button) => {
  button.addEventListener("click", () => openRecordDialog(button.dataset.addDomain));
});

elements.closeRecordDialog.addEventListener("click", () => {
  elements.recordDialog.close();
});

elements.closeCampaignDialog.addEventListener("click", () => {
  elements.campaignDialog.close();
});

elements.campaignForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await createNewCampaign({
    title: elements.newCampaignTitle.value,
    premise: elements.newCampaignPremise.value,
  });
});

elements.closeConfirmDialog.addEventListener("click", () => {
  resolveConfirmDialog(false);
});

elements.cancelConfirm.addEventListener("click", () => {
  resolveConfirmDialog(false);
});

elements.confirmForm.addEventListener("submit", (event) => {
  event.preventDefault();
  resolveConfirmDialog(true);
});

elements.recordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await saveRecordFromDialog();
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
  const metaText = (state.currentTurn.parsedMessage?.metaInstructions ?? []).join(" ");
  if (visiblePlayerText) {
    await appendPlayMessage({
      role: "player",
      title: "You",
      body: visiblePlayerText,
      meta: metaText ? `Meta: ${metaText}` : "",
      source: "player_input",
    });
  } else if (metaText) {
    await appendPlayMessage({
      role: "player",
      title: "You (meta)",
      body: metaText,
      meta: "Out-of-world instruction",
      source: "player_meta",
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
    setCampaignFromPayload(payload, "play_screen_initial_context");
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

async function selectCampaignByPath(sqlitePath) {
  try {
    elements.bridgeStatus.textContent = "Opening campaign...";
    const response = await fetch(apiSelectCampaignUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ sqlitePath }),
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    const payload = await response.json();
    setCampaignFromPayload(payload, "selected_campaign_context");
    seedPlayLog();
    render();
    elements.bridgeStatus.textContent = "Campaign opened";
  } catch (error) {
    elements.bridgeStatus.textContent = error instanceof Error ? `Open failed: ${error.message}` : "Open failed";
    renderCampaignSelector();
  }
}

async function createNewCampaign({ title, premise }) {
  const trimmedTitle = title.trim() || "New Campaign Binder";
  const trimmedPremise = premise.trim() || "A new D&D 5e-lite campaign ready to grow through play.";
  try {
    elements.bridgeStatus.textContent = "Creating new SQLite campaign...";
    const response = await fetch(apiNewCampaignUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: trimmedTitle,
        premise: trimmedPremise,
      }),
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    const payload = await response.json();
    setCampaignFromPayload(payload, "new_campaign_start");
    state.reviewBatch = null;
    elements.responseImport.value = "";
    seedPlayLog();
    render();
    elements.campaignDialog.close();
    elements.campaignForm.reset();
    elements.bridgeStatus.textContent = "New campaign saved to SQLite";
  } catch (error) {
    state.campaign = createStarterCampaign({
      title: trimmedTitle,
      premise: trimmedPremise,
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
    elements.bridgeStatus.textContent = error instanceof Error ? `New campaign not saved: ${error.message}` : "New campaign not saved";
  }
}

function openCampaignDialog() {
  elements.newCampaignTitle.value = "New Campaign Binder";
  elements.newCampaignPremise.value = "A new D&D 5e-lite campaign ready to grow through play.";
  elements.campaignDialog.showModal();
  elements.newCampaignTitle.focus();
  elements.newCampaignTitle.select();
}

let pendingConfirmResolve = null;

function confirmInApp({ title, message, acceptLabel = "Continue" }) {
  if (pendingConfirmResolve) {
    pendingConfirmResolve(false);
  }

  elements.confirmTitle.textContent = title;
  elements.confirmMessage.textContent = message;
  elements.acceptConfirm.textContent = acceptLabel;
  elements.confirmDialog.showModal();

  return new Promise((resolve) => {
    pendingConfirmResolve = resolve;
  });
}

function resolveConfirmDialog(value) {
  if (!pendingConfirmResolve) {
    elements.confirmDialog.close();
    return;
  }

  const resolve = pendingConfirmResolve;
  pendingConfirmResolve = null;
  elements.confirmDialog.close();
  resolve(value);
}

async function loadImportedCampaign() {
  const response = await fetch(apiImportedCampaignUrl, {
    method: "POST",
  });

  if (response.ok) {
    const payload = await response.json();
    setCampaignFromPayload(payload, "imported_campaign_context");
    return;
  }

  const fallback = await fetch(bundleUrl);
  if (!fallback.ok) {
    throw new Error("No imported campaign bundle found.");
  }

  const bundle = await fallback.json();
  state.campaign = normalizeCampaign(bundle.campaign);
  state.sourceMode = "imported";
  state.contextPack = buildContextPack(state.campaign, {
    purpose: "imported_campaign_context",
  });
  state.prompt = "";
  state.reviewBatch = null;
}

function setCampaignFromPayload(payload, contextPurpose) {
  state.campaign = normalizeCampaign(payload.campaign);
  state.sourceMode = payload.source ?? "sqlite";
  state.sqlitePath = payload.sqlitePath;
  state.campaigns = payload.campaigns ?? state.campaigns;
  state.contextPack = buildContextPack(state.campaign, {
    purpose: contextPurpose,
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

async function saveRecordFromDialog() {
  const payload = {
    domain: elements.recordDomain.value,
    name: elements.recordName.value.trim(),
    role: elements.recordRole.value.trim(),
    type: elements.recordRole.value.trim(),
    status: elements.recordRole.value.trim(),
    tags: elements.recordRole.value.trim(),
    kind: elements.recordRole.value.trim(),
    summary: elements.recordNotes.value.trim(),
    notes: elements.recordNotes.value.trim(),
    path: elements.recordPath.value.trim(),
  };

  if (!payload.name) {
    elements.bridgeStatus.textContent = "Name is required";
    return;
  }

  try {
    elements.bridgeStatus.textContent = "Saving binder record...";
    const response = await fetch(apiCampaignRecordUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    const result = await response.json();
    setCampaignFromPayload(result, "direct_record_update");
    render();
    elements.recordDialog.close();
    elements.recordForm.reset();
    elements.bridgeStatus.textContent = `${recordLabel(payload.domain)} saved to SQLite; provider sees it next turn`;
  } catch (error) {
    elements.bridgeStatus.textContent = error instanceof Error ? `Save failed: ${error.message}` : "Save failed";
  }
}

function openRecordDialog(domain) {
  const config = recordDialogConfig(domain);
  elements.recordDomain.value = domain;
  elements.recordDialogTitle.textContent = config.title;
  elements.recordNameLabel.textContent = config.nameLabel;
  elements.recordRoleLabel.textContent = config.roleLabel;
  elements.recordName.placeholder = config.namePlaceholder;
  elements.recordRole.placeholder = config.rolePlaceholder;
  elements.recordNotes.placeholder = config.notesPlaceholder;
  elements.recordPathRow.hidden = domain !== "assets";
  elements.recordForm.reset();
  elements.recordDomain.value = domain;
  elements.recordDialog.showModal();
  elements.recordName.focus();
}

function recordDialogConfig(domain) {
  const configs = {
    party: {
      title: "Add Party Member",
      nameLabel: "Character name",
      roleLabel: "Ancestry / class",
      namePlaceholder: "Evelynn",
      rolePlaceholder: "Forest elf ranger",
      notesPlaceholder: "Personality, goals, stats, familiar, important backstory...",
    },
    people: {
      title: "Add Person",
      nameLabel: "Name",
      roleLabel: "Role / type",
      namePlaceholder: "Mira Vale",
      rolePlaceholder: "Herbalist, rival, guard captain...",
      notesPlaceholder: "What is canon about this person?",
    },
    places: {
      title: "Add Place",
      nameLabel: "Place name",
      roleLabel: "Place type",
      namePlaceholder: "Brindle Hollow",
      rolePlaceholder: "frontier town, ruin, forest road...",
      notesPlaceholder: "Sights, factions, dangers, connections, known facts...",
    },
    quests: {
      title: "Add Thread",
      nameLabel: "Thread title",
      roleLabel: "Status",
      namePlaceholder: "Find the missing wolf companion",
      rolePlaceholder: "active",
      notesPlaceholder: "Stakes, clues, unresolved questions...",
    },
    lore: {
      title: "Add Lore Note",
      nameLabel: "Lore title",
      roleLabel: "Tags",
      namePlaceholder: "Moonlit wolf omen",
      rolePlaceholder: "omen, forest, wolves",
      notesPlaceholder: "Canon note text...",
    },
    assets: {
      title: "Add Source Image",
      nameLabel: "Asset name",
      roleLabel: "Kind",
      namePlaceholder: "Brindle Hollow map",
      rolePlaceholder: "image",
      notesPlaceholder: "What should Lorekeeper remember about this source image?",
    },
    items: {
      title: "Add Thing",
      nameLabel: "Thing name",
      roleLabel: "Kind / type",
      namePlaceholder: "Silver lockpick",
      rolePlaceholder: "tool, clue, artifact, weapon...",
      notesPlaceholder: "What is known about it, who has it, and why it matters...",
    },
  };

  return configs[domain] ?? configs.lore;
}

function recordLabel(domain) {
  return {
    party: "Party member",
    people: "Person",
    places: "Place",
    quests: "Thread",
    lore: "Lore note",
    assets: "Asset",
    items: "Thing",
  }[domain] ?? "Record";
}

function seedPlayLog() {
  const campaign = state.campaign;
  const storedMessages = campaign.sessionLog?.messages ?? [];
  if (storedMessages.length > 0) {
    state.playMessages = storedMessages.map((message) => ({
      id: message.id,
      sessionId: message.sessionId,
      role: message.role,
      title: message.title,
      body: message.body,
      meta: message.meta,
      source: message.source,
      createdAt: message.createdAt,
    }));
    return;
  }

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
  const visibleCampaign = buildVisibleCampaign();
  const currentPlace = findById(visibleCampaign.places, visibleCampaign.scene.currentPlaceId);

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
  renderParty(visibleCampaign, campaign);
  renderPeople(visibleCampaign, campaign);
  renderPlaces(visibleCampaign, campaign);
  renderThings(visibleCampaign, campaign);
  renderQuests(visibleCampaign, campaign);
  renderPrompt(state.prompt);
  renderReviewBatch();
  renderCampaignSelector();
}

function buildVisibleCampaign() {
  const changes = reviewPreviewChanges();
  if (!changes.length) {
    return state.campaign;
  }

  return previewCanonicalChanges(state.campaign, changes).campaign;
}

function reviewPreviewChanges() {
  return (state.reviewBatch?.proposedChanges ?? []).filter((change) => change.status !== "rejected");
}

function renderCampaignSelector() {
  const campaigns = state.campaigns ?? [];
  elements.campaignSelect.replaceChildren(
    ...campaigns.map((campaign) => {
      const option = document.createElement("option");
      option.value = campaign.sqlitePath;
      option.textContent = campaign.title;
      option.selected = campaign.sqlitePath === state.sqlitePath;
      return option;
    }),
  );

  if (!campaigns.length) {
    const option = document.createElement("option");
    option.value = state.sqlitePath ?? "";
    option.textContent = state.campaign?.title ?? "No campaigns found";
    option.selected = true;
    elements.campaignSelect.append(option);
  }
}

async function importProviderResponse(responseText) {
  if (!responseText) {
    elements.bridgeStatus.textContent = "Paste a provider response first";
    return;
  }

  await appendPlayMessage({
    role: "dm",
    title: "DM",
    body: cleanProviderResponseForPlay(responseText),
    source: "provider_response",
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

async function appendPlayMessage(message) {
  const normalized = {
    id: message.id || `msg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    sessionId: message.sessionId || state.campaign.sessionLog?.activeSessionId || "session-main",
    role: message.role,
    title: message.title,
    body: message.body,
    meta: message.meta || "",
    source: message.source || "lorekeeper_ui",
    providerRunId: message.providerRunId || null,
    createdAt: message.createdAt || new Date().toISOString(),
  };

  state.playMessages.push(normalized);
  state.campaign = {
    ...state.campaign,
    sessionLog: appendMessageToSessionLog(state.campaign.sessionLog, normalized),
  };

  render();
  await persistPlayMessage(normalized);
  return normalized;
}

function appendMessageToSessionLog(sessionLog, message) {
  const now = new Date().toISOString();
  const activeSessionId = sessionLog?.activeSessionId || "session-main";
  const sessions = Array.isArray(sessionLog?.sessions) && sessionLog.sessions.length
    ? sessionLog.sessions
    : [
        {
          id: activeSessionId,
          title: "Campaign Play",
          startedAt: now,
          endedAt: null,
          recap: "",
        },
      ];

  return {
    activeSessionId,
    sessions,
    messages: [...(sessionLog?.messages ?? []), message],
  };
}

async function persistPlayMessage(message) {
  try {
    const response = await fetch(apiCampaignMessageUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    const result = await response.json();
    state.campaign = normalizeCampaign(result.campaign);
    state.contextPack = buildContextPack(state.campaign, {
      purpose: "post_message_context",
    });
    state.campaigns = result.campaigns ?? state.campaigns;
    state.sqlitePath = result.sqlitePath ?? state.sqlitePath;
    render();
  } catch (error) {
    elements.bridgeStatus.textContent = "Chat history save failed; message is only in this browser view";
  }
}

async function ensureCompanionSidecar({ openIfMissing = false, focusProvider = false } = {}) {
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

  await requestSidebarOpen();

  const message = {
    type: "lorekeeper.ensureCompanionSession",
    options: {
      ...companionOptions,
      readyTimeoutMs: 30000,
      focusProvider,
      returnToCaller: !focusProvider,
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

async function requestSidebarOpen() {
  try {
    const result = await sendExtensionMessage(
      {
        type: "lorekeeper.openSidebar",
      },
      5000,
    );

    if (result?.opened) {
      elements.bridgeStatus.textContent = "Lorekeeper sidebar opened";
    } else if (result?.reason) {
      elements.bridgeStatus.textContent = `Sidebar note: ${result.reason}`;
    }

    return result;
  } catch {
    return {
      opened: false,
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
      await importProviderResponse(result.response.text);
      elements.bridgeStatus.textContent = "ChatGPT response imported for canon review";
      return;
    }

    if (result.response?.needsManualSubmit) {
      elements.bridgeStatus.textContent = "Prompt is in ChatGPT; press the send arrow";
      state.bridge = {
        mode: "extension",
        ready: true,
        lastRun: result,
      };
      render();
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

      wrapper.append(title, ...messageBodyElements(message.body, message.role));
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

function renderParty(campaign, canonicalCampaign = campaign) {
  const canonIds = new Set(canonicalCampaign.party.map((member) => member.id));
  elements.partyCount.textContent = String(campaign.party.length);
  elements.partyList.replaceChildren(
    ...campaign.party.map((member) =>
      recordElement({
        title: member.name,
        body: `${member.ancestryClass || "unknown role"}${formatHp(member.stats?.hp)}${member.notes?.length ? ` - ${member.notes[0]}` : ""}`,
        pending: !canonIds.has(member.id),
      }),
    ),
  );
}

function renderPeople(campaign, canonicalCampaign = campaign) {
  const canonIds = new Set(canonicalCampaign.people.map((person) => person.id));
  elements.peopleCount.textContent = String(campaign.people.length);
  elements.peopleList.replaceChildren(
    ...emptyOrRecords(
      campaign.people.map((person) =>
        binderRecordElement({
          title: person.name,
          subtitle: person.role || person.type || "person",
          body: detailLines([
            person.summary,
            ...(person.notes ?? []),
            person.locationId ? `Location: ${labelById(campaign, person.locationId)}` : "",
            person.relatedIds?.length ? `Related: ${person.relatedIds.map((id) => labelById(campaign, id)).join(", ")}` : "",
          ]),
          pending: !canonIds.has(person.id),
        }),
      ),
      "No people recorded yet.",
    ),
  );
}

function renderPlaces(campaign, canonicalCampaign = campaign) {
  const canonIds = new Set(canonicalCampaign.places.map((place) => place.id));
  const currentPlaceId = campaign.scene.currentPlaceId;
  const places = [...campaign.places].sort((a, b) => {
    if (a.id === currentPlaceId) {
      return -1;
    }
    if (b.id === currentPlaceId) {
      return 1;
    }
    return a.name.localeCompare(b.name);
  });

  elements.placeCount.textContent = String(places.length);
  elements.placeList.replaceChildren(
    ...emptyOrRecords(
      places.map((place) =>
        binderRecordElement({
          title: place.name,
          subtitle: place.id === currentPlaceId ? `${place.type || "place"} / current` : place.type || place.region || "place",
          body: detailLines([
            place.summary,
            place.region ? `Region: ${place.region}` : "",
            ...(place.notes ?? []),
            place.connectedPlaceIds?.length
              ? `Connected: ${place.connectedPlaceIds.map((id) => labelById(campaign, id)).join(", ")}`
              : "",
          ]),
          pending: !canonIds.has(place.id),
        }),
      ),
      "No places recorded yet.",
    ),
  );
}

function renderThings(campaign, canonicalCampaign = campaign) {
  const canonItemIds = new Set(canonicalCampaign.items.map((item) => item.id));
  const canonInventoryIds = new Set(canonicalCampaign.inventory.map((entry) => entry.id || entry.itemId));
  const canonAssetIds = new Set(canonicalCampaign.assets.map((asset) => asset.id));
  const things = [
    ...campaign.items.map((item) => ({
      id: item.id,
      title: item.name,
      subtitle: item.type || "item",
      body: detailLines([item.summary, ...(item.notes ?? [])]),
      pending: !canonItemIds.has(item.id),
    })),
    ...campaign.inventory.map((entry) => {
      const item = findById(campaign.items, entry.itemId);
      return {
        id: entry.id || entry.itemId,
        title: entry.name || item?.name || entry.itemId,
        subtitle: `${entry.quantity ?? 1} carried by ${entry.carriedBy || entry.holderId || "party"}`,
        body: detailLines([entry.notes, item?.summary, ...(item?.notes ?? [])]),
        pending: !canonInventoryIds.has(entry.id || entry.itemId),
      };
    }),
    ...campaign.assets.map((asset) => ({
      id: asset.id,
      title: asset.name,
      subtitle: asset.kind || "asset",
      body: detailLines([asset.path, ...(asset.notes ?? [])]),
      pending: !canonAssetIds.has(asset.id),
    })),
  ].sort((a, b) => a.title.localeCompare(b.title));

  elements.thingCount.textContent = String(things.length);
  elements.thingList.replaceChildren(
    ...emptyOrRecords(
      things.map((thing) =>
        binderRecordElement({
          title: thing.title,
          subtitle: thing.subtitle,
          body: thing.body,
          pending: thing.pending,
        }),
      ),
      "No things recorded yet.",
    ),
  );
}

function formatHp(hp) {
  if (!hp) {
    return "";
  }

  if (typeof hp === "string" || typeof hp === "number") {
    return `, HP ${hp}`;
  }

  if (hp.current !== undefined && hp.max !== undefined) {
    return `, HP ${hp.current}/${hp.max}`;
  }

  return "";
}

function renderQuests(campaign, canonicalCampaign = campaign) {
  const canonIds = new Set(canonicalCampaign.quests.map((quest) => quest.id));
  const active = campaign.quests.filter((quest) => quest.status !== "completed").slice(0, 8);
  elements.questCount.textContent = String(active.length);
  elements.questList.replaceChildren(
    ...emptyOrRecords(
      active.map((quest) =>
        binderRecordElement({
          title: quest.title,
          subtitle: quest.status || "thread",
          body: detailLines([
            quest.stakes,
            ...(quest.openQuestions ?? []).map((question) => `Open: ${question}`),
            quest.relatedIds?.length ? `Related: ${quest.relatedIds.map((id) => labelById(campaign, id)).join(", ")}` : "",
          ]),
          pending: !canonIds.has(quest.id),
        }),
      ),
      "No active threads.",
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
  render();
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

function binderRecordElement({ title, subtitle, body, pending = false }) {
  const wrapper = document.createElement("details");
  wrapper.className = pending ? "binder-record pending-record" : "binder-record";

  const summary = document.createElement("summary");
  const titleNode = document.createElement("strong");
  titleNode.textContent = title || "Untitled";
  const subtitleNode = document.createElement("span");
  subtitleNode.textContent = subtitle || "record";
  summary.append(titleNode, subtitleNode);

  const copy = document.createElement("p");
  copy.textContent = body || "No details recorded.";
  wrapper.append(summary, copy);

  if (pending) {
    const pendingLabel = document.createElement("small");
    pendingLabel.textContent = "Pending canon review";
    wrapper.append(pendingLabel);
  }

  return wrapper;
}

function emptyOrRecords(records, message) {
  if (records.length > 0) {
    return records;
  }

  const empty = document.createElement("p");
  empty.className = "empty-state";
  empty.textContent = message;
  return [empty];
}

function detailLines(values) {
  return values
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join(" ");
}

function labelById(campaign, id) {
  return (
    findById(campaign.party, id)?.name ||
    findById(campaign.people, id)?.name ||
    findById(campaign.places, id)?.name ||
    findById(campaign.items, id)?.name ||
    findById(campaign.quests, id)?.title ||
    id
  );
}

function recordElement({ title, body, pending = false }) {
  const wrapper = document.createElement("article");
  wrapper.className = pending ? "record pending-record" : "record";

  const heading = document.createElement("h3");
  heading.textContent = title;

  const copy = document.createElement("p");
  copy.textContent = body || "No notes recorded.";

  wrapper.append(heading, copy);
  if (pending) {
    const pendingLabel = document.createElement("small");
    pendingLabel.textContent = "Pending canon review";
    wrapper.append(pendingLabel);
  }
  return wrapper;
}

function cleanProviderResponseForPlay(text) {
  const withoutUpdates = stripLorekeeperUpdates(text);
  return stripTrailingStatusBlock(withoutUpdates).trim() || "The DM response was imported for review.";
}

function stripTrailingStatusBlock(text) {
  const statusMarker = text.search(
    /(?:^|\n)\s*(?:Current Scene|Scene Status|Scene|Location|Time|Party Status|Immediate Tension|Choices Ahead|Next Choices)\s*:/i,
  );

  if (statusMarker === -1) {
    return text;
  }

  const narrativeBeforeMarker = text.slice(0, statusMarker).trim();
  return narrativeBeforeMarker.length >= 160 ? narrativeBeforeMarker : text;
}

function messageBodyElements(text, role = "dm") {
  const blocks = normalizeMessageBlocks(text, role);

  if (!blocks.length) {
    const paragraph = document.createElement("p");
    paragraph.textContent = "No visible narration returned.";
    return [paragraph];
  }

  return blocks.map((block) => {
    if (block.type === "list") {
      const list = document.createElement("ul");
      block.items.forEach((itemText) => {
        const item = document.createElement("li");
        item.textContent = itemText;
        list.append(item);
      });
      return list;
    }

    const paragraph = document.createElement("p");
    paragraph.textContent = block.text;
    return paragraph;
  });
}

function normalizeMessageBlocks(text, role) {
  const rawBlocks = text
    .trim()
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  if (!rawBlocks.length) {
    return [];
  }

  if (role !== "dm" && role !== "provider") {
    return rawBlocks.map(textBlockToRenderableBlock);
  }

  const normalized = [];
  let proseGroup = [];

  rawBlocks.forEach((block, index) => {
    const renderable = textBlockToRenderableBlock(block);
    if (renderable.type === "list") {
      flushProseGroup();
      normalized.push(renderable);
      return;
    }

    if (shouldKeepDmBlockSeparate(renderable.text, index, rawBlocks.length)) {
      flushProseGroup();
      normalized.push(renderable);
      return;
    }

    proseGroup.push(renderable.text);
    const joinedLength = proseGroup.join(" ").length;
    if (proseGroup.length >= 4 || joinedLength >= 480) {
      flushProseGroup();
    }
  });

  flushProseGroup();
  return normalized;

  function flushProseGroup() {
    if (!proseGroup.length) {
      return;
    }

    normalized.push({
      type: "paragraph",
      text: proseGroup.join(" "),
    });
    proseGroup = [];
  }
}

function textBlockToRenderableBlock(block) {
  const lines = block.split(/\n/).map((line) => line.trim()).filter(Boolean);
  const isList = lines.length > 1 && lines.every((line) => /^[-*]\s+/.test(line));

  if (isList) {
    return {
      type: "list",
      items: lines.map((line) => line.replace(/^[-*]\s+/, "")),
    };
  }

  return {
    type: "paragraph",
    text: lines.join(" "),
  };
}

function shouldKeepDmBlockSeparate(text, index, totalBlocks) {
  if (text.length > 260) {
    return true;
  }

  if (index === totalBlocks - 1 && /\?\s*$/.test(text) && text.length <= 120) {
    return true;
  }

  if (/^(what do you do|what now|your move|choose|options?)\b/i.test(text)) {
    return true;
  }

  return false;
}
