import { buildContextPack } from "../src/context-packs/build-context-pack.js";
import { findById } from "../src/campaign-state/formatters.js";
import { normalizeCampaign } from "../src/campaign-state/schema.js";
import { createSampleCampaign } from "../src/campaign-state/sample-campaign.js";
import { createStarterCampaign } from "../src/campaign-state/starter-campaign.js";
import { getActiveProviderConversation } from "../src/campaign-state/provider-conversations.js";
import { createReviewBatch } from "../src/canon-review/proposals.js";
import { extractLorekeeperUpdates, stripLorekeeperUpdates } from "../src/canon-review/extract-updates.js";
import { createPlayerTurn } from "../src/play-loop/session-turn.js";

const bundleUrl = "/data/imports/veil-of-the-towers.bundle.json";
const apiCampaignUrl = "/api/campaign";
const apiCampaignsUrl = "/api/campaigns";
const apiSelectCampaignUrl = "/api/campaign/select";
const apiNewCampaignUrl = "/api/campaign/new";
const apiHideCampaignUrl = "/api/campaign/hide";
const apiImportedCampaignUrl = "/api/campaign/imported";
const apiCommitReviewUrl = "/api/review/commit";
const apiCampaignRecordUrl = "/api/campaign/record";
const apiCampaignMessageUrl = "/api/campaign/message";
const apiProviderConversationUrl = "/api/provider/conversation";
const extensionRequestType = "lorekeeper.appBridge.request";
const extensionResponseType = "lorekeeper.appBridge.response";
const defaultCompanionOptions = {
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
  editingRecord: null,
  activeCharacterSheet: null,
};

const elements = {
  title: document.querySelector("#campaign-title"),
  campaignSelect: document.querySelector("#campaign-select"),
  deleteCampaign: document.querySelector("#delete-campaign"),
  sceneLocation: document.querySelector("#scene-location"),
  providerStatus: document.querySelector("#provider-status"),
  providerActivity: document.querySelector("#provider-activity"),
  saveStatus: document.querySelector("#save-status"),
  openSetup: document.querySelector("#open-setup"),
  setupDialog: document.querySelector("#setup-dialog"),
  closeSetup: document.querySelector("#close-setup"),
  characterSheetDialog: document.querySelector("#character-sheet-dialog"),
  characterSheetForm: document.querySelector("#character-sheet-form"),
  closeCharacterSheet: document.querySelector("#close-character-sheet"),
  characterSheetTitle: document.querySelector("#character-sheet-title"),
  characterSheetSubtitle: document.querySelector("#character-sheet-subtitle"),
  sheetName: document.querySelector("#sheet-name"),
  sheetAncestryClass: document.querySelector("#sheet-ancestry-class"),
  sheetRole: document.querySelector("#sheet-role"),
  sheetLevel: document.querySelector("#sheet-level"),
  sheetXp: document.querySelector("#sheet-xp"),
  sheetHpCurrent: document.querySelector("#sheet-hp-current"),
  sheetHpMax: document.querySelector("#sheet-hp-max"),
  sheetAc: document.querySelector("#sheet-ac"),
  sheetProf: document.querySelector("#sheet-prof"),
  sheetBackground: document.querySelector("#sheet-background"),
  sheetStr: document.querySelector("#sheet-str"),
  sheetDex: document.querySelector("#sheet-dex"),
  sheetCon: document.querySelector("#sheet-con"),
  sheetInt: document.querySelector("#sheet-int"),
  sheetWis: document.querySelector("#sheet-wis"),
  sheetCha: document.querySelector("#sheet-cha"),
  sheetSkills: document.querySelector("#sheet-skills"),
  sheetAbilities: document.querySelector("#sheet-abilities"),
  sheetSpells: document.querySelector("#sheet-spells"),
  sheetNotes: document.querySelector("#sheet-notes"),
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
  sessionLabel: document.querySelector("#session-label"),
  bridgeStatus: document.querySelector("#bridge-status"),
  checkSidecar: document.querySelector("#check-sidecar"),
  newProviderChat: document.querySelector("#new-provider-chat"),
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
  deleteCampaignDialog: document.querySelector("#delete-campaign-dialog"),
  deleteCampaignForm: document.querySelector("#delete-campaign-form"),
  deleteCampaignTitle: document.querySelector("#delete-campaign-title"),
  deleteCampaignMessage: document.querySelector("#delete-campaign-message"),
  deleteCampaignName: document.querySelector("#delete-campaign-name"),
  closeDeleteCampaignDialog: document.querySelector("#close-delete-campaign-dialog"),
  cancelDeleteCampaign: document.querySelector("#cancel-delete-campaign"),
  confirmDeleteCampaign: document.querySelector("#confirm-delete-campaign"),
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

elements.openSetup.addEventListener("click", () => {
  elements.setupDialog.showModal();
});

elements.closeSetup.addEventListener("click", () => {
  elements.setupDialog.close();
});

elements.closeCharacterSheet.addEventListener("click", () => {
  elements.characterSheetDialog.close();
});

elements.characterSheetForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await saveCharacterSheet();
});

elements.campaignSelect.addEventListener("change", async () => {
  const sqlitePath = elements.campaignSelect.value;
  if (sqlitePath === "__new__") {
    renderCampaignSelector();
    openCampaignDialog();
    return;
  }

  if (!sqlitePath || sqlitePath === state.sqlitePath) {
    return;
  }

  await selectCampaignByPath(sqlitePath);
});

elements.deleteCampaign.addEventListener("click", () => {
  openDeleteCampaignDialog();
});

elements.checkSidecar.addEventListener("click", async () => {
  const result = await ensureCompanionSidecar({ openIfMissing: false });
  if (result?.found) {
    await ensureCompanionSidecar({ openIfMissing: true, focusProvider: true });
    return;
  }

  elements.bridgeStatus.textContent = "No saved campaign chat found; use New Campaign Chat first";
});

elements.newProviderChat.addEventListener("click", async () => {
  await startNewProviderConversation();
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

document.querySelectorAll("[data-add-domain]").forEach((button) => {
  button.addEventListener("click", () => openRecordDialog(button.dataset.addDomain));
});

elements.closeRecordDialog.addEventListener("click", () => {
  state.editingRecord = null;
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

elements.closeDeleteCampaignDialog.addEventListener("click", () => {
  elements.deleteCampaignDialog.close();
});

elements.cancelDeleteCampaign.addEventListener("click", () => {
  elements.deleteCampaignDialog.close();
});

elements.deleteCampaignName.addEventListener("input", () => {
  elements.confirmDeleteCampaign.disabled = elements.deleteCampaignName.value !== state.campaign.title;
});

elements.deleteCampaignForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await hideActiveCampaign();
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
    setProviderActivity("Type a table message first", "idle");
    return;
  }

  setProviderActivity("Building provider prompt...", "working");
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
    setProviderActivity("Opening campaign from SQLite...", "working");
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
    setProviderActivity("Campaign opened", "idle");
  } catch (error) {
    elements.bridgeStatus.textContent = error instanceof Error ? `Open failed: ${error.message}` : "Open failed";
    setProviderActivity("Campaign open failed", "error");
    renderCampaignSelector();
  }
}

async function createNewCampaign({ title, premise }) {
  const trimmedTitle = title.trim() || "New Campaign Binder";
  const trimmedPremise = premise.trim() || "A new D&D 5e-lite campaign ready to grow through play.";
  try {
    elements.bridgeStatus.textContent = "Creating new SQLite campaign...";
    setProviderActivity("Creating campaign SQLite file...", "working");
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
    setProviderActivity("New campaign saved", "idle");
  } catch (error) {
    render();
    elements.bridgeStatus.textContent = error instanceof Error ? `New campaign failed: ${error.message}` : "New campaign failed";
    setProviderActivity("New campaign failed", "error");
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

async function saveRecordFromDialog() {
  const payload = {
    domain: elements.recordDomain.value,
    id: state.editingRecord?.id || undefined,
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
    state.editingRecord = null;
    elements.recordForm.reset();
    elements.bridgeStatus.textContent = `${recordLabel(payload.domain)} saved to SQLite; provider sees it next turn`;
  } catch (error) {
    elements.bridgeStatus.textContent = error instanceof Error ? `Save failed: ${error.message}` : "Save failed";
  }
}

function openRecordDialog(domain, record = null) {
  const config = recordDialogConfig(domain);
  state.editingRecord = record ? { domain, id: record.id } : null;
  elements.recordDomain.value = domain;
  elements.recordDialogTitle.textContent = record ? config.editTitle : config.title;
  elements.recordNameLabel.textContent = config.nameLabel;
  elements.recordRoleLabel.textContent = config.roleLabel;
  elements.recordName.placeholder = config.namePlaceholder;
  elements.recordRole.placeholder = config.rolePlaceholder;
  elements.recordNotes.placeholder = config.notesPlaceholder;
  elements.recordPathRow.hidden = domain !== "assets";
  elements.recordForm.reset();
  elements.recordDomain.value = domain;
  if (record) {
    elements.recordName.value = record.name || record.title || "";
    elements.recordRole.value = recordRoleValue(domain, record);
    elements.recordNotes.value = recordNotesValue(domain, record);
    elements.recordPath.value = record.path || "";
  }
  elements.recordDialog.showModal();
  elements.recordName.focus();
}

function recordDialogConfig(domain) {
  const configs = {
    party: {
      title: "Add Party Member",
      editTitle: "Edit Party Member",
      nameLabel: "Character name",
      roleLabel: "Ancestry / class",
      namePlaceholder: "Evelynn",
      rolePlaceholder: "Forest elf ranger",
      notesPlaceholder: "Personality, goals, stats, familiar, important backstory...",
    },
    people: {
      title: "Add Person",
      editTitle: "Edit Person",
      nameLabel: "Name",
      roleLabel: "Role / type",
      namePlaceholder: "Mira Vale",
      rolePlaceholder: "Herbalist, rival, guard captain...",
      notesPlaceholder: "What is canon about this person?",
    },
    places: {
      title: "Add Place",
      editTitle: "Edit Place",
      nameLabel: "Place name",
      roleLabel: "Place type",
      namePlaceholder: "Brindle Hollow",
      rolePlaceholder: "frontier town, ruin, forest road...",
      notesPlaceholder: "Sights, factions, dangers, connections, known facts...",
    },
    quests: {
      title: "Add Thread",
      editTitle: "Edit Thread",
      nameLabel: "Thread title",
      roleLabel: "Status",
      namePlaceholder: "Find the missing wolf companion",
      rolePlaceholder: "active",
      notesPlaceholder: "Stakes, clues, unresolved questions...",
    },
    lore: {
      title: "Add Lore Note",
      editTitle: "Edit Lore Note",
      nameLabel: "Lore title",
      roleLabel: "Tags",
      namePlaceholder: "Moonlit wolf omen",
      rolePlaceholder: "omen, forest, wolves",
      notesPlaceholder: "Canon note text...",
    },
    assets: {
      title: "Add Source Image",
      editTitle: "Edit Source Image",
      nameLabel: "Asset name",
      roleLabel: "Kind",
      namePlaceholder: "Brindle Hollow map",
      rolePlaceholder: "image",
      notesPlaceholder: "What should Lorekeeper remember about this source image?",
    },
    items: {
      title: "Add Thing",
      editTitle: "Edit Thing",
      nameLabel: "Thing name",
      roleLabel: "Kind / type",
      namePlaceholder: "Silver lockpick",
      rolePlaceholder: "tool, clue, artifact, weapon...",
      notesPlaceholder: "What is known about it, who has it, and why it matters...",
    },
  };

  return configs[domain] ?? configs.lore;
}

function recordRoleValue(domain, record) {
  if (domain === "party") {
    return record.ancestryClass || record.role || record.playerRole || "";
  }

  if (domain === "quests") {
    return record.status || "";
  }

  if (domain === "lore") {
    return (record.tags ?? []).join(", ");
  }

  return record.role || record.type || record.kind || record.region || "";
}

function recordNotesValue(domain, record) {
  if (domain === "quests") {
    return [record.stakes, ...(record.openQuestions ?? []).map((question) => `Open: ${question}`)].filter(Boolean).join("\n");
  }

  return [record.summary, record.description, ...(record.notes ?? [])].filter(Boolean).join("\n");
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
  const currentPlace = findById(campaign.places, campaign.scene.currentPlaceId);
  const activeSession = activeSessionRecord(campaign);

  elements.title.textContent = campaign.title;
  elements.sessionLabel.textContent = activeSession?.title || "Campaign Play";
  elements.sceneLocation.textContent = currentPlace?.name ?? "Current scene";
  elements.providerStatus.textContent = "Provider: ChatGPT campaign chat/manual";
  if (state.bridge.mode === "extension") {
    elements.providerStatus.textContent = state.bridge.ready
      ? "Provider: campaign chat ready"
      : "Provider: campaign chat waiting";
  }
  elements.saveStatus.textContent = `Binder: ${state.sourceMode} / SQLite target`;
  if (state.sqlitePath) {
    elements.saveStatus.textContent = "SQLite: active campaign file";
  }

  renderPlayLog();
  renderParty(campaign);
  renderPeople(campaign);
  renderPlaces(campaign);
  renderThings(campaign);
  renderQuests(campaign);
  renderPrompt(state.prompt);
  renderReviewBatch();
  renderCampaignSelector();
}

function renderCampaignSelector() {
  const campaigns = state.campaigns ?? [];
  elements.deleteCampaign.disabled = !state.sqlitePath || !state.campaign?.title;

  if (!campaigns.length) {
    const option = document.createElement("option");
    option.value = state.sqlitePath ?? "";
    option.textContent = state.campaign?.title ?? "No campaigns found";
    option.selected = true;
    elements.campaignSelect.replaceChildren(option, newCampaignOption());
    return;
  }

  elements.campaignSelect.replaceChildren(
    ...campaigns.map((campaign) => {
      const option = document.createElement("option");
      option.value = campaign.sqlitePath;
      option.textContent = campaign.title;
      option.selected = campaign.sqlitePath === state.sqlitePath;
      return option;
    }),
    newCampaignOption(),
  );
}

function newCampaignOption() {
  const option = document.createElement("option");
  option.value = "__new__";
  option.textContent = "+ New campaign...";
  return option;
}

function openDeleteCampaignDialog() {
  if (!state.sqlitePath || !state.campaign?.title) {
    elements.bridgeStatus.textContent = "No active campaign file to hide";
    return;
  }

  elements.deleteCampaignTitle.textContent = `Hide ${state.campaign.title}`;
  elements.deleteCampaignMessage.textContent =
    `This will hide "${state.campaign.title}" from the campaign selector. The SQLite file stays on disk for now.`;
  elements.deleteCampaignName.value = "";
  elements.confirmDeleteCampaign.disabled = true;
  elements.deleteCampaignDialog.showModal();
  elements.deleteCampaignName.focus();
}

async function hideActiveCampaign() {
  if (elements.deleteCampaignName.value !== state.campaign.title) {
    elements.bridgeStatus.textContent = "Campaign name did not match";
    return;
  }

  try {
    elements.bridgeStatus.textContent = "Hiding campaign...";
    const response = await fetch(apiHideCampaignUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        sqlitePath: state.sqlitePath,
        campaignTitle: state.campaign.title,
      }),
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    const payload = await response.json();
    setCampaignFromPayload(payload, "campaign_hidden_context");
    seedPlayLog();
    render();
    elements.deleteCampaignDialog.close();
    elements.bridgeStatus.textContent = "Campaign hidden from selector";
  } catch (error) {
    elements.bridgeStatus.textContent = error instanceof Error ? `Hide failed: ${error.message}` : "Hide failed";
  }
}

async function importProviderResponse(responseText) {
  if (!responseText) {
    elements.bridgeStatus.textContent = "Paste a provider response first";
    setProviderActivity("Paste a provider response first", "idle");
    return;
  }

  const extraction = extractLorekeeperUpdates(responseText);
  const cleanedText = cleanProviderResponseForPlay(responseText);
  const tableMessages = splitProviderTableMessages(cleanedText, state.campaign, extraction.proposedChanges);
  for (const message of tableMessages) {
    await appendPlayMessage(message);
  }

  const reviewBatch = createReviewBatch({
    campaignId: state.campaign.id,
    source: "manual_import",
    rawResponse: responseText,
    proposedChanges: extraction.proposedChanges,
  });

  const commitResult = reviewBatch.proposedChanges.length > 0 ? await commitExtractedChanges(reviewBatch) : null;

  elements.responseImport.value = "";
  if (extraction.error) {
    elements.bridgeStatus.textContent = `DM response imported; ${extraction.error}`;
    setProviderActivity("Imported provider response; update JSON needs attention", "error");
  } else if (extraction.proposedChanges.length > 0 && !commitResult) {
    elements.bridgeStatus.textContent = "State save failed; response text was still imported";
    setProviderActivity("Imported response; state save failed", "error");
  } else {
    elements.bridgeStatus.textContent =
      extraction.proposedChanges.length > 0
        ? `${commitResult?.applied?.length ?? 0} state change${commitResult?.applied?.length === 1 ? "" : "s"} saved`
        : "DM response imported with no proposed changes";
    setProviderActivity("Imported provider response and saved campaign state", "idle");
  }
  render();
}

function splitProviderTableMessages(text, campaign, proposedChanges = []) {
  const speakerLookup = buildPartySpeakerLookup(campaign, proposedChanges);
  if (!text.trim()) {
    return [
      {
        role: "dm",
        title: "DM",
        body: "The DM response was imported for review.",
        source: "provider_response",
      },
    ];
  }

  const messages = [];
  let dmLines = [];
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);

  for (const line of lines) {
    const speakerLine = parseSpeakerLine(line, speakerLookup);
    if (speakerLine) {
      flushDmLines();
      messages.push({
        role: "party",
        title: speakerLine.name,
        body: speakerLine.body || "Acts at the table.",
        source: "provider_response",
      });
      continue;
    }

    dmLines.push(line);
  }

  flushDmLines();

  return messages.length
    ? messages
    : [
        {
          role: "dm",
          title: "DM",
          body: text,
          source: "provider_response",
        },
      ];

  function flushDmLines() {
    if (!dmLines.length) {
      return;
    }

    messages.push({
      role: "dm",
      title: "DM",
      body: dmLines.join("\n\n"),
      source: "provider_response",
    });
    dmLines = [];
  }
}

function buildPartySpeakerLookup(campaign, proposedChanges = []) {
  const records = [
    ...(campaign.party ?? []),
    ...proposedChanges
      .filter((change) => normalizeChangeDomain(change.domain) === "party")
      .map((change) => change.data ?? {}),
  ];
  const names = records
    .map((record) => record.name || record.title)
    .filter(Boolean)
    .map((name) => String(name).trim())
    .filter(Boolean);
  const firstNames = new Map();

  names.forEach((name) => {
    const first = name.split(/\s+/)[0];
    if (!first) {
      return;
    }
    const key = first.toLowerCase();
    firstNames.set(key, firstNames.has(key) ? null : name);
  });

  const lookup = new Map();
  names.forEach((name) => lookup.set(name.toLowerCase(), name));
  for (const [first, fullName] of firstNames) {
    if (fullName) {
      lookup.set(first, fullName);
    }
  }

  return [...lookup.entries()]
    .sort((a, b) => b[0].length - a[0].length)
    .map(([alias, name]) => ({ alias, name }));
}

function parseSpeakerLine(line, speakerLookup) {
  const normalized = line.replace(/^[-*]\s+/, "").replace(/^\*\*(.+?)\*\*/, "$1").trim();
  for (const speaker of speakerLookup) {
    const escaped = escapeRegExp(speaker.alias);
    const pattern = new RegExp(`^(?:["“”']?)(?:\\*\\*)?${escaped}(?:\\*\\*)?\\s*[:\\-]\\s*(.+)$`, "i");
    const match = normalized.match(pattern);
    if (match) {
      return {
        name: speaker.name,
        body: match[1].trim(),
      };
    }
  }

  return null;
}

function normalizeChangeDomain(domain) {
  if (domain === "party_member" || domain === "player_character") {
    return "party";
  }
  return domain;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function commitExtractedChanges(reviewBatch) {
  try {
    elements.bridgeStatus.textContent = "Saving extracted campaign state...";
    const response = await fetch(apiCommitReviewUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        reviewBatch,
      }),
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    const result = await response.json();
    state.campaign = normalizeCampaign(result.campaign);
    state.contextPack = buildContextPack(state.campaign, {
      purpose: "post_auto_commit_context",
    });
    state.reviewBatch = null;
    state.sqlitePath = result.sqlitePath ?? state.sqlitePath;
    elements.bridgeStatus.textContent = `${result.applied.length} state change${result.applied.length === 1 ? "" : "s"} saved to SQLite`;
    render();
    return result;
  } catch (error) {
    elements.bridgeStatus.textContent = "State save failed; response text was still imported";
    return null;
  }
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

async function ensureCompanionSidecar({ openIfMissing = false, focusProvider = false, forceNewConversation = false } = {}) {
  const probe = await probeExtensionBridge();
  if (!probe.available) {
    state.bridge = {
      mode: "manual",
      ready: false,
      lastRun: null,
    };
    elements.bridgeStatus.textContent = "Extension not connected; reload Firefox extension";
    setProviderActivity("Provider bridge unavailable; manual copy/import ready", "error");
    return probe;
  }

  if (!openIfMissing) {
    return handleCompanionCheckResult(probe.result);
  }

  const message = {
    type: "lorekeeper.ensureCompanionSession",
    options: {
      ...campaignCompanionOptions(),
      readyTimeoutMs: 30000,
      focusProvider,
      forceNewConversation,
      returnToCaller: !focusProvider,
    },
  };

  try {
    elements.bridgeStatus.textContent = "Checking campaign ChatGPT conversation...";
    setProviderActivity("Checking ChatGPT campaign chat...", "working");
    const result = await sendExtensionMessage(message, 35000);
    return handleCompanionCheckResult(result);
  } catch (error) {
    state.bridge = {
      mode: "manual",
      ready: false,
      lastRun: null,
    };
    elements.bridgeStatus.textContent = "Extension not connected; reload Firefox extension";
    setProviderActivity("Provider bridge unavailable; manual copy/import ready", "error");
    return {
      ready: false,
      error: error instanceof Error ? error.message : "Extension bridge unavailable.",
    };
  }
}

async function startNewProviderConversation() {
  try {
    elements.bridgeStatus.textContent = "Creating fresh campaign chat record...";
    setProviderActivity("Creating campaign chat record...", "working");
    const response = await fetch(apiProviderConversationUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        providerId: defaultCompanionOptions.providerId,
        projectHint: state.campaign.providerSettings?.projectHint || defaultCompanionOptions.projectHint,
        status: "planned",
        notes: "Fresh provider conversation requested from Lorekeeper UI.",
      }),
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    const payload = await response.json();
    state.campaign = normalizeCampaign(payload.campaign);
    state.campaigns = payload.campaigns ?? state.campaigns;
    state.sqlitePath = payload.sqlitePath ?? state.sqlitePath;
    state.bridge = {
      mode: "manual",
      ready: false,
      lastRun: null,
    };
    const conversation = getActiveProviderConversation(state.campaign, defaultCompanionOptions.providerId);
    elements.bridgeStatus.textContent = `Opening fresh campaign chat: ${conversation.conversationHint}`;
    setProviderActivity(`Opening ChatGPT chat for ${conversation.conversationHint}...`, "working");
    render();
    const result = await ensureCompanionSidecar({
      openIfMissing: true,
      focusProvider: true,
      forceNewConversation: true,
      allowPendingConversation: true,
    });
    if (result.ready) {
      await bootstrapProviderConversation();
    }
  } catch (error) {
    elements.bridgeStatus.textContent = error instanceof Error ? `New chat failed: ${error.message}` : "New chat failed";
    setProviderActivity("New provider chat failed", "error");
  }
}

async function bootstrapProviderConversation() {
  const conversation = getActiveProviderConversation(state.campaign, defaultCompanionOptions.providerId);
  const prompt = [
    "# Lorekeeper Campaign Chat Bootstrap",
    "",
    `This provider chat is for the Lorekeeper campaign: ${conversation.conversationHint}.`,
    `Campaign title: ${state.campaign.title}.`,
    `Local campaign id: ${state.campaign.id}.`,
    "",
    "Please name or summarize this chat using that campaign name and id if your UI supports it.",
    "Do not add campaign canon from this bootstrap message.",
    "Lorekeeper SQLite is the source of truth; provider chat history is only a sidecar.",
    "",
    "Reply with one short sentence confirming the campaign chat is ready.",
  ].join("\n");

  try {
    elements.bridgeStatus.textContent = `Creating provider chat entry for ${conversation.conversationHint}...`;
    setProviderActivity(`Bootstrapping ${conversation.conversationHint} in ChatGPT...`, "working");
    const result = await sendExtensionMessage(
      {
        type: "lorekeeper.runCompanionPrompt",
        prompt,
        options: {
          ...campaignCompanionOptions(),
          readyTimeoutMs: 30000,
          responseTimeoutMs: 45000,
          returnToCaller: false,
          allowPendingConversation: true,
        },
      },
      75000,
    );

    if (result.found || result.created) {
      await persistProviderConversationFromBridge(result);
    }

    if (result.response?.needsManualSubmit) {
      elements.bridgeStatus.textContent = `Bootstrap prompt inserted; press send in ${conversation.conversationHint}`;
      setProviderActivity("Bootstrap prompt inserted; waiting for manual send", "waiting");
      return;
    }

    elements.bridgeStatus.textContent = `Provider chat created for ${conversation.conversationHint}`;
    setProviderActivity(`Provider chat ready: ${conversation.conversationHint}`, "idle");
  } catch (error) {
    elements.bridgeStatus.textContent = error instanceof Error
      ? `Provider chat opened; bootstrap failed: ${error.message}`
      : "Provider chat opened; bootstrap failed";
    setProviderActivity("Provider chat opened; bootstrap needs manual follow-up", "error");
  }
}

async function runPromptThroughSidecar(prompt) {
  if (!prompt.trim()) {
    elements.bridgeStatus.textContent = "Build a provider prompt first";
    setProviderActivity("Build a provider prompt first", "idle");
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
      setProviderActivity("Extension unavailable; prompt copied for manual paste", "error");
      return;
    }

    elements.bridgeStatus.textContent = "Sending turn to campaign ChatGPT conversation...";
    setProviderActivity("Submitting turn to ChatGPT...", "working");
    const progress = startSidecarProgress();
    const result = await sendExtensionMessage(
      {
        type: "lorekeeper.runCompanionPrompt",
        prompt,
        options: {
          ...campaignCompanionOptions(),
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
    if (result.found || result.created) {
      await persistProviderConversationFromBridge(result);
    }

    if (result.sent && result.response?.text) {
      setProviderActivity("ChatGPT response received; importing...", "working");
      await importProviderResponse(result.response.text);
      return;
    }

    if (result.response?.needsManualSubmit) {
      elements.bridgeStatus.textContent = "Prompt is in the campaign chat; press the send arrow";
      setProviderActivity("Prompt inserted in ChatGPT; press send in provider tab", "waiting");
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
      setProviderActivity("ChatGPT needs login; prompt copied", "error");
      render();
      return;
    }

    await copyPromptToClipboard(prompt, {
      successMessage: "Sidecar did not return a response; prompt copied",
      failureMessage: "Sidecar did not return a response; copy from prompt drawer",
    });
    setProviderActivity("No provider response returned; prompt copied", "error");
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
    setProviderActivity("Provider run failed; prompt copied for manual paste", "error");
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
    setProviderActivity(messages.successMessage ?? "Prompt copied", "idle");
    return true;
  } catch {
    elements.bridgeStatus.textContent = messages.failureMessage ?? "Clipboard blocked; prompt is in the drawer";
    setProviderActivity(messages.failureMessage ?? "Clipboard blocked; prompt is in the drawer", "error");
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
  setProviderActivity(`UI error: ${message}`, "error");
}

function setProviderActivity(message, status = "idle") {
  if (!elements.providerActivity) {
    return;
  }

  elements.providerActivity.textContent = message;
  elements.providerActivity.dataset.state = status;
}

let activeProgressTimers = [];

function startSidecarProgress() {
  stopSidecarProgress();
  activeProgressTimers = [
    window.setTimeout(() => {
      elements.bridgeStatus.textContent = "Waiting for ChatGPT response...";
      setProviderActivity("Waiting on ChatGPT response...", "waiting");
    }, 8000),
    window.setTimeout(() => {
      elements.bridgeStatus.textContent = "Still waiting on the campaign chat...";
      setProviderActivity("Still waiting on ChatGPT...", "waiting");
    }, 30000),
    window.setTimeout(() => {
      elements.bridgeStatus.textContent = "Campaign chat is taking a while; manual fallback remains available";
      setProviderActivity("ChatGPT is taking a while; manual fallback is ready", "waiting");
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
        options: campaignCompanionOptions(),
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

function campaignCompanionOptions() {
  const campaign = state.campaign;
  if (!campaign) {
    return defaultCompanionOptions;
  }

  const conversation = getActiveProviderConversation(campaign, defaultCompanionOptions.providerId);

  return {
    ...defaultCompanionOptions,
    campaignId: campaign.id,
    campaignTitle: campaign.title,
    providerConversationId: conversation.id,
    conversationHint: conversation.conversationHint,
    projectHint: conversation.projectHint || defaultCompanionOptions.projectHint,
    projectUrl: conversation.projectUrl || undefined,
  };
}

async function handleCompanionCheckResult(result) {
  state.bridge = {
    mode: "extension",
    ready: Boolean(result.ready),
    lastRun: result,
  };

  if (result.found || result.created) {
    await persistProviderConversationFromBridge(result);
  }

  if (result.ready) {
    elements.bridgeStatus.textContent = result.created
      ? `Campaign chat opened for ${result.settings?.conversationHint ?? "this campaign"}`
      : `Campaign chat ready for ${result.settings?.conversationHint ?? "this campaign"}`;
    setProviderActivity(`ChatGPT campaign chat ready: ${result.settings?.conversationHint ?? state.campaign.title}`, "idle");
  } else if (result.loginRequired) {
    elements.bridgeStatus.textContent = "ChatGPT needs login, project selection, or campaign chat selection";
    setProviderActivity("ChatGPT needs login or campaign chat selection", "error");
  } else {
    elements.bridgeStatus.textContent = "No campaign ChatGPT conversation found";
    setProviderActivity("No campaign ChatGPT conversation found", "idle");
  }

  render();
  return result;
}

async function persistProviderConversationFromBridge(result) {
  const settings = result.settings ?? {};
  const tab = result.tab ?? {};
  const status = result.status ?? {};

  try {
    const response = await fetch(apiProviderConversationUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        providerId: settings.providerId || defaultCompanionOptions.providerId,
        providerConversationId: settings.providerConversationId,
        projectHint: settings.projectHint,
        projectUrl: settings.projectUrl,
        conversationHint: settings.conversationHint,
        providerUrl: tab.url || status.url,
        providerTitle: tab.title || status.title,
        status: result.ready ? "active" : "needs_user_action",
      }),
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    const payload = await response.json();
    state.campaign = normalizeCampaign(payload.campaign);
    state.campaigns = payload.campaigns ?? state.campaigns;
    state.sqlitePath = payload.sqlitePath ?? state.sqlitePath;
  } catch {
    elements.bridgeStatus.textContent = "Campaign chat metadata could not be saved";
  }
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

      const avatar = document.createElement("span");
      avatar.className = "message-avatar";
      avatar.textContent = speakerInitial(message);

      const bubble = document.createElement("div");
      bubble.className = "message-bubble";

      const header = document.createElement("header");
      header.className = "message-header";

      const title = document.createElement("strong");
      title.textContent = speakerName(message);

      const timestamp = document.createElement("time");
      timestamp.dateTime = message.createdAt || "";
      timestamp.textContent = formatMessageTime(message.createdAt);

      header.append(title, timestamp);
      bubble.append(header, ...messageBodyElements(message.body, message.role));
      if (message.meta) {
        const meta = document.createElement("small");
        meta.className = "message-meta";
        meta.textContent = message.meta;
        bubble.append(meta);
      }
      wrapper.append(avatar, bubble);
      return wrapper;
    }),
  );
  elements.playLog.scrollTop = elements.playLog.scrollHeight;
}

function activeSessionRecord(campaign) {
  const activeId = campaign.sessionLog?.activeSessionId;
  return (campaign.sessionLog?.sessions ?? []).find((session) => session.id === activeId) ?? campaign.sessionLog?.sessions?.[0] ?? null;
}

function speakerName(message) {
  if (message.role === "dm" || message.role === "provider") {
    return message.title || "DM";
  }

  if (message.role === "system") {
    return message.title || "Lorekeeper";
  }

  return message.title || "Player";
}

function speakerInitial(message) {
  const name = speakerName(message).trim();
  if (message.role === "dm" || message.role === "provider") {
    return "DM";
  }
  return name.slice(0, 1).toUpperCase() || "?";
}

function formatMessageTime(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function renderParty(campaign) {
  elements.partyCount.textContent = String(campaign.party.length);
  elements.partyList.replaceChildren(
    ...campaign.party.map((member) =>
      recordElement({
        title: member.name,
        body: `${member.ancestryClass || "unknown role"}${formatHp(member.stats?.hp)}${member.notes?.length ? ` - ${member.notes[0]}` : ""}`,
        onEdit: () => openCharacterSheet(member),
      }),
    ),
  );
}

function openCharacterSheet(member) {
  state.activeCharacterSheet = member.id;
  renderCharacterSheet(member);
  elements.characterSheetDialog.showModal();
}

function renderCharacterSheet(member) {
  elements.characterSheetTitle.textContent = member.name || "Unnamed party member";
  elements.characterSheetSubtitle.textContent = [
    member.ancestryClass,
    member.playerRole,
    member.role,
    member.type,
  ].filter(Boolean).join(" / ") || "Party member";
  const hp = normalizeHpForForm(member.stats?.hp ?? member.hp ?? member.hitPoints);
  const scores = characterAbilityScores(member);

  elements.sheetName.value = member.name || "";
  elements.sheetAncestryClass.value = member.ancestryClass || member.class || "";
  elements.sheetRole.value = member.playerRole || member.role || "";
  elements.sheetLevel.value = member.level ?? member.stats?.level ?? member.characterLevel ?? "";
  elements.sheetXp.value = member.experience ?? member.xp ?? member.stats?.experience ?? member.stats?.xp ?? "";
  elements.sheetHpCurrent.value = hp.current ?? "";
  elements.sheetHpMax.value = hp.max ?? "";
  elements.sheetAc.value = member.stats?.armorClass ?? member.armorClass ?? member.ac ?? "";
  elements.sheetProf.value = member.proficiencyBonus ?? member.stats?.proficiencyBonus ?? member.prof ?? "";
  elements.sheetBackground.value = member.background || member.backstory || member.summary || member.description || "";
  elements.sheetStr.value = scores.STR ?? "";
  elements.sheetDex.value = scores.DEX ?? "";
  elements.sheetCon.value = scores.CON ?? "";
  elements.sheetInt.value = scores.INT ?? "";
  elements.sheetWis.value = scores.WIS ?? "";
  elements.sheetCha.value = scores.CHA ?? "";
  elements.sheetSkills.value = characterSkills(member).join("\n");
  elements.sheetAbilities.value = characterAbilities(member).join("\n");
  elements.sheetSpells.value = uniqueTextList([member.spells, member.stats?.spells]).join("\n");
  elements.sheetNotes.value = (member.notes ?? []).join("\n");
}

async function saveCharacterSheet() {
  const member = findById(state.campaign.party, state.activeCharacterSheet);
  if (!member) {
    elements.bridgeStatus.textContent = "Character not found";
    return;
  }

  const payload = {
    domain: "party",
    id: member.id,
    name: elements.sheetName.value.trim(),
    role: elements.sheetRole.value.trim(),
    playerRole: elements.sheetRole.value.trim(),
    ancestryClass: elements.sheetAncestryClass.value.trim(),
    level: parseOptionalNumber(elements.sheetLevel.value),
    experience: parseOptionalNumber(elements.sheetXp.value),
    proficiencyBonus: parseOptionalNumber(elements.sheetProf.value),
    background: elements.sheetBackground.value.trim(),
    stats: {
      hp: buildHpPayload(),
      armorClass: parseOptionalNumber(elements.sheetAc.value),
      abilityScores: buildAbilityScorePayload(),
      spells: splitMultiline(elements.sheetSpells.value),
    },
    skills: splitMultiline(elements.sheetSkills.value),
    abilities: splitMultiline(elements.sheetAbilities.value),
    spells: splitMultiline(elements.sheetSpells.value),
    notes: splitMultiline(elements.sheetNotes.value),
  };

  if (!payload.name) {
    elements.bridgeStatus.textContent = "Character name is required";
    return;
  }

  try {
    elements.bridgeStatus.textContent = "Saving character sheet...";
    setProviderActivity(`Saving ${payload.name} to SQLite...`, "working");
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
    setCampaignFromPayload(result, "character_sheet_update");
    seedPlayLog();
    render();
    const updated = findById(state.campaign.party, member.id);
    if (updated) {
      state.activeCharacterSheet = updated.id;
      renderCharacterSheet(updated);
    }
    elements.bridgeStatus.textContent = `${payload.name} saved to SQLite`;
    setProviderActivity(`${payload.name} saved`, "idle");
  } catch (error) {
    elements.bridgeStatus.textContent = error instanceof Error ? `Character save failed: ${error.message}` : "Character save failed";
    setProviderActivity("Character save failed", "error");
  }
}

function buildHpPayload() {
  const current = parseOptionalNumber(elements.sheetHpCurrent.value);
  const max = parseOptionalNumber(elements.sheetHpMax.value);
  if (current === null && max === null) {
    return null;
  }
  return {
    current,
    max,
  };
}

function buildAbilityScorePayload() {
  return removeNullEntries({
    STR: parseOptionalNumber(elements.sheetStr.value),
    DEX: parseOptionalNumber(elements.sheetDex.value),
    CON: parseOptionalNumber(elements.sheetCon.value),
    INT: parseOptionalNumber(elements.sheetInt.value),
    WIS: parseOptionalNumber(elements.sheetWis.value),
    CHA: parseOptionalNumber(elements.sheetCha.value),
  });
}

function normalizeHpForForm(hp) {
  if (!hp) {
    return {};
  }
  if (typeof hp === "number" || typeof hp === "string") {
    return {
      current: hp,
      max: "",
    };
  }
  return hp;
}

function characterAbilityScores(member) {
  const source = member.abilityScores ?? member.ability_scores ?? member.stats?.abilityScores ?? member.stats?.ability_scores ?? member.stats?.abilities;
  if (!source || Array.isArray(source) || typeof source !== "object") {
    return {};
  }

  const aliases = {
    STR: ["STR", "str", "strength"],
    DEX: ["DEX", "dex", "dexterity"],
    CON: ["CON", "con", "constitution"],
    INT: ["INT", "int", "intelligence"],
    WIS: ["WIS", "wis", "wisdom"],
    CHA: ["CHA", "cha", "charisma"],
  };

  return Object.fromEntries(
    Object.entries(aliases)
      .map(([label, keys]) => {
        const score = keys.map((key) => source[key]).find((value) => value !== undefined && value !== null);
        return score !== undefined ? [label, score] : null;
      })
      .filter(Boolean),
  );
}

function characterSkills(member) {
  return uniqueTextList([
    member.skills,
    member.specialties,
    member.proficiencies,
    member.expertise,
    member.stats?.skills,
    member.stats?.proficiencies,
  ]);
}

function characterAbilities(member) {
  return uniqueTextList([
    member.abilities,
    member.features,
    member.traits,
  ]);
}

function uniqueTextList(values) {
  const seen = new Set();
  return values
    .flatMap((value) => {
      if (!value) {
        return [];
      }
      if (Array.isArray(value)) {
        return value;
      }
      if (typeof value === "object") {
        return Object.entries(value).map(([key, entry]) => `${key}: ${entry}`);
      }
      return String(value).split(/[,;\n]+/);
    })
    .map((value) => String(value).trim())
    .filter((value) => {
      if (!value || seen.has(value.toLowerCase())) {
        return false;
      }
      seen.add(value.toLowerCase());
      return true;
    });
}

function splitMultiline(value) {
  return String(value || "")
    .split(/[,;\n]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseOptionalNumber(value) {
  const text = String(value ?? "").trim();
  if (!text) {
    return null;
  }
  const number = Number(text);
  return Number.isFinite(number) ? number : text;
}

function removeNullEntries(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== null && value !== ""));
}

function renderPeople(campaign) {
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
          onEdit: () => openRecordDialog("people", person),
        }),
      ),
      "No people recorded yet.",
    ),
  );
}

function renderPlaces(campaign) {
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
          onEdit: () => openRecordDialog("places", place),
        }),
      ),
      "No places recorded yet.",
    ),
  );
}

function renderThings(campaign) {
  const things = [
    ...campaign.items.map((item) => ({
      id: item.id,
      domain: "items",
      record: item,
      title: item.name,
      subtitle: item.type || "item",
      body: detailLines([item.summary, ...(item.notes ?? [])]),
    })),
    ...campaign.inventory.map((entry) => {
      const item = findById(campaign.items, entry.itemId);
      return {
        id: entry.id || entry.itemId,
        domain: "items",
        record: {
          ...(item ?? {}),
          id: item?.id ?? entry.itemId,
          name: entry.name || item?.name || entry.itemId,
          type: item?.type || "inventory",
          summary: detailLines([entry.notes, item?.summary]),
          notes: item?.notes ?? [],
        },
        title: entry.name || item?.name || entry.itemId,
        subtitle: `${entry.quantity ?? 1} carried by ${entry.carriedBy || entry.holderId || "party"}`,
        body: detailLines([entry.notes, item?.summary, ...(item?.notes ?? [])]),
      };
    }),
    ...campaign.assets.map((asset) => ({
      id: asset.id,
      domain: "assets",
      record: asset,
      title: asset.name,
      subtitle: asset.kind || "asset",
      body: detailLines([asset.path, ...(asset.notes ?? [])]),
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
          onEdit: () => openRecordDialog(thing.domain, thing.record),
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

function renderQuests(campaign) {
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
          onEdit: () => openRecordDialog("quests", quest),
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
  const lastCommitted = latestCommittedReviewBatch(state.campaign);
  const changes = lastCommitted?.applied ?? [];
  elements.reviewCount.textContent = String(changes.length);
  elements.reviewList.replaceChildren(
    ...emptyOrRecords(
      changes.slice(0, 6).map((change) =>
        recordElement({
          title: `${change.operation} / ${change.domain}`,
          body: change.summary,
        }),
      ),
      "Imported state changes save automatically.",
    ),
  );
}

function latestCommittedReviewBatch(campaign) {
  return [...(campaign.reviewLog ?? [])]
    .filter((batch) => batch.status === "committed")
    .sort((a, b) => String(b.decidedAt || b.updatedAt || b.createdAt).localeCompare(String(a.decidedAt || a.updatedAt || a.createdAt)))[0] ?? null;
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

function binderRecordElement({ title, subtitle, body, onEdit }) {
  const wrapper = document.createElement("details");
  wrapper.className = "binder-record";

  const summary = document.createElement("summary");
  const titleNode = document.createElement("strong");
  titleNode.textContent = title || "Untitled";
  const subtitleNode = document.createElement("span");
  subtitleNode.textContent = subtitle || "record";
  summary.append(titleNode, subtitleNode);

  const copy = document.createElement("p");
  copy.textContent = body || "No details recorded.";
  wrapper.append(summary, copy);

  if (onEdit) {
    const editButton = document.createElement("button");
    editButton.className = "mini-action";
    editButton.type = "button";
    editButton.textContent = "Edit";
    editButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      onEdit();
    });
    wrapper.append(editButton);
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

function recordElement({ title, body, onEdit }) {
  const wrapper = document.createElement("article");
  wrapper.className = "record";
  if (onEdit) {
    wrapper.tabIndex = 0;
    wrapper.title = "Click to open";
    wrapper.addEventListener("click", onEdit);
    wrapper.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onEdit();
      }
    });
  }

  const heading = document.createElement("h3");
  heading.textContent = title;

  const copy = document.createElement("p");
  copy.textContent = body || "No notes recorded.";

  wrapper.append(heading, copy);
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
  const blocks = extractChoicePanel(normalizeMessageBlocks(text, role), role);

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

    if (block.type === "choices") {
      const panel = document.createElement("div");
      panel.className = "choice-panel";
      const title = document.createElement("strong");
      title.className = "choice-title";
      title.textContent = block.prompt;
      panel.append(title);

      const list = document.createElement("ol");
      block.items.forEach((itemText) => {
        const item = document.createElement("li");
        item.textContent = itemText;
        list.append(item);
      });
      panel.append(list);

      const hint = document.createElement("small");
      hint.className = "choice-hint";
      hint.textContent = "Pick one, combine ideas, add flavor, or try something else reasonable.";
      panel.append(hint);
      return panel;
    }

    if (block.type === "combat") {
      const panel = document.createElement("div");
      panel.className = "combat-turn";
      block.lines.forEach((line) => {
        const row = document.createElement("p");
        row.textContent = line;
        panel.append(row);
      });
      return panel;
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

  const trailingChoices = extractTrailingChoiceBlocks(rawBlocks);
  if (trailingChoices) {
    return [
      ...normalizeDmProseBlocks(rawBlocks.slice(0, trailingChoices.promptIndex)),
      {
        type: "choices",
        prompt: trailingChoices.prompt,
        items: trailingChoices.items,
      },
    ];
  }

  return normalizeDmProseBlocks(rawBlocks);
}

function normalizeDmProseBlocks(rawBlocks) {
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

function extractTrailingChoiceBlocks(rawBlocks) {
  for (let index = rawBlocks.length - 2; index >= 0; index -= 1) {
    const prompt = extractChoicePrompt(rawBlocks[index]);
    if (!prompt) {
      continue;
    }

    const choices = rawBlocks.slice(index + 1)
      .map(cleanChoiceText)
      .filter(Boolean);
    if (choices.length >= 2 && choices.every(isLikelyChoiceText)) {
      return {
        promptIndex: index,
        prompt,
        items: choices,
      };
    }
  }

  return null;
}

function extractChoicePrompt(text) {
  const match = text.match(/(?:^|\.|\?|!)\s*((?:What (?:does|do) .*? do|What do you do|What now|Your move|Choose)[?!.]?)\s*$/i);
  return match?.[1]?.trim() ?? null;
}

function cleanChoiceText(text) {
  return text
    .trim()
    .replace(/^[-*]\s+/, "")
    .replace(/^\d+[.)]\s*/, "")
    .trim();
}

function isLikelyChoiceText(text) {
  return text.length <= 220 && !/^["“].+["”]$/.test(text);
}

function textBlockToRenderableBlock(block) {
  const lines = block.split(/\n/).map((line) => line.trim()).filter(Boolean);
  const isList = lines.length > 1 && lines.every((line) => /^[-*]\s+/.test(line));
  const isCombatBlock = lines.some((line) => /^Options:$/i.test(line)) &&
    lines.some((line) => /^(Chosen|Damage|Narration):/i.test(line));

  if (isList) {
    return {
      type: "list",
      items: lines.map((line) => line.replace(/^[-*]\s+/, "")),
    };
  }

  if (isCombatBlock) {
    return {
      type: "combat",
      lines,
    };
  }

  return {
    type: "paragraph",
    text: lines.join(" "),
  };
}

function extractChoicePanel(blocks, role) {
  if (role !== "dm" && role !== "provider") {
    return blocks;
  }

  if (blocks.length < 2) {
    return blocks;
  }

  const last = blocks.at(-1);
  const previous = blocks.at(-2);
  if (last?.type !== "paragraph" || previous?.type !== "paragraph") {
    return blocks;
  }

  const prompt = extractChoicePrompt(previous.text);
  if (!prompt) {
    return blocks;
  }

  const choices = splitChoiceText(last.text);
  if (choices.length < 2) {
    return blocks;
  }

  const previousText = previous.text.slice(0, previous.text.length - prompt.length).trim();
  const nextBlocks = blocks.slice(0, -2);
  if (previousText) {
    nextBlocks.push({
      ...previous,
      text: previousText,
    });
  }

  nextBlocks.push({
    type: "choices",
    prompt,
    items: choices,
  });
  return nextBlocks;
}

function splitChoiceText(text) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return [];
  }

  const numbered = normalized
    .split(/\s+(?=\d+[.)]\s+)/)
    .map((item) => item.replace(/^\d+[.)]\s*/, "").trim())
    .filter(Boolean);
  if (numbered.length >= 2) {
    return numbered;
  }

  const sentenceChoices = normalized
    .split(/(?<=\.)\s+(?=[A-Z])/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 12 && !/^something else\.?$/i.test(item));
  const hasFallback = /(?:^|\s)Something else\.?$/i.test(normalized);
  if (sentenceChoices.length >= 2) {
    return hasFallback ? [...sentenceChoices, "Something else."] : sentenceChoices;
  }

  return [];
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
