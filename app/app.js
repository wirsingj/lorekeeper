import { buildContextPack } from "../src/context-packs/build-context-pack.js";
import { findById } from "../src/campaign-state/formatters.js";
import { normalizeCampaign } from "../src/campaign-state/schema.js";
import { createSampleCampaign } from "../src/campaign-state/sample-campaign.js";
import { createStarterCampaign } from "../src/campaign-state/starter-campaign.js";
import { getActiveProviderConversation } from "../src/campaign-state/provider-conversations.js";
import { createReviewBatch } from "../src/canon-review/proposals.js";
import { extractLorekeeperUpdates, stripLorekeeperUpdates } from "../src/canon-review/extract-updates.js";
import { createPlayerTurn } from "../src/play-loop/session-turn.js";
import { normalizeOllamaModelId, recommendedOllamaModels } from "../src/ai/provider-settings.js";
import { renderTurnResponseForImport } from "../src/model-contract/turn-json-contract.js";
import { buildAggregatedPlayerTurnFromInputs } from "../src/multiplayer/turn-inputs.js";
import { createProviderOrchestrator } from "../src/engine/provider-orchestrator.js";
import { buildCombatTrackerView, combatActorType, normalizedCombatTurnOrder } from "./combat-tracker-view.js";
import { dedupeMechanicsRows, splitMechanicsFromBlock } from "./mechanics-formatting.js";
import { createTurnFlowRuntime } from "./turn-flow-runtime.js";

const launchParams = new URLSearchParams(window.location.search);
const clientMode = launchParams.get("mode") === "client";
const apiToken = launchParams.get("lkToken") || "";
const nativeFetch = window.fetch.bind(window);
const bundleUrl = "/data/imports/veil-of-the-towers.bundle.json";
const apiCampaignUrl = "/api/campaign";
const apiCampaignsUrl = "/api/campaigns";
const apiSelectCampaignUrl = "/api/campaign/select";
const apiNewCampaignUrl = "/api/campaign/new";
const apiDeleteCampaignUrl = "/api/campaign/delete";
const apiImportedCampaignUrl = "/api/campaign/imported";
const apiCommitReviewUrl = "/api/review/commit";
const apiCampaignRecordUrl = "/api/campaign/record";
const apiCampaignMessageUrl = "/api/campaign/message";
const apiCampaignMessageUpdateUrl = "/api/campaign/message/update";
const apiProviderConversationUrl = "/api/provider/conversation";
const apiProviderStatusUrl = "/api/provider/status";
const apiProviderSettingsUrl = "/api/provider/settings";
const apiProviderGenerateTurnUrl = "/api/provider/generate-turn";
const apiDiagnosticsUrl = "/api/diagnostics";
const apiOllamaPullUrl = "/api/ollama/pull";
const apiOllamaTestUrl = "/api/ollama/test";
const apiMultiplayerSnapshotUrl = "/api/multiplayer/snapshot";
const apiMultiplayerStartUrl = "/api/multiplayer/start";
const apiMultiplayerStopUrl = "/api/multiplayer/stop";
const apiMultiplayerInviteUrl = "/api/multiplayer/invite";
const apiMultiplayerJoinUrl = "/api/multiplayer/join";
const apiMultiplayerGuestSnapshotUrl = "/api/multiplayer/guest-snapshot";
const apiMultiplayerActionUrl = "/api/multiplayer/action";
const apiMultiplayerPassUrl = "/api/multiplayer/pass";
const apiMultiplayerApproveUrl = "/api/multiplayer/join/approve";
const apiMultiplayerDenyUrl = "/api/multiplayer/join/deny";
const apiMultiplayerRevokeControllerUrl = "/api/multiplayer/controller/revoke";
const apiMultiplayerAiControllerUrl = "/api/multiplayer/controller/ai";
const apiMultiplayerHostControllerUrl = "/api/multiplayer/controller/host";
const apiMultiplayerClearPendingUrl = "/api/multiplayer/pending/clear";
const extensionRequestType = "lorekeeper.appBridge.request";
const extensionResponseType = "lorekeeper.appBridge.response";
const commandDeckHeightStorageKey = "lorekeeper.commandDeckHeight";
const guestSessionStorageKey = "lorekeeper.guestSession";
const defaultCompanionOptions = {
  providerId: "chatgpt",
  projectHint: "LoreKeeper",
  returnToCaller: true,
};
const userSettingsStorageKey = "lorekeeper.lastProviderSettings";
const appModeStorageKey = "lorekeeper.appMode";
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
    lastImportedProviderText: "",
  },
  providerStatus: null,
  streamingMessage: null,
  editingRecord: null,
  activeCharacterSheet: null,
  activeCharacterSheetAutofill: null,
  diagnosticsEvents: [],
  pendingChoiceSelection: null,
  forceScrollToBottom: false,
  multiplayerSnapshot: null,
  guestSession: loadGuestSession(),
  guestSnapshot: null,
  guestPollInFlight: false,
  autoResolvingCombatInput: false,
  lastAutoResolvedRemoteKey: "",
  autoResolvingEnemyTurn: false,
  lastAutoResolvedEnemyKey: "",
  autoResumingPendingTurn: false,
  lastAutoResumedMessageId: "",
  repairingCombatPromptTurn: false,
  lastCombatPromptRepairKey: "",
};

window.fetch = (input, init = {}) => nativeFetch(input, withLorekeeperApiAuth(input, init));

state.turnFlow = createTurnFlowRuntime();
const providerOrchestrator = createProviderOrchestrator({
  fetchFn: (...args) => window.fetch(...args),
  endpoint: apiProviderGenerateTurnUrl,
  setTimeoutFn: (...args) => window.setTimeout(...args),
  clearTimeoutFn: (...args) => window.clearTimeout(...args),
});

function withLorekeeperApiAuth(input, init = {}) {
  if (!apiToken || !shouldAttachLorekeeperApiToken(input)) {
    return init;
  }
  const headers = new Headers(init.headers || {});
  headers.set("x-lorekeeper-api-token", apiToken);
  if (state?.campaign?.id) {
    headers.set("x-lorekeeper-campaign-id", state.campaign.id);
  }
  if (state?.sqlitePath) {
    headers.set("x-lorekeeper-sqlite-path", state.sqlitePath);
  }
  return {
    ...init,
    headers,
  };
}

function shouldAttachLorekeeperApiToken(input) {
  const raw = typeof input === "string" ? input : input?.url;
  if (!raw) {
    return false;
  }
  try {
    const url = new URL(raw, window.location.href);
    return url.origin === window.location.origin && url.pathname.startsWith("/api/");
  } catch {
    return String(raw).startsWith("/api/");
  }
}

const elements = {
  title: document.querySelector("#campaign-title"),
  campaignSelect: document.querySelector("#campaign-select"),
  deleteCampaign: document.querySelector("#delete-campaign"),
  sceneLocation: document.querySelector("#scene-location"),
  providerStatus: document.querySelector("#provider-status"),
  providerActivity: document.querySelector("#provider-activity"),
  providerActivityLabel: document.querySelector("#provider-activity-label"),
  recheckProvider: document.querySelector("#recheck-provider"),
  repairRetry: document.querySelector("#repair-retry"),
  repairInspect: document.querySelector("#repair-inspect"),
  repairImportAnyway: document.querySelector("#repair-import-anyway"),
  saveStatus: document.querySelector("#save-status"),
  openSetup: document.querySelector("#open-setup"),
  nudgeDm: document.querySelector("#nudge-dm"),
  setupDialog: document.querySelector("#setup-dialog"),
  closeSetup: document.querySelector("#close-setup"),
  appModeSelect: document.querySelector("#app-mode-select"),
  appModeNote: document.querySelector("#app-mode-note"),
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
  autoFillCharacterSheet: document.querySelector("#auto-fill-character-sheet"),
  partyList: document.querySelector("#party-list"),
  partyCount: document.querySelector("#party-count"),
  combatTrackerSection: document.querySelector("#combat-tracker-section"),
  combatRound: document.querySelector("#combat-round"),
  combatActiveActor: document.querySelector("#combat-active-actor"),
  combatTurnOrder: document.querySelector("#combat-turn-order"),
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
  promptDrawer: document.querySelector("#prompt-drawer"),
  sessionLabel: document.querySelector("#session-label"),
  bridgeCard: document.querySelector("#bridge-card"),
  bridgeStatus: document.querySelector("#bridge-status"),
  checkSidecar: document.querySelector("#check-sidecar"),
  newProviderChat: document.querySelector("#new-provider-chat"),
  copyProviderPrompt: document.querySelector("#copy-provider-prompt"),
  providerMode: document.querySelector("#provider-mode"),
  ollamaStatus: document.querySelector("#ollama-status"),
  ollamaModel: document.querySelector("#ollama-model"),
  ollamaModelSummary: document.querySelector("#ollama-model-summary"),
  refreshOllama: document.querySelector("#refresh-ollama"),
  testOllama: document.querySelector("#test-ollama"),
  pullOllamaModel: document.querySelector("#pull-ollama-model"),
  ollamaBenchmark: document.querySelector("#ollama-benchmark"),
  refreshDiagnostics: document.querySelector("#refresh-diagnostics"),
  copyDiagnostics: document.querySelector("#copy-diagnostics"),
  diagnosticsOutput: document.querySelector("#diagnostics-output"),
  diagnosticsStatus: document.querySelector("#diagnostics-status"),
  generationTimeout: document.querySelector("#generation-timeout"),
  outputLimit: document.querySelector("#output-limit"),
  fastMode: document.querySelector("#fast-mode"),
  cancelGeneration: document.querySelector("#cancel-generation"),
  localTableState: document.querySelector("#local-table-state"),
  localTableAddress: document.querySelector("#local-table-address"),
  startLocalTable: document.querySelector("#start-local-table"),
  stopLocalTable: document.querySelector("#stop-local-table"),
  joinCampaign: document.querySelector("#join-campaign"),
  joinCampaignMain: document.querySelector("#join-campaign-main"),
  syncGuestTable: document.querySelector("#sync-guest-table"),
  resolvePartyInputs: document.querySelector("#resolve-party-inputs"),
  connectedGuests: document.querySelector("#connected-guests"),
  pendingInputs: document.querySelector("#pending-inputs"),
  joinCampaignDialog: document.querySelector("#join-campaign-dialog"),
  joinCampaignForm: document.querySelector("#join-campaign-form"),
  closeJoinCampaignDialog: document.querySelector("#close-join-campaign-dialog"),
  cancelJoinCampaign: document.querySelector("#cancel-join-campaign"),
  joinInviteLink: document.querySelector("#join-invite-link"),
  joinPlayerName: document.querySelector("#join-player-name"),
  joinStatus: document.querySelector("#join-status"),
  newCampaign: document.querySelector("#new-campaign"),
  loadImported: document.querySelector("#load-imported"),
  playLog: document.querySelector("#play-log"),
  playerForm: document.querySelector("#player-form"),
  playerInput: document.querySelector("#player-input"),
  buildTurn: document.querySelector("#build-turn"),
  responseImport: document.querySelector("#response-import"),
  pasteResponse: document.querySelector("#paste-response"),
  importResponse: document.querySelector("#import-response"),
  commandResizeHandle: document.querySelector("#command-resize-handle"),
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
  newCampaignStartingLocation: document.querySelector("#new-campaign-starting-location"),
  newCampaignTone: document.querySelector("#new-campaign-tone"),
  newCharacterName: document.querySelector("#new-character-name"),
  newCharacterAncestry: document.querySelector("#new-character-ancestry"),
  newCharacterClass: document.querySelector("#new-character-class"),
  newCharacterLevel: document.querySelector("#new-character-level"),
  newCharacterConcept: document.querySelector("#new-character-concept"),
  newCharacterAutoSheet: document.querySelector("#new-character-auto-sheet"),
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
  if (clientMode) {
    refreshGuestSnapshot({ explicit: false }).catch(() => {});
    return;
  }
  refreshProviderStatus({ quiet: true });
});

elements.nudgeDm?.addEventListener("click", async () => {
  await nudgeDm();
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

elements.autoFillCharacterSheet.addEventListener("click", () => {
  autoFillOpenCharacterSheet();
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

elements.recheckProvider.addEventListener("click", async () => {
  await importLatestProviderResponse({ requireNewerThanLastImport: true });
});

elements.repairRetry?.addEventListener("click", async () => {
  await retryTurnRepair();
});

elements.repairInspect?.addEventListener("click", async () => {
  await inspectTurnRepair();
});

elements.repairImportAnyway?.addEventListener("click", async () => {
  await importTurnRepairAnyway();
});

elements.providerMode.addEventListener("change", async () => {
  await saveProviderSettingsFromControls();
});

elements.appModeSelect?.addEventListener("change", async () => {
  await switchAppMode(elements.appModeSelect.value);
});

elements.ollamaModel.addEventListener("change", async () => {
  await saveProviderSettingsFromControls();
});

elements.generationTimeout.addEventListener("change", async () => {
  await saveProviderSettingsFromControls();
});

elements.outputLimit.addEventListener("change", async () => {
  await saveProviderSettingsFromControls();
});

elements.fastMode.addEventListener("change", async () => {
  await saveProviderSettingsFromControls();
});

elements.refreshOllama.addEventListener("click", async () => {
  await refreshProviderStatus();
});

elements.testOllama.addEventListener("click", async () => {
  await testOllamaModel();
});

elements.pullOllamaModel.addEventListener("click", async () => {
  await pullOllamaModel();
});

elements.refreshDiagnostics?.addEventListener("click", async () => {
  await refreshDiagnostics();
});

elements.copyDiagnostics?.addEventListener("click", async () => {
  await copyDiagnosticsToClipboard();
});

elements.cancelGeneration.addEventListener("click", () => {
  cancelActiveGeneration();
});

elements.startLocalTable.addEventListener("click", async () => {
  await startLocalTableFromUi();
});

elements.stopLocalTable.addEventListener("click", async () => {
  await stopLocalTableFromUi();
});

elements.joinCampaign.addEventListener("click", () => {
  openJoinCampaignDialog();
});

elements.joinCampaignMain?.addEventListener("click", () => {
  openJoinCampaignDialog();
});

elements.syncGuestTable?.addEventListener("click", async () => {
  await refreshGuestSnapshot({ explicit: true });
});

elements.resolvePartyInputs.addEventListener("click", async () => {
  await resolveCollectedPartyInputs();
});

elements.closeJoinCampaignDialog.addEventListener("click", () => {
  elements.joinCampaignDialog.close();
});

elements.cancelJoinCampaign.addEventListener("click", () => {
  elements.joinCampaignDialog.close();
});

elements.joinCampaignForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await requestJoinFromUi();
});

setupCommandDeckResize();

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
    startingLocation: elements.newCampaignStartingLocation.value,
    tone: elements.newCampaignTone.value,
    playerCharacter: {
      name: elements.newCharacterName.value,
      ancestry: elements.newCharacterAncestry.value,
      characterClass: elements.newCharacterClass.value,
      level: elements.newCharacterLevel.value,
      concept: elements.newCharacterConcept.value,
      autoSheet: elements.newCharacterAutoSheet.checked,
    },
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

elements.deleteCampaignForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await deleteActiveCampaign();
});

elements.recordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await saveRecordFromDialog();
});

elements.playerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (state.guestSession?.hostBaseUrl && state.guestSession?.connectionId) {
    await submitGuestActionFromUi();
    return;
  }
  await submitPlayerTurnFromInput(elements.playerInput.value);
});

async function nudgeDm() {
  if (clientMode || state.guestSession?.hostBaseUrl) {
    setProviderActivity("Only the host can nudge the DM", "waiting");
    return { providerReceived: false, reason: "guest_mode" };
  }
  if (hasActiveGeneration()) {
    setProviderActivity("DM is already generating", "waiting");
    return { providerReceived: false, reason: "busy" };
  }

  pushDiagnosticsEvent("dm_nudge_requested", {
    campaignId: state.campaign?.id,
    scene: state.campaign?.scene,
    combat: state.campaign?.combat,
  });
  return submitPlayerTurnFromInput(buildDmNudgePrompt(), {
    skipPlayerEcho: true,
    skipPartySeed: true,
    preserveInput: true,
  });
}

function buildDmNudgePrompt() {
  return [
    "(DM nudge: Continue from the current SQLite campaign state without inventing a player action.",
    "Advance the current scene like a real tabletop DM: 3-5 paragraphs with sensory detail, tension, NPC/world reaction, and consequence.",
    "Do not force an option list. Prefer choices.options: [] for narration, consequences, patrol/travel flow, NPC replies, or atmosphere.",
    "Use a direct question instead of a structured option panel unless there is combat, immediate danger, or the user explicitly asks for options.",
    "If combat.inCombat and the current initiative actor is a player or party member, do not roll, deal damage, or advance initiative unless the player submitted an action; instead orient the battlefield and ask for that actor's action.",
    "If combat.inCombat and the current initiative actor is an enemy/DM actor, resolve that enemy turn with mechanics and advance initiative.",
    "If combat/enemies look stale or mismatched with the current scene, propose a compact combat update to clear or correct them.",
    "Do not repeat this instruction in the table narration.)",
  ].join(" ");
}

function normalizeSubmittedPlayerMessage(originalInput, options = {}) {
  const text = String(originalInput ?? "").trim();
  const pendingSelection = state.pendingChoiceSelection;
  state.pendingChoiceSelection = null;
  if (!text || options.skipChoiceExpansion) {
    return text;
  }

  const selectedChoices = expandChoiceSelection(text) || (pendingSelectionMatchesText(pendingSelection, text) ? pendingSelection : null);
  if (!selectedChoices) {
    return text;
  }

  pushDiagnosticsEvent("choice_selection_expanded", selectedChoices);
  state.pendingChoiceSelection = selectedChoices;
  const inWorldText = choiceSelectionInWorldText(selectedChoices, text);
  return [
    inWorldText,
    choiceSelectionMeta(selectedChoices),
  ].join("\n\n");
}

function expandChoiceSelection(text) {
  const choiceTokenText = extractChoiceTokenText(text);
  if (!choiceTokenText) {
    return null;
  }

  const panel = latestChoicePanelFromMessages();
  if (!panel?.items?.length) {
    return null;
  }

  const selectedIndexes = parseChoiceIndexes(choiceTokenText, panel.items.length);
  if (!selectedIndexes.length) {
    return null;
  }

  const labels = selectedIndexes.map((index) => choiceLabelForIndex(index));
  const choices = selectedIndexes.map((index) => panel.items[index]).filter(Boolean);
  if (!choices.length) {
    return null;
  }

  return {
    labels,
    choices,
    optionRecords: selectedIndexes.map((index) => panel.options?.[index] ?? null),
    prompt: panel.prompt,
    selectedOptionIds: selectedIndexes.map((index) => panel.options?.[index]?.id ?? choiceLabelForIndex(index)),
    inWorldText: `I choose ${labels.join(" + ")}: ${choices.join(" Also, ")}`,
  };
}

function extractChoiceTokenText(text) {
  const trimmed = String(text ?? "").trim();
  if (/^(?:[A-Ha-h]|\d+)(?:\s*(?:,|\+|and|&)\s*(?:[A-Ha-h]|\d+))*$/.test(trimmed)) {
    return trimmed;
  }
  const match = trimmed.match(/^(?:i\s+)?(?:choose|chose|pick|picked|select|selected|option|choice)\s+((?:[A-Ha-h]|\d+)(?:\s*(?:,|\+|and|&)\s*(?:[A-Ha-h]|\d+))*)(?:\b|[:.)-])/i);
  return match?.[1] ?? "";
}

function choiceSelectionInWorldText(selection, visibleText = "") {
  const text = String(visibleText ?? "").trim();
  if (!text) {
    return selection.inWorldText;
  }

  const tokenText = extractChoiceTokenText(text);
  if (!tokenText) {
    return text;
  }

  if (isBareChoiceSelectionText(text) || isExactChoiceDraft(selection, text)) {
    return selection.inWorldText;
  }

  // The player edited the clicked choice draft with extra intent. Preserve that
  // text as the actual action while retaining structured selection metadata.
  return text;
}

function isBareChoiceSelectionText(text) {
  const trimmed = String(text ?? "").trim();
  return /^(?:[A-Ha-h]|\d+)(?:\s*(?:,|\+|and|&)\s*(?:[A-Ha-h]|\d+))*$/.test(trimmed) ||
    /^(?:i\s+)?(?:choose|chose|pick|picked|select|selected|option|choice)\s+(?:[A-Ha-h]|\d+)(?:\s*(?:,|\+|and|&)\s*(?:[A-Ha-h]|\d+))*\s*$/i.test(trimmed);
}

function isExactChoiceDraft(selection, text) {
  const normalizedText = compactCompareText(text);
  if (!normalizedText) {
    return false;
  }
  if (normalizedText === compactCompareText(selection.inWorldText)) {
    return true;
  }
  return (selection.selectedOptionIds ?? []).some((id, index) => {
    const choice = selection.choices?.[index] ?? "";
    return normalizedText === compactCompareText(`I choose ${id}: ${choice}`) ||
      normalizedText === compactCompareText(`I choose ${id}. ${choice}`) ||
      normalizedText === compactCompareText(`I choose ${id} ${choice}`) ||
      normalizedText === compactCompareText(`${id}. ${choice}`);
  });
}

function pendingSelectionMatchesText(selection, text = "") {
  if (!selection?.choices?.length) {
    return false;
  }
  const normalizedText = compactCompareText(text);
  if (!normalizedText) {
    return false;
  }
  if (normalizedText === compactCompareText(selection.inWorldText)) {
    return true;
  }
  return selection.selectedOptionIds?.some((id) =>
    new RegExp(`^(?:i\\s+)?(?:choose|chose|pick|picked|select|selected|option|choice)\\s+${escapeRegExp(id)}\\b`, "i").test(text)
  );
}

function choiceSelectionMeta(selection) {
  const combatInstruction = state.campaign?.combat?.inCombat
    ? " This is a combat action for the active initiative actor; resolve it with visible mechanics, HP/resource updates, and advance the turn."
    : "";
  return `(meta: The player selected ${selection.labels.join(", ")} from the latest visible choice panel. Resolve the selected choice text, not the bare numbers/letters. Do not ask the same choice question again unless new information changes the options.${combatInstruction})`;
}

function latestChoicePanelFromMessages() {
  for (const message of [...state.playMessages].reverse()) {
    if (message.role !== "dm" && message.role !== "provider") {
      continue;
    }
    const structured = structuredChoiceBlockFromMessageData(message.data);
    if (structured?.items?.length) {
      return structured;
    }
    const blocks = extractChoicePanel(normalizeMessageBlocks(message.body, message.role), message.role);
    for (let index = blocks.length - 1; index >= 0; index -= 1) {
      if (blocks[index]?.type === "choices") {
        return blocks[index];
      }
    }
  }
  return null;
}

function structuredChoicesForMessage(turnResponse) {
  const choices = turnResponse?.choices;
  if (!choices?.options?.length) {
    return null;
  }
  return {
    prompt: choices.prompt || "What do you do?",
    scope: choices.scope || "",
    forActorId: choices.forActorId ?? null,
    forActor: choices.forActor || "",
    allowOther: choices.allowOther !== false,
    options: choices.options.map((option, index) => ({
      id: String(option.id || choiceLabelForIndex(index)),
      actorId: option.actorId ?? null,
      actor: option.actor || "",
      legalOptionId: option.legalOptionId ?? null,
      text: option.text || option.label || "",
    })).filter((option) => option.text),
  };
}

function structuredChoiceBlockFromMessageData(data = {}) {
  if (data.choiceOwner !== true) {
    return null;
  }
  const choices = data.choices;
  if (!choices?.options?.length) {
    return null;
  }
  return {
    type: "choices",
    prompt: choices.prompt || "What do you do?",
    items: choices.options.map(formatStructuredChoiceOption),
    options: choices.options,
    allowOther: choices.allowOther !== false,
    structured: true,
  };
}

function formatStructuredChoiceOption(option) {
  const actor = option.actor ? `${option.actor}: ` : "";
  return `${actor}${option.text}`;
}

function parseChoiceIndexes(text, maxChoices) {
  const seen = new Set();
  return String(text)
    .split(/\s*(?:,|\+|and|&)\s*/i)
    .map((token) => choiceTokenToIndex(token))
    .filter((index) => Number.isInteger(index) && index >= 0 && index < maxChoices)
    .filter((index) => {
      if (seen.has(index)) {
        return false;
      }
      seen.add(index);
      return true;
    });
}

function choiceTokenToIndex(token) {
  const trimmed = String(token ?? "").trim();
  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed) - 1;
  }
  const letter = trimmed.toUpperCase();
  if (/^[A-H]$/.test(letter)) {
    return letter.charCodeAt(0) - 65;
  }
  return -1;
}

function choiceLabelForIndex(index) {
  return String.fromCharCode(65 + index);
}

function chooseVisibleOption(block, index) {
  const item = block.items?.[index];
  if (!item) {
    return;
  }
  const label = choiceLabelForIndex(index);
  const optionId = block.options?.[index]?.id || label;
  state.pendingChoiceSelection = {
    labels: [label],
    choices: [item],
    optionRecords: [block.options?.[index] ?? null],
    prompt: block.prompt || "",
    selectedOptionIds: [optionId],
    inWorldText: `I choose ${optionId}: ${item}`,
  };
  elements.playerInput.value = `I choose ${optionId}: ${item}`;
  elements.playerInput.focus();
  setProviderActivity(`Selected choice ${optionId}; edit or send`, "idle");
}

async function submitPlayerTurnFromInput(originalInput, options = {}) {
  if (hasActiveGeneration()) {
    elements.bridgeStatus.textContent = "The DM is already resolving a turn.";
    setProviderActivity("Wait for the current DM response before sending again", "waiting");
    return { providerReceived: false, reason: "busy" };
  }
  if (activeTurnRepair() && !options.allowDuringRepair) {
    elements.bridgeStatus.textContent = "Resolve the model repair before sending another turn.";
    setProviderActivity("Repair needed before the next turn. Inspect, Retry, or Import.", "error");
    return { providerReceived: false, reason: "repair_required" };
  }
  const approvedPartyInputs = options.playerInputs ? [] : collectApprovedPartyInputs();
  const stagedRemoteInputs = options.playerInputs ? [] : collectStagedRemoteInputs();
  const normalizedMessage = normalizeSubmittedPlayerMessage(originalInput, options);
  const playerMessage = buildSubmittedTurnMessage({
    playerMessage: normalizedMessage,
    approvedPartyInputs,
    stagedRemoteInputs,
  });
  if (!playerMessage) {
    elements.bridgeStatus.textContent = "Type an action or wait for a staged party input first";
    setProviderActivity("Type an action or stage a party input", "idle");
    return { providerReceived: false, reason: "empty" };
  }

  setProviderActivity("Building provider prompt...", "working");
  const playerInputs = options.playerInputs ?? [
    ...playerInputsFromChoiceSelection(state.pendingChoiceSelection),
    ...approvedPartyInputs,
    ...stagedRemoteInputs,
  ];
  state.currentTurn = createPlayerTurn({
    campaign: state.campaign,
    playerMessage,
    playerInputs,
  });
  state.contextPack = state.currentTurn.contextPack;
  state.prompt = state.currentTurn.providerPrompt;
  const visiblePlayerText = state.currentTurn.parsedMessage?.inWorldText;
  const metaText = (state.currentTurn.parsedMessage?.metaInstructions ?? []).join(" ");
  if (!options.skipPlayerEcho && normalizedMessage && visiblePlayerText) {
    const duplicate = findUnresolvedDuplicatePlayerMessage(visiblePlayerText, metaText);
    if (duplicate) {
      pushDiagnosticsEvent("duplicate_player_turn_echo_suppressed", {
        duplicateOf: duplicate.id,
        body: visiblePlayerText,
      });
    } else {
      await appendPlayMessage({
        role: "player",
        title: "You",
        body: visiblePlayerText,
        meta: metaText,
        source: "player_input",
      });
    }
  } else if (!options.skipPlayerEcho && normalizedMessage && metaText) {
    await appendPlayMessage({
      role: "player",
      title: "You (meta)",
      body: metaText,
      meta: "Out-of-world instruction",
      source: "player_meta",
    });
  }
  if (!options.skipPartySeed && normalizedMessage) {
    await seedPartyFromPlayerOpening(state.currentTurn.parsedMessage?.inWorldText || playerMessage);
    await applyPlayerPartyDirectives(state.currentTurn.parsedMessage, playerMessage);
  }
  state.currentTurn = createPlayerTurn({
    campaign: state.campaign,
    playerMessage,
    playerInputs,
  });
  state.contextPack = state.currentTurn.contextPack;
  state.prompt = state.currentTurn.providerPrompt;
  render();
  const providerMode = currentProviderSettings().preferredProvider;
  const runResult = providerMode === "ollama"
    ? await runPromptThroughLocalProvider(state.currentTurn)
    : await runPromptThroughSidecar(state.prompt);
  if (runResult?.imported && approvedPartyInputs.length) {
    await markApprovedPartyInputsSubmitted(approvedPartyInputs);
  }
  if (runResult?.imported && stagedRemoteInputs.length) {
    await clearSubmittedRemoteInputs(stagedRemoteInputs);
  }
  if (runResult?.providerReceived && !options.preserveInput) {
    elements.playerInput.value = "";
  } else if (!runResult?.providerReceived && !options.preserveInput && !elements.playerInput.value.trim()) {
    elements.playerInput.value = originalInput;
  }
  schedulePostTurnRecovery(runResult?.imported ? "turn_imported" : "turn_not_imported");
  return runResult;
}

function buildSubmittedTurnMessage({ playerMessage, approvedPartyInputs = [], stagedRemoteInputs = [] }) {
  const parts = [];
  if (playerMessage) {
    parts.push(playerMessage);
  }
  if (approvedPartyInputs.length) {
    parts.push(buildApprovedPartyTurnPrompt(approvedPartyInputs));
  }
  if (stagedRemoteInputs.length) {
    parts.push(buildStagedRemoteTurnPrompt(stagedRemoteInputs));
  }
  return parts.join("\n\n").trim();
}

function findUnresolvedDuplicatePlayerMessage(body, meta = "") {
  const normalizedBody = compactCompareText(body);
  const normalizedMeta = compactCompareText(meta);
  if (!normalizedBody) {
    return null;
  }

  for (let index = state.playMessages.length - 1; index >= 0; index -= 1) {
    const message = state.playMessages[index];
    if (message.role === "dm" || message.role === "party" || message.role === "npc") {
      return null;
    }
    if (message.role !== "player") {
      continue;
    }
    if (
      compactCompareText(message.body) === normalizedBody &&
      compactCompareText(cleanMessageMeta(message.meta || "")) === normalizedMeta
    ) {
      return message;
    }
  }

  return null;
}

function compactCompareText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function buildApprovedPartyTurnPrompt(inputs) {
  return [
    "Approved companion contributions:",
    ...inputs.map((input) => `- ${input.characterName || input.characterId || "Companion"}: ${input.text}`),
    "(meta: These companion contributions were approved by the host. Resolve them as party input this turn. Do not add an action for the host-controlled player character unless the player also provided one.)",
  ].join("\n");
}

function buildStagedRemoteTurnPrompt(inputs) {
  return [
    "Staged remote party inputs:",
    ...inputs.map((input) => `- ${input.characterName || input.characterId || "Remote party member"}: ${input.text}`),
    "(meta: These actions came from connected ThinLoreKeeper clients and are staged behind the scenes. Resolve them as player-approved character actions. If combat.inCombat is true, resolve them as combat turns with rolls, mechanics, HP/resource updates, and tactical consequences.)",
  ].join("\n");
}

function clearResolvedRecoveredInputDraft(reason = "unknown") {
  const draft = elements.playerInput.value.trim();
  if (!draft || !state.playMessages.length) {
    return false;
  }
  const draftKey = compactCompareText(draft);
  let matchingPlayerIndex = -1;
  for (let index = state.playMessages.length - 1; index >= 0; index -= 1) {
    const message = state.playMessages[index];
    if (message.role !== "player") {
      continue;
    }
    if (compactCompareText(message.body) === draftKey) {
      matchingPlayerIndex = index;
      break;
    }
  }
  if (matchingPlayerIndex === -1) {
    return false;
  }
  const hasLaterTableResponse = state.playMessages
    .slice(matchingPlayerIndex + 1)
    .some((message) => ["dm", "party", "npc", "provider"].includes(message.role));
  if (!hasLaterTableResponse) {
    return false;
  }
  elements.playerInput.value = "";
  pushDiagnosticsEvent("stale_input_draft_cleared", {
    reason,
    matchedMessageId: state.playMessages[matchingPlayerIndex]?.id,
  });
  return true;
}

function collectApprovedPartyInputs() {
  return state.playMessages
    .filter((message) => message.role === "party" && message.data?.status === "approved_party_input")
    .map((message) => ({
      type: "approved_party_contribution",
      id: message.id,
      characterId: message.data?.characterId || "",
      characterName: message.data?.characterName || message.title || "",
      text: message.body || "",
      ready: true,
    }))
    .filter((input) => input.text);
}

function collectStagedRemoteInputs() {
  const activeCombatActorId = state.campaign?.combat?.inCombat ? state.campaign.combat.currentTurnId : null;
  return (state.campaign?.multiplayer?.pendingTurnInputs ?? [])
    .filter((input) =>
      input.ready &&
      !input.passed &&
      input.text &&
      (!activeCombatActorId || input.characterId === activeCombatActorId)
    )
    .sort((a, b) => String(a.updatedAt || "").localeCompare(String(b.updatedAt || "")))
    .map((input) => ({
      type: "remote_party_action",
      id: input.id,
      playerId: input.playerId,
      playerName: input.playerName,
      characterId: input.characterId,
      characterName: input.characterName,
      text: input.text,
      ready: input.ready,
    }));
}

async function markApprovedPartyInputsSubmitted(inputs) {
  for (const input of inputs) {
    await patchPlayMessage(input.id, {
      meta: "Submitted to DM/model",
      data: {
        status: "submitted_party_input",
        submittedAt: new Date().toISOString(),
      },
    });
  }
}

async function clearSubmittedRemoteInputs(inputs) {
  if (!inputs.length) {
    return;
  }
  const result = await postJson(apiMultiplayerClearPendingUrl, {
    inputIds: inputs.map((input) => input.id),
  });
  setCampaignFromPayload(result, "local_table_pending_cleared");
  state.multiplayerSnapshot = result.multiplayer;
  seedPlayLog();
  render();
}

function playerInputsFromChoiceSelection(selection) {
  if (!selection?.choices?.length) {
    return [];
  }
  return selection.choices.map((text, index) => ({
    type: "choice_selection",
    id: selection.selectedOptionIds?.[index] ?? selection.labels?.[index] ?? choiceLabelForIndex(index),
    label: selection.labels?.[index] ?? choiceLabelForIndex(index),
    characterId: selection.optionRecords?.[index]?.actorId || "",
    characterName: selection.optionRecords?.[index]?.actor || "",
    legalOptionId: selection.optionRecords?.[index]?.legalOptionId || "",
    text,
    prompt: selection.prompt || "",
  }));
}

await boot();
startMultiplayerPolling();

async function boot() {
  if (clientMode) {
    await bootClientMode();
    return;
  }
  await loadCampaign();
  await reconcilePartyDirectivesFromHistory();
  await refreshProviderStatus({ quiet: true });
  await refreshMultiplayerSnapshot({ quiet: true });
  seedPlayLog();
  render();
  clearResolvedRecoveredInputDraft("boot");
  schedulePendingPlayerTurnResume("boot");
  scheduleCombatPromptTurnRepair("boot");
  schedulePostTurnRecovery("boot");
}

async function bootClientMode() {
  document.title = "ThinLoreKeeper";
  state.sourceMode = "guest";
  state.campaigns = [];
  state.sqlitePath = "";
  state.campaign = createGuestShellCampaign();
  state.contextPack = buildContextPack(state.campaign, {
    purpose: "guest_client_shell",
  });
  seedPlayLog();
  render();
  setProviderActivity("ThinLoreKeeper ready. Paste a host invite link to join.", "idle");

  if (state.guestSession?.hostBaseUrl && state.guestSession?.connectionId) {
    try {
      await refreshGuestSnapshot({ explicit: false });
      return;
    } catch {
      setProviderActivity("Saved host connection is unavailable. Paste a fresh invite link.", "waiting");
    }
  }

  window.setTimeout(() => openJoinCampaignDialog(), 200);
}

function startMultiplayerPolling() {
  window.setInterval(async () => {
    if (hasActiveGeneration()) {
      return;
    }
    try {
      if (state.guestSession?.hostBaseUrl && state.guestSession?.connectionId) {
        await refreshGuestSnapshot({ explicit: false });
        return;
      }
      if (state.campaign?.multiplayer?.localTable?.running) {
        const response = await fetch(apiCampaignUrl, { cache: "no-store" });
        if (!response.ok) {
          return;
        }
        const payload = await response.json();
        setCampaignFromPayload(payload, "local_table_poll");
        state.multiplayerSnapshot = payload.campaign?.multiplayer ?? state.multiplayerSnapshot;
        seedPlayLog();
        render();
        schedulePostTurnRecovery("local_table_poll");
      }
    } catch (error) {
      if (state.guestSession?.hostBaseUrl) {
        setProviderActivity(
          error instanceof Error ? `Guest sync waiting: ${error.message}` : "Guest sync waiting on host",
          "waiting",
        );
      }
    }
  }, 2500);
}

async function maybeAutoResolveEnemyCombatTurn() {
  if (
    clientMode ||
    hasActiveGeneration() ||
    activeTurnRepair() ||
    state.autoResolvingEnemyTurn ||
    !state.campaign?.combat?.inCombat
  ) {
    return;
  }
  const currentId = state.campaign.combat.currentTurnId;
  const current = normalizedCombatTurnOrder(state.campaign).find((entry) => entry.id === currentId);
  if (!current || current.type !== "enemy") {
    return;
  }
  const turnKey = `${state.campaign.combat.round ?? 1}:${current.id}`;
  if (turnKey === state.lastAutoResolvedEnemyKey) {
    return;
  }
  state.autoResolvingEnemyTurn = true;
  try {
    setProviderActivity(`Resolving ${current.name}'s enemy turn`, "working");
    const result = await submitPlayerTurnFromInput(
      `(DM combat turn: Resolve ${current.name}'s turn in initiative. Use D&D 5E-style mechanics, rolls, HP/resource updates, tactical narration, then advance to the next initiative actor.)`,
      {
        skipPlayerEcho: true,
        skipPartySeed: true,
        preserveInput: true,
      },
    );
    if (result?.providerReceived || result?.imported) {
      state.lastAutoResolvedEnemyKey = turnKey;
    }
  } finally {
    state.autoResolvingEnemyTurn = false;
  }
}

function schedulePendingPlayerTurnResume(reason = "unknown") {
  if (clientMode || state.guestSession?.hostBaseUrl) {
    return;
  }
  window.setTimeout(() => {
    resumePendingPlayerTurn(reason).catch((error) => {
      pushDiagnosticsEvent("pending_turn_resume_failed", {
        reason,
        message: error instanceof Error ? error.message : String(error ?? "Unknown error"),
      });
    });
  }, 500);
}

function scheduleCombatPromptTurnRepair(reason = "unknown") {
  if (clientMode || state.guestSession?.hostBaseUrl) {
    return;
  }
  window.setTimeout(() => {
    repairStalePromptedCombatTurn(reason).catch((error) => {
      pushDiagnosticsEvent("combat_prompt_turn_repair_failed", {
        reason,
        message: error instanceof Error ? error.message : String(error ?? "Unknown error"),
      });
    });
  }, 650);
}

function schedulePostTurnRecovery(reason = "unknown") {
  if (clientMode || state.guestSession?.hostBaseUrl) {
    return;
  }
  window.setTimeout(() => {
    runPostTurnRecovery(reason).catch((error) => {
      pushDiagnosticsEvent("post_turn_recovery_failed", {
        reason,
        message: error instanceof Error ? error.message : String(error ?? "Unknown error"),
      });
    });
  }, 350);
}

async function runPostTurnRecovery(reason = "unknown") {
  if (hasActiveGeneration() || activeTurnRepair()) {
    return;
  }
  clearResolvedRecoveredInputDraft(`post_turn_${reason}`);
  await repairStalePromptedCombatTurn(`post_turn_${reason}`);
  await maybeAutoResolveEnemyCombatTurn();
  await maybeAutoResolveCombatRemoteInputs();
}

async function repairStalePromptedCombatTurn(reason = "unknown") {
  if (
    hasActiveGeneration() ||
    activeTurnRepair() ||
    state.autoResolvingEnemyTurn ||
    state.repairingCombatPromptTurn ||
    !state.campaign?.combat?.inCombat
  ) {
    return null;
  }

  const repair = createImplicitCombatActorPromptChange(state.playMessages, [], null);
  if (!repair) {
    return null;
  }
  const latestPrompt = latestDmNarration(state.playMessages);
  const repairedActorId = repair.data.promptedActorId || repair.data.currentTurnId;
  const repairKey = `${state.campaign.id || "campaign"}:${state.campaign.combat?.currentTurnId || ""}->${repairedActorId}:${latestPrompt.slice(0, 120)}`;
  if (repairKey === state.lastCombatPromptRepairKey) {
    return null;
  }

  state.lastCombatPromptRepairKey = repairKey;
  state.repairingCombatPromptTurn = true;
  try {
    pushDiagnosticsEvent("combat_prompt_turn_repair_started", {
      reason,
      fromActorId: state.campaign.combat?.currentTurnId || "",
      toActorId: repair.data.promptedActorId || repair.data.currentTurnId,
      latestPrompt: latestPrompt.slice(0, 500),
    });
    const reviewBatch = createReviewBatch({
      campaignId: state.campaign.id,
      source: `combat_prompt_turn_repair_${reason}`,
      rawResponse: latestPrompt,
      proposedChanges: [repair],
    });
    const result = await autoCommitReviewBatch(reviewBatch);
    if (result?.applied?.length) {
      seedPlayLog();
      render();
      setProviderActivity(`Combat turn repaired for ${labelById(state.campaign, repair.data.promptedActorId || repair.data.currentTurnId)}`, "idle");
    }
    return result;
  } finally {
    state.repairingCombatPromptTurn = false;
  }
}

async function resumePendingPlayerTurn(reason = "unknown") {
  if (hasActiveGeneration() || activeTurnRepair() || state.autoResumingPendingTurn || elements.playerInput.value.trim()) {
    return;
  }

  const pending = findPendingPlayerTurnMessage();
  if (!pending || pending.id === state.lastAutoResumedMessageId) {
    return;
  }

  const turnText = pendingPlayerTurnText(pending);
  if (!turnText) {
    return;
  }

  state.lastAutoResumedMessageId = pending.id;
  state.autoResumingPendingTurn = true;
  try {
    pushDiagnosticsEvent("pending_turn_resume_started", {
      reason,
      messageId: pending.id,
      createdAt: pending.createdAt,
      body: pending.body,
      meta: pending.meta,
    });
    setProviderActivity("Resuming unresolved player turn...", "working");
    await submitPlayerTurnFromInput(turnText, {
      skipPlayerEcho: true,
      skipPartySeed: true,
      preserveInput: true,
      resumePendingTurn: true,
    });
  } finally {
    state.autoResumingPendingTurn = false;
  }
}

function findPendingPlayerTurnMessage() {
  for (let index = state.playMessages.length - 1; index >= 0; index -= 1) {
    const message = state.playMessages[index];
    if (["dm", "party", "npc"].includes(message.role)) {
      return null;
    }
    if (message.role !== "player") {
      continue;
    }
    return isRecoverablePlayerTurnMessage(message) ? message : null;
  }
  return null;
}

function isRecoverablePlayerTurnMessage(message) {
  if (!message?.body?.trim()) {
    return false;
  }
  if (message.source === "player_meta" || message.title === "You (meta)") {
    return false;
  }
  if (/^meta\s*:/i.test(message.body.trim())) {
    return false;
  }
  return true;
}

function pendingPlayerTurnText(message) {
  const body = String(message?.body ?? "").trim();
  const meta = cleanMessageMeta(message?.meta ?? "");
  const resumeMeta = state.campaign?.combat?.inCombat
    ? "This is an unresolved prior player combat action from chat history. Resolve it now for the current active initiative actor with visible rolls/mechanics, HP/resource updates, and turn advancement. Do not ask the same choice question again."
    : "This is an unresolved prior player action from chat history. Resolve it now. Do not ask the same choice question again.";
  return [
    body,
    meta && meta !== "Out-of-world instruction" ? `(meta: ${meta})` : "",
    `(meta: ${resumeMeta})`,
  ].filter(Boolean).join("\n\n");
}

async function maybeAutoResolveCombatRemoteInputs() {
  if (
    clientMode ||
    hasActiveGeneration() ||
    activeTurnRepair() ||
    state.autoResolvingCombatInput ||
    !state.campaign?.combat?.inCombat ||
    elements.playerInput.value.trim()
  ) {
    return;
  }
  const inputs = collectStagedRemoteInputs();
  if (!inputs.length) {
    return;
  }
  const inputKey = inputs.map((input) => `${input.id}:${input.text}`).join("|");
  if (inputKey === state.lastAutoResolvedRemoteKey) {
    return;
  }
  state.lastAutoResolvedRemoteKey = inputKey;
  state.autoResolvingCombatInput = true;
  try {
    setProviderActivity("Combat input received; resolving staged remote action", "working");
    await submitPlayerTurnFromInput("", {
      skipPlayerEcho: true,
      skipPartySeed: true,
    });
  } finally {
    state.autoResolvingCombatInput = false;
  }
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
    await reconcilePartyDirectivesFromHistory();
    seedPlayLog();
    render();
    clearResolvedRecoveredInputDraft("campaign_open");
    schedulePendingPlayerTurnResume("campaign_open");
    scheduleCombatPromptTurnRepair("campaign_open");
    schedulePostTurnRecovery("campaign_open");
    elements.bridgeStatus.textContent = "Campaign opened";
    setProviderActivity("Campaign opened", "idle");
  } catch (error) {
    elements.bridgeStatus.textContent = error instanceof Error ? `Open failed: ${error.message}` : "Open failed";
    setProviderActivity("Campaign open failed", "error");
    renderCampaignSelector();
  }
}

async function createNewCampaign({ title, premise, startingLocation, tone, playerCharacter }) {
  const trimmedTitle = String(title ?? "").trim() || "New Campaign Binder";
  const trimmedPremise = String(premise ?? "").trim() || "Start a new D&D 5e-lite campaign. Ask for missing essentials, then open with a playable scene.";
  const trimmedStartingLocation = String(startingLocation ?? "").trim();
  const trimmedTone = String(tone ?? "").trim();
  const characterSeed = normalizeWizardCharacter(playerCharacter);
  const openingPrompt = buildCampaignOpeningPrompt({
    title: trimmedTitle,
    premise: trimmedPremise,
    startingLocation: trimmedStartingLocation,
    tone: trimmedTone,
    character: characterSeed,
  });
  const openingScene = buildOpeningSceneSummary({
    premise: trimmedPremise,
    startingLocation: trimmedStartingLocation,
    character: characterSeed,
  });
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
        openingScene,
        startingLocation: trimmedStartingLocation,
        tone: trimmedTone,
        providerSettings: providerSettingsForNewCampaign(),
      }),
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    const payload = await response.json();
    setCampaignFromPayload(payload, "new_campaign_start");
    state.reviewBatch = null;
    elements.responseImport.value = "";

    if (characterSeed.name) {
      await seedWizardPlayerCharacter(characterSeed);
    }

    seedPlayLog();
    render();
    elements.campaignDialog.close();
    elements.campaignForm.reset();
    resetCampaignWizardDefaults();
    elements.bridgeStatus.textContent = "New campaign saved to SQLite";
    elements.playerInput.value = "";
    await startNewCampaignOpening(openingPrompt);
  } catch (error) {
    render();
    elements.bridgeStatus.textContent = error instanceof Error ? `New campaign failed: ${error.message}` : "New campaign failed";
    setProviderActivity("New campaign failed", "error");
  }
}

async function startNewCampaignOpening(openingPrompt) {
  if (!openingPrompt.trim()) {
    setProviderActivity("Campaign ready", "idle");
    return;
  }

  elements.bridgeStatus.textContent = "Starting the opening scene...";
  setProviderActivity("Asking DM to open the first scene...", "working");
  const result = await submitPlayerTurnFromInput(openingPrompt, {
    skipPlayerEcho: true,
    skipPartySeed: true,
    preserveInput: false,
  });
  elements.playerInput.value = "";
  if (result?.needsRepair) {
    elements.bridgeStatus.textContent = "Opening scene needs JSON repair; inspect or retry the model response.";
    return;
  }
  if (!result?.providerReceived) {
    elements.bridgeStatus.textContent = "Campaign created; opening scene did not return yet.";
    setProviderActivity("Campaign ready; use Nudge when the provider is ready", "waiting");
  }
}

function providerSettingsForNewCampaign() {
  const settings = currentProviderSettings();
  if (settings.preferredProvider !== "ollama") {
    return settings;
  }

  const installed = installedOllamaModelIds();
  if (isOllamaModelInstalled(settings.selectedModel, installed)) {
    return settings;
  }

  const selectedControlModel = elements.ollamaModel?.value;
  const fallbackModel = [selectedControlModel, ...installed]
    .filter(Boolean)
    .find((model) => isOllamaModelInstalled(model, installed));

  return {
    ...settings,
    selectedModel: fallbackModel || settings.selectedModel,
  };
}

function openCampaignDialog() {
  resetCampaignWizardDefaults();
  elements.campaignDialog.showModal();
  elements.newCampaignTitle.focus();
  elements.newCampaignTitle.select();
}

function resetCampaignWizardDefaults() {
  elements.newCampaignTitle.value = "New Campaign Binder";
  elements.newCampaignPremise.value = "";
  elements.newCampaignStartingLocation.value = "";
  elements.newCampaignTone.value = "";
  elements.newCharacterName.value = "";
  elements.newCharacterAncestry.value = "";
  elements.newCharacterClass.value = "";
  elements.newCharacterLevel.value = "1";
  elements.newCharacterConcept.value = "";
  elements.newCharacterAutoSheet.checked = true;
}

async function refreshMultiplayerSnapshot({ quiet = false } = {}) {
  try {
    const snapshot = await fetchJson(apiMultiplayerSnapshotUrl);
    state.multiplayerSnapshot = snapshot;
    if (!quiet) {
      setProviderActivity(snapshot.localTable?.running ? "Local table status refreshed" : "Local table is off", "idle");
    }
  } catch (error) {
    if (!quiet) {
      setProviderActivity(error instanceof Error ? `Local table check failed: ${error.message}` : "Local table check failed", "error");
    }
  }
}

async function startLocalTableFromUi() {
  try {
    setProviderActivity("Starting local table...", "working");
    const result = await postJson(apiMultiplayerStartUrl, {});
    setCampaignFromPayload(result, "local_table_started");
    state.multiplayerSnapshot = result.multiplayer;
    render();
    setProviderActivity("Local table started", "idle");
  } catch (error) {
    setProviderActivity(error instanceof Error ? `Local table failed: ${error.message}` : "Local table failed", "error");
  }
}

async function stopLocalTableFromUi() {
  try {
    setProviderActivity("Stopping local table...", "working");
    const result = await postJson(apiMultiplayerStopUrl, {});
    setCampaignFromPayload(result, "local_table_stopped");
    state.multiplayerSnapshot = result.multiplayer;
    render();
    setProviderActivity("Local table stopped", "idle");
  } catch (error) {
    setProviderActivity(error instanceof Error ? `Stop failed: ${error.message}` : "Stop failed", "error");
  }
}

async function createInviteForMember(member) {
  try {
    if (!state.campaign.multiplayer?.localTable?.running) {
      await startLocalTableFromUi();
    }
    const result = await postJson(apiMultiplayerInviteUrl, {
      partyMemberId: member.id,
    });
    setCampaignFromPayload(result, "local_table_invite_created");
    state.multiplayerSnapshot = result.multiplayer;
    render();
    await navigator.clipboard.writeText(result.inviteLink);
    setProviderActivity(`Invite link copied for ${member.name}`, "idle");
  } catch (error) {
    setProviderActivity(error instanceof Error ? `Invite failed: ${error.message}` : "Invite failed", "error");
  }
}

async function setPartyMemberController(member, controllerKind) {
  const url = controllerKind === "host"
    ? apiMultiplayerHostControllerUrl
    : controllerKind === "ai_companion"
      ? apiMultiplayerAiControllerUrl
      : apiMultiplayerRevokeControllerUrl;
  const label = controllerKind === "host"
    ? `Claimed ${member.name} for host control`
    : controllerKind === "ai_companion"
      ? `${member.name} returned to AI companion control`
      : `${member.name} controller released`;

  try {
    setProviderActivity(`Updating ${member.name} controller...`, "working");
    const result = await postJson(url, {
      partyMemberId: member.id,
    });
    setCampaignFromPayload(result, `controller_${controllerKind}`);
    state.multiplayerSnapshot = result.multiplayer;
    render();
    setProviderActivity(label, "idle");
  } catch (error) {
    setProviderActivity(error instanceof Error ? `Controller update failed: ${error.message}` : "Controller update failed", "error");
  }
}

function openJoinCampaignDialog() {
  elements.joinCampaignForm.reset();
  elements.joinStatus.textContent = "Paste an invite link from the host.";
  elements.joinCampaignDialog.showModal();
  elements.joinInviteLink.focus();
}

async function requestJoinFromUi() {
  try {
    const inviteLink = elements.joinInviteLink.value.trim();
    const parsed = parseInviteLinkForClient(inviteLink);
    if (!parsed.valid) {
      throw new Error(parsed.error);
    }
    const clientId = guestClientId();
    elements.joinStatus.textContent = "Requesting host approval...";
    const baseUrl = `http://${parsed.host}:${parsed.port}`;
    const result = await postJson(`${baseUrl}${apiMultiplayerJoinUrl}`, {
      inviteLink,
      playerName: elements.joinPlayerName.value.trim() || "Guest Player",
      clientId,
    });
    state.guestSession = {
      hostBaseUrl: baseUrl,
      inviteLink,
      clientId,
      connectionId: result.connection.id,
      connectionSecret: result.connectionSecret || "",
      playerId: result.player.id,
      playerName: result.player.displayName,
      partyMemberId: result.connection.partyMemberId,
      campaignId: parsed.campaign,
      status: result.connection.status,
      lastRevision: result.snapshot?.revision ?? result.snapshot?.tableState?.revision ?? "",
    };
    saveGuestSession(state.guestSession);
    elements.joinStatus.textContent = result.approved
      ? "Joined. You can submit actions for your assigned character."
      : "Join request sent. Waiting for host approval.";
    setProviderActivity(elements.joinStatus.textContent, result.approved ? "idle" : "waiting");
    if (result.snapshot) {
      renderGuestSnapshot(result.snapshot);
    } else {
      await refreshGuestSnapshot({ explicit: false });
    }
  } catch (error) {
    elements.joinStatus.textContent = error instanceof Error ? error.message : "Join failed";
    setProviderActivity(`Join failed: ${elements.joinStatus.textContent}`, "error");
  }
}

async function approveGuest(connectionId) {
  try {
    const result = await postJson(apiMultiplayerApproveUrl, { connectionId });
    setCampaignFromPayload(result, "local_table_join_approved");
    state.multiplayerSnapshot = result.multiplayer;
    render();
    setProviderActivity("Guest approved", "idle");
  } catch (error) {
    setProviderActivity(error instanceof Error ? `Approve failed: ${error.message}` : "Approve failed", "error");
  }
}

async function denyGuest(connectionId) {
  try {
    const result = await postJson(apiMultiplayerDenyUrl, { connectionId });
    setCampaignFromPayload(result, "local_table_join_denied");
    state.multiplayerSnapshot = result.multiplayer;
    render();
    setProviderActivity("Guest denied", "idle");
  } catch (error) {
    setProviderActivity(error instanceof Error ? `Deny failed: ${error.message}` : "Deny failed", "error");
  }
}

async function refreshGuestSnapshot({ explicit = false } = {}) {
  if (!state.guestSession?.hostBaseUrl || !state.guestSession?.connectionId) {
    if (explicit) {
      setProviderActivity("Join a local table first", "error");
    }
    return null;
  }
  if (state.guestPollInFlight) {
    return state.guestSnapshot;
  }

  state.guestPollInFlight = true;
  try {
    const url = new URL(`${state.guestSession.hostBaseUrl}${apiMultiplayerGuestSnapshotUrl}`);
    url.searchParams.set("connectionId", state.guestSession.connectionId);
    url.searchParams.set("clientId", state.guestSession.clientId || guestClientId());
    if (state.guestSession.connectionSecret) {
      url.searchParams.set("connectionSecret", state.guestSession.connectionSecret);
    }
    url.searchParams.set("t", String(Date.now()));
    const snapshot = await fetchJson(url.toString());
    state.guestSession = {
      ...state.guestSession,
      connectionId: snapshot.connection?.id ?? state.guestSession.connectionId,
      connectionSecret: state.guestSession.connectionSecret || "",
      status: snapshot.connection?.status ?? state.guestSession.status,
      partyMemberId: snapshot.connection?.partyMemberId ?? state.guestSession.partyMemberId,
      playerId: snapshot.connection?.playerId ?? state.guestSession.playerId,
      playerName: snapshot.connection?.displayName ?? state.guestSession.playerName,
      lastRevision: snapshot.revision ?? snapshot.tableState?.revision ?? state.guestSession.lastRevision ?? "",
    };
    saveGuestSession(state.guestSession);
    renderGuestSnapshot(snapshot);

    if (snapshot.tableStopped) {
      setProviderActivity("Host local table is off. Ask the host to start it, then sync.", "waiting");
    } else if (snapshot.awaitingApproval) {
      setProviderActivity("Waiting for host approval", "waiting");
    } else if (snapshot.connection?.status === "connected") {
      setProviderActivity(`Connected as ${snapshot.assignedCharacter?.name ?? snapshot.connection.displayName}`, "idle");
    } else {
      setProviderActivity(`Guest connection ${snapshot.connection?.status ?? "unknown"}`, "waiting");
    }
    return snapshot;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Guest resync failed";
    if (/connection secret/i.test(message) || (/connection/i.test(message) && /not found/i.test(message))) {
      clearGuestSession();
      setProviderActivity("Guest session expired. Rejoin from a fresh invite.", "error");
      render();
      return null;
    }
    if (explicit) {
      setProviderActivity(`Guest resync failed: ${message}`, "error");
    }
    throw error;
  } finally {
    state.guestPollInFlight = false;
  }
}

async function submitGuestActionFromUi({ pass = false } = {}) {
  if (!state.guestSession?.hostBaseUrl || !state.guestSession?.connectionId) {
    setProviderActivity("Join a local table first", "error");
    return;
  }
  try {
    const endpoint = pass ? apiMultiplayerPassUrl : apiMultiplayerActionUrl;
    const result = await postJson(`${state.guestSession.hostBaseUrl}${endpoint}`, {
      connectionId: state.guestSession.connectionId,
      clientId: state.guestSession.clientId || guestClientId(),
      connectionSecret: state.guestSession.connectionSecret || "",
      characterId: state.guestSession.partyMemberId,
      text: elements.playerInput.value.trim(),
      ready: true,
    });
    renderGuestSnapshot(result.snapshot);
    if (!pass) {
      elements.playerInput.value = "";
    }
    setProviderActivity(pass ? "Passed for this turn" : "Action sent to host", "idle");
  } catch (error) {
    setProviderActivity(error instanceof Error ? `Guest action failed: ${error.message}` : "Guest action failed", "error");
  }
}

async function resolveCollectedPartyInputs() {
  const pending = state.campaign.multiplayer?.pendingTurnInputs ?? [];
  const readyInputs = pending.filter((input) => input.ready && !input.passed && input.text);
  const hostText = elements.playerInput.value.trim();
  if (!readyInputs.length && !hostText) {
    setProviderActivity("No party inputs are ready", "idle");
    return;
  }

  const aggregate = buildAggregatedPlayerTurnFromInputs({ hostText, inputs: readyInputs });
  await resolvePendingInputsWithText(readyInputs, aggregate.text);
}

async function resolvePendingInput(inputId) {
  const input = (state.campaign.multiplayer?.pendingTurnInputs ?? [])
    .find((item) => item.id === inputId && item.ready && !item.passed && item.text);
  if (!input) {
    setProviderActivity("That party input is no longer pending", "idle");
    return;
  }
  await stagePendingRemoteInput(input.id);
}

async function resolvePendingInputsWithText(inputs, aggregateText) {
  const runResult = await submitPlayerTurnFromInput(aggregateText, {
    skipPlayerEcho: true,
    playerInputs: inputs.map((input) => ({
      playerId: input.playerId,
      playerName: input.playerName,
      characterId: input.characterId,
      characterName: input.characterName,
      text: input.text,
      ready: input.ready,
    })),
  });
  if (inputs.length && runResult?.imported) {
    const result = await postJson(apiMultiplayerClearPendingUrl, {
      inputIds: inputs.map((input) => input.id),
    });
    setCampaignFromPayload(result, "local_table_pending_cleared");
    state.multiplayerSnapshot = result.multiplayer;
    render();
  }
}

function renderGuestSnapshot(snapshot) {
  if (!snapshot) {
    return;
  }
  state.guestSnapshot = snapshot;
  state.sourceMode = "guest";
  const tableState = snapshot.tableState ?? snapshot;
  state.campaign = normalizeCampaign({
    id: snapshot.campaignId,
    title: snapshot.campaignTitle,
    summary: "Guest view of a hosted local table.",
    scene: tableState.scene ?? snapshot.scene ?? {},
    party: tableState.party ?? snapshot.party ?? [],
    people: tableState.people ?? snapshot.people ?? [],
    places: tableState.places ?? snapshot.places ?? [],
    items: tableState.items ?? snapshot.items ?? [],
    inventory: tableState.inventory ?? snapshot.inventory ?? [],
    quests: tableState.quests ?? snapshot.quests ?? [],
    factions: tableState.factions ?? snapshot.factions ?? [],
    lore: tableState.lore ?? snapshot.lore ?? [],
    relationships: tableState.relationships ?? snapshot.relationships ?? [],
    combat: tableState.combat ?? snapshot.combat ?? undefined,
    sessionLog: {
      activeSessionId: "guest-session",
      sessions: [
        {
          id: "guest-session",
          title: "Hosted Table",
          startedAt: new Date().toISOString(),
          endedAt: null,
          recap: "",
        },
      ],
      messages: tableState.messages ?? snapshot.messages ?? [],
    },
  });
  seedPlayLog();
  render();
  elements.sceneLocation.textContent = tableState.scene?.currentPlaceId || "Guest table";
  if (snapshot.tableStopped) {
    elements.saveStatus.textContent = "Guest: host table off";
  } else if (snapshot.assignedCharacter) {
    elements.saveStatus.textContent = `Guest: ${snapshot.assignedCharacter.name}`;
  } else if (snapshot.awaitingApproval) {
    elements.saveStatus.textContent = "Guest: waiting for host approval";
  }
}

async function stagePendingRemoteInput(inputId) {
  const message = state.playMessages.find((item) => item.data?.pendingInputId === inputId);
  if (!message) {
    setProviderActivity("That party input is staged for the next Send Turn", "idle");
    return;
  }
  await patchPlayMessage(message.id, {
    meta: "Staged for next Send Turn",
    data: {
      hostStaged: true,
    },
  });
  setProviderActivity("Party input staged; Send Turn can resolve it with or without host text", "idle");
}

function createGuestShellCampaign() {
  return normalizeCampaign({
    id: "thin-lorekeeper",
    title: "ThinLoreKeeper",
    summary: "Guest client waiting for a hosted local table.",
    scene: {
      status: "waiting",
      currentPlaceId: "client-lobby",
      immediateSituation: "Paste a host invite link to join a local table.",
    },
    party: [],
    people: [],
    places: [
      {
        id: "client-lobby",
        name: "Client Lobby",
        type: "connection",
        summary: "Waiting for host invite.",
      },
    ],
    items: [],
    quests: [],
    sessionLog: {
      activeSessionId: "thin-lorekeeper-session",
      sessions: [
        {
          id: "thin-lorekeeper-session",
          title: "ThinLoreKeeper",
          startedAt: new Date().toISOString(),
          endedAt: null,
          recap: "",
        },
      ],
      messages: [
        {
          id: "thin-lorekeeper-ready",
          sessionId: "thin-lorekeeper-session",
          role: "system",
          title: "LoreKeeper",
          body: "ThinLoreKeeper is ready. Join a hosted local table to play as an assigned party member.",
          meta: "No local campaign API or model provider is running in this window.",
          source: "thin_lorekeeper",
          createdAt: new Date().toISOString(),
          data: {},
        },
      ],
    },
  });
}

function renderMultiplayerPanel() {
  const multiplayer = state.campaign?.multiplayer ?? {};
  const table = multiplayer.localTable ?? {};
  if (clientMode) {
    elements.localTableState.textContent = "Client";
    elements.localTableAddress.textContent = state.guestSession?.hostBaseUrl
      ? `${state.guestSession.status === "connected" ? "Connected" : "Waiting"}: ${state.guestSession.hostBaseUrl}`
      : "Paste a host invite link to join.";
    elements.startLocalTable.disabled = true;
    elements.stopLocalTable.disabled = true;
    if (elements.syncGuestTable) {
      elements.syncGuestTable.disabled = !state.guestSession?.hostBaseUrl;
    }
    elements.resolvePartyInputs.disabled = true;
    renderConnectedGuests([]);
    renderPendingInputs(state.guestSnapshot?.pendingInput ? [state.guestSnapshot.pendingInput] : []);
    return;
  }

  elements.localTableState.textContent = table.running ? "On" : "Off";
  elements.localTableAddress.textContent = table.running
    ? `LAN: ${table.lanAddress || "127.0.0.1"}:${table.port || location.port}`
    : "Start a LAN table only when another local app is joining.";
  elements.stopLocalTable.disabled = !table.running;
  if (elements.syncGuestTable) {
    elements.syncGuestTable.disabled = true;
  }
  elements.resolvePartyInputs.disabled = !(multiplayer.pendingTurnInputs ?? []).some((input) => input.ready && !input.passed && input.text);
  renderConnectedGuests(multiplayer.connections ?? []);
  renderPendingInputs(multiplayer.pendingTurnInputs ?? []);
}

function renderConnectedGuests(connections) {
  elements.connectedGuests.replaceChildren(
    ...emptyOrLocalTableRows(
      connections.map((connection) => localTableRow({
        title: connection.displayName || "Guest",
        subtitle: `${connection.status} / ${labelById(state.campaign, connection.partyMemberId)}`,
        actions: connection.status === "pending"
          ? [
            { label: "Approve", onClick: () => approveGuest(connection.id) },
            { label: "Deny", onClick: () => denyGuest(connection.id) },
          ]
          : [],
      })),
      "No guests connected.",
    ),
  );
}

function renderPendingInputs(inputs) {
  elements.pendingInputs.replaceChildren(
    ...emptyOrLocalTableRows(
      inputs.map((input) => localTableRow({
        title: input.characterName || "Party member",
        subtitle: input.passed ? "passed" : input.text || "not ready",
        actions: [],
      })),
      "No pending party inputs.",
    ),
  );
}

function localTableRow({ title, subtitle, actions = [] }) {
  const row = document.createElement("div");
  row.className = "local-table-row";
  const text = document.createElement("span");
  text.textContent = `${title}: ${subtitle}`;
  row.append(text);
  for (const action of actions) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "mini-action";
    button.textContent = action.label;
    button.addEventListener("click", action.onClick);
    row.append(button);
  }
  return row;
}

function emptyOrLocalTableRows(rows, message) {
  if (rows.length) {
    return rows;
  }
  const empty = document.createElement("p");
  empty.className = "empty-state";
  empty.textContent = message;
  return [empty];
}

function controllerLabel(member) {
  const kind = member.controllerKind || (member.type === "player_character" ? "host" : "ai_companion");
  return {
    host: "Host",
    remote_player: "Remote",
    ai_companion: "AI",
    unassigned: "Open",
  }[kind] || "AI";
}

async function postJson(url, body) {
  const response = await fetchOrExplain(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

async function fetchJson(url) {
  const response = await fetchOrExplain(url);
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

async function fetchOrExplain(url, init) {
  try {
    return await fetch(url, init);
  } catch (error) {
    if (error instanceof TypeError && /failed to fetch/i.test(error.message)) {
      throw new Error("Local API or host table is unreachable. Restart the host app or use a fresh invite link.");
    }
    throw error;
  }
}

function parseInviteLinkForClient(value) {
  try {
    const url = new URL(String(value ?? "").trim());
    const host = url.searchParams.get("host") || "";
    const port = Number(url.searchParams.get("port"));
    const campaign = url.searchParams.get("campaign") || "";
    if (url.protocol !== "lorekeeper:" || url.hostname !== "join") {
      return { valid: false, error: "Invite link must start with lorekeeper://join." };
    }
    if (!host || !Number.isInteger(port) || !campaign) {
      return { valid: false, error: "Invite link is missing host, port, or campaign." };
    }
    return { valid: true, host, port, campaign };
  } catch {
    return { valid: false, error: "Invite link is not valid." };
  }
}

function guestClientId() {
  const key = "lorekeeper.guestClientId";
  const existing = localStorage.getItem(key);
  if (existing) {
    return existing;
  }
  const value = `client-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  localStorage.setItem(key, value);
  return value;
}

function loadGuestSession() {
  try {
    return JSON.parse(localStorage.getItem(guestSessionStorageKey) || "null");
  } catch {
    return null;
  }
}

function saveGuestSession(session) {
  localStorage.setItem(guestSessionStorageKey, JSON.stringify(session));
}

function clearGuestSession() {
  state.guestSession = null;
  state.guestSnapshot = null;
  localStorage.removeItem(guestSessionStorageKey);
}

function normalizeWizardCharacter(input = {}) {
  const name = String(input.name ?? "").trim();
  const ancestry = String(input.ancestry ?? "").trim();
  const characterClass = String(input.characterClass ?? "").trim();
  const concept = String(input.concept ?? "").trim();
  const level = clampLevel(parseOptionalNumber(input.level) ?? 1);

  return {
    name,
    ancestry,
    characterClass,
    level,
    concept,
    autoSheet: input.autoSheet !== false,
  };
}

function buildOpeningSceneSummary({ premise, startingLocation, character }) {
  const details = [
    premise,
    character?.name ? `Player character: ${formatCharacterBasics(character)}.` : "",
    startingLocation ? `Starting place: ${startingLocation}.` : "",
  ].filter(Boolean);

  return details.join(" ");
}

function buildCampaignOpeningPrompt({ title, premise, startingLocation, tone, character }) {
  const lines = [
    `Start campaign: ${title}.`,
    `Campaign seed: ${premise}`,
  ];

  if (startingLocation) {
    lines.push(`Starting place: ${startingLocation}.`);
  }
  if (tone) {
    lines.push(`Tone/style: ${tone}.`);
  }
  if (character?.name) {
    lines.push(`Primary player character: ${formatCharacterBasics(character)}.`);
  } else if (character?.concept || character?.characterClass || character?.ancestry) {
    lines.push(`Primary player character draft: ${formatCharacterBasics(character)}. Ask for the missing name when it matters.`);
  }

  lines.push(
    "Open with a playable first scene using full DM narration first. Do not force an option list unless combat or immediate danger starts.",
    "Guide any missing character details through play instead of stopping for a long setup form.",
    "Propose LoreKeeper updates for the player character, starting place, active thread, and any named party members or NPCs.",
    "(meta: Return strict LoreKeeper JSON only. Make the first DM turn feel like actual play, not a setup note.)",
  );

  return lines.join("\n");
}

function formatCharacterBasics(character) {
  const identity = [
    character.name,
    character.ancestry,
    character.characterClass,
    character.level ? `level ${character.level}` : "",
  ].filter(Boolean).join(", ");
  return [identity || "Unnamed player character", character.concept].filter(Boolean).join(" - ");
}

async function seedWizardPlayerCharacter(character) {
  const sheet = character.autoSheet
    ? buildFiveELiteCharacterSeed(character)
    : {
        id: `party-${slugify(character.name)}`,
        name: character.name,
        type: "player_character",
        playerRole: "Player character",
        ancestryClass: [character.ancestry, character.characterClass].filter(Boolean).join(" ") || "adventurer",
        level: character.level,
        background: character.concept,
        notes: ["Created from the new campaign wizard."],
      };

  const response = await fetch(apiCampaignRecordUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      domain: "party",
      ...sheet,
    }),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const result = await response.json();
  setCampaignFromPayload(result, "new_campaign_player_character");
}

function buildFiveELiteCharacterSeed(character) {
  const level = clampLevel(character.level || 1);
  const profile = classifyCharacterProfile(`${character.characterClass} ${character.concept}`);
  const abilityScores = standardScoresForProfile(profile);
  const conMod = abilityModifier(abilityScores.CON);
  const dexMod = abilityModifier(abilityScores.DEX);
  const maxHp = Math.max(1, hitDieForProfile(profile) + conMod + Math.max(0, level - 1) * Math.max(1, Math.ceil(hitDieForProfile(profile) / 2) + conMod));
  const armorClass = Math.max(10, 10 + dexMod + armorBonusForProfile(profile));
  const ancestryClass = [character.ancestry, character.characterClass].filter(Boolean).join(" ") || profile.label;
  const proficiencyBonus = proficiencyBonusForLevel(level);
  const spells = spellsForProfile(profile, character);
  const resources = {
    spellSlots: spellSlotsForProfile(profile, level),
    uses: usesForProfile(profile, level),
  };

  return {
    id: `party-${slugify(character.name)}`,
    name: character.name,
    type: "player_character",
    playerRole: "Player character",
    ancestryClass,
    level,
    experience: 0,
    proficiencyBonus,
    background: character.concept || `${character.name} is a ${ancestryClass} beginning the campaign.`,
    stats: {
      hp: {
        current: maxHp,
        max: maxHp,
      },
      armorClass,
      abilityScores,
      spells,
      spellSlots: resources.spellSlots,
    },
    speedFt: 30,
    resources,
    attacks: attacksForProfile(profile, abilityScores, proficiencyBonus),
    conditions: [],
    skills: skillsForProfile(profile, character),
    abilities: abilitiesForProfile(profile, character),
    spells,
    notes: ["Created from the new campaign wizard with a 5E-lite standard array."],
  };
}

function classifyCharacterProfile(text) {
  const value = String(text ?? "").toLowerCase();
  const profiles = [
    { key: "druid", label: "druid", match: /\b(druid|wild shape|nature|frost|wolf)\b/ },
    { key: "rogue", label: "rogue", match: /\b(rogue|thief|burglar|assassin|heist|lock|sneak)\b/ },
    { key: "ranger", label: "ranger", match: /\b(ranger|scout|archer|bow|tracker|hunter)\b/ },
    { key: "fighter", label: "fighter", match: /\b(fighter|warrior|soldier|guard|knight|sword)\b/ },
    { key: "wizard", label: "wizard", match: /\b(wizard|mage|arcane|spellbook|sorcerer)\b/ },
    { key: "cleric", label: "cleric", match: /\b(cleric|priest|paladin|divine|faith|healer)\b/ },
    { key: "bard", label: "bard", match: /\b(bard|performer|charmer|silver tongue|song)\b/ },
  ];
  return profiles.find((profile) => profile.match.test(value)) ?? { key: "balanced", label: "adventurer" };
}

function standardScoresForProfile(profile) {
  const maps = {
    druid: { STR: 8, DEX: 13, CON: 14, INT: 12, WIS: 15, CHA: 10 },
    rogue: { STR: 8, DEX: 15, CON: 13, INT: 12, WIS: 10, CHA: 14 },
    ranger: { STR: 10, DEX: 15, CON: 13, INT: 8, WIS: 14, CHA: 12 },
    fighter: { STR: 15, DEX: 12, CON: 14, INT: 8, WIS: 13, CHA: 10 },
    wizard: { STR: 8, DEX: 14, CON: 13, INT: 15, WIS: 12, CHA: 10 },
    cleric: { STR: 12, DEX: 10, CON: 14, INT: 8, WIS: 15, CHA: 13 },
    bard: { STR: 8, DEX: 14, CON: 13, INT: 10, WIS: 12, CHA: 15 },
    balanced: { STR: 12, DEX: 14, CON: 13, INT: 10, WIS: 15, CHA: 8 },
  };

  return maps[profile.key] ?? maps.balanced;
}

function hitDieForProfile(profile) {
  if (profile.key === "fighter") {
    return 10;
  }
  if (profile.key === "wizard") {
    return 6;
  }
  return 8;
}

function armorBonusForProfile(profile) {
  if (profile.key === "fighter" || profile.key === "cleric") {
    return 3;
  }
  if (profile.key === "ranger" || profile.key === "rogue") {
    return 2;
  }
  return 0;
}

function skillsForProfile(profile, character) {
  const skills = {
    druid: ["Nature", "Survival", "Animal Handling", "Perception"],
    rogue: ["Stealth", "Sleight of Hand", "Deception", "Thieves' Tools"],
    ranger: ["Perception", "Survival", "Stealth", "Athletics"],
    fighter: ["Athletics", "Intimidation", "Perception", "Survival"],
    wizard: ["Arcana", "Investigation", "History", "Insight"],
    cleric: ["Medicine", "Insight", "Religion", "Persuasion"],
    bard: ["Performance", "Persuasion", "Deception", "Insight"],
    balanced: ["Perception", "Survival", "Insight", "Athletics"],
  };
  const extras = /frost/i.test(`${character.characterClass} ${character.concept}`) ? ["Frost magic control"] : [];
  return [...(skills[profile.key] ?? skills.balanced), ...extras];
}

function abilitiesForProfile(profile, character) {
  const abilities = {
    druid: ["Wild Shape", "Druidcraft", "Primal spellcasting"],
    rogue: ["Sneak Attack", "Cunning Action", "Thieves' Tools"],
    ranger: ["Favored terrain instincts", "Archery training", "Tracking"],
    fighter: ["Second Wind", "Weapon training", "Tactical footing"],
    wizard: ["Arcane Recovery", "Ritual casting", "Spellbook"],
    cleric: ["Channel Divinity", "Divine spellcasting", "Healing word"],
    bard: ["Bardic Inspiration", "Jack of All Trades", "Silver tongue"],
    balanced: ["Adventurer's instincts", "Fieldcraft", "Quick thinking"],
  };
  const extras = /wolf/i.test(`${character.characterClass} ${character.concept}`) ? ["Wolf companion bond"] : [];
  return [...(abilities[profile.key] ?? abilities.balanced), ...extras];
}

function spellsForProfile(profile, character) {
  const value = `${character.characterClass} ${character.concept}`;
  if (profile.key === "druid") {
    return /frost/i.test(value)
      ? ["Frostbite", "Druidcraft", "Entangle", "Goodberry"]
      : ["Druidcraft", "Entangle", "Goodberry"];
  }
  if (profile.key === "wizard") {
    return ["Mage Hand", "Detect Magic", "Magic Missile"];
  }
  if (profile.key === "cleric") {
    return ["Guidance", "Bless", "Healing Word"];
  }
  if (profile.key === "bard") {
    return ["Vicious Mockery", "Charm Person", "Healing Word"];
  }
  return [];
}

function spellSlotsForProfile(profile, level) {
  const fullCaster = {
    1: { 1: { max: 2, used: 0 } },
    2: { 1: { max: 3, used: 0 } },
    3: { 1: { max: 4, used: 0 }, 2: { max: 2, used: 0 } },
    4: { 1: { max: 4, used: 0 }, 2: { max: 3, used: 0 } },
    5: { 1: { max: 4, used: 0 }, 2: { max: 3, used: 0 }, 3: { max: 2, used: 0 } },
  };
  const halfCaster = {
    2: { 1: { max: 2, used: 0 } },
    3: { 1: { max: 3, used: 0 } },
    4: { 1: { max: 3, used: 0 } },
    5: { 1: { max: 4, used: 0 }, 2: { max: 2, used: 0 } },
  };
  const table = ["druid", "wizard", "cleric", "bard"].includes(profile.key)
    ? fullCaster
    : profile.key === "ranger"
      ? halfCaster
      : null;
  if (!table) {
    return {};
  }
  const eligibleLevel = Math.max(...Object.keys(table).map(Number).filter((entry) => entry <= level));
  return structuredClone(table[eligibleLevel] ?? {});
}

function usesForProfile(profile, level) {
  const uses = {};
  if (profile.key === "druid" && level >= 2) {
    uses.wildShape = { max: 2, used: 0 };
  }
  if (profile.key === "fighter") {
    uses.secondWind = { max: 1, used: 0 };
  }
  if (profile.key === "cleric" && level >= 2) {
    uses.channelDivinity = { max: 1, used: 0 };
  }
  if (profile.key === "bard") {
    uses.bardicInspiration = { max: Math.max(1, abilityModifier(15)), used: 0 };
  }
  return uses;
}

function attacksForProfile(profile, abilityScores, proficiencyBonus) {
  const dexAttack = abilityModifier(abilityScores.DEX) + proficiencyBonus;
  const strAttack = abilityModifier(abilityScores.STR) + proficiencyBonus;
  const wisAttack = abilityModifier(abilityScores.WIS) + proficiencyBonus;
  const intAttack = abilityModifier(abilityScores.INT) + proficiencyBonus;
  const chaAttack = abilityModifier(abilityScores.CHA) + proficiencyBonus;
  const damage = (dice, mod) => `${dice}${mod ? formatModifier(mod) : ""}`;

  const attacks = {
    druid: [
      { name: "Quarterstaff", attackBonus: strAttack, damage: damage("1d6", abilityModifier(abilityScores.STR)), range: "5 ft", requirements: ["equipped weapon"] },
      { name: "Primal cantrip", attackBonus: wisAttack, damage: "cantrip effect", range: "spell range", requirements: ["known cantrip"] },
    ],
    rogue: [
      { name: "Shortsword", attackBonus: dexAttack, damage: damage("1d6", abilityModifier(abilityScores.DEX)), range: "5 ft", requirements: ["finesse weapon"] },
      { name: "Shortbow", attackBonus: dexAttack, damage: damage("1d6", abilityModifier(abilityScores.DEX)), range: "80/320 ft", requirements: ["line of sight", "ammunition"] },
    ],
    ranger: [
      { name: "Longbow", attackBonus: dexAttack, damage: damage("1d8", abilityModifier(abilityScores.DEX)), range: "150/600 ft", requirements: ["line of sight", "ammunition"] },
      { name: "Shortsword", attackBonus: dexAttack, damage: damage("1d6", abilityModifier(abilityScores.DEX)), range: "5 ft", requirements: ["equipped weapon"] },
    ],
    fighter: [
      { name: "Longsword", attackBonus: strAttack, damage: damage("1d8", abilityModifier(abilityScores.STR)), range: "5 ft", requirements: ["equipped weapon"] },
      { name: "Javelin", attackBonus: strAttack, damage: damage("1d6", abilityModifier(abilityScores.STR)), range: "30/120 ft", requirements: ["line of sight"] },
    ],
    wizard: [
      { name: "Dagger", attackBonus: dexAttack, damage: damage("1d4", abilityModifier(abilityScores.DEX)), range: "20/60 ft", requirements: ["equipped weapon"] },
      { name: "Arcane cantrip", attackBonus: intAttack, damage: "cantrip effect", range: "spell range", requirements: ["known cantrip"] },
    ],
    cleric: [
      { name: "Mace", attackBonus: strAttack, damage: damage("1d6", abilityModifier(abilityScores.STR)), range: "5 ft", requirements: ["equipped weapon"] },
      { name: "Divine cantrip", attackBonus: wisAttack, damage: "cantrip effect", range: "spell range", requirements: ["known cantrip"] },
    ],
    bard: [
      { name: "Rapier", attackBonus: dexAttack, damage: damage("1d8", abilityModifier(abilityScores.DEX)), range: "5 ft", requirements: ["finesse weapon"] },
      { name: "Bardic cantrip", attackBonus: chaAttack, damage: "cantrip effect", range: "spell range", requirements: ["known cantrip"] },
    ],
    balanced: [
      { name: "Simple weapon", attackBonus: dexAttack, damage: damage("1d6", abilityModifier(abilityScores.DEX)), range: "weapon range", requirements: ["equipped weapon"] },
    ],
  };

  return attacks[profile.key] ?? attacks.balanced;
}

function formatModifier(value) {
  const number = Number(value) || 0;
  return number >= 0 ? `+${number}` : `${number}`;
}

function proficiencyBonusForLevel(level) {
  return 2 + Math.floor((Math.max(1, level) - 1) / 4);
}

function abilityModifier(score) {
  return Math.floor((Number(score) - 10) / 2);
}

function clampLevel(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return 1;
  }
  return Math.min(20, Math.max(1, Math.round(number)));
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

async function seedPartyFromPlayerOpening(playerText) {
  const inferredMembers = inferPartyMembersFromPlayerText(playerText, state.campaign);
  if (!inferredMembers.length) {
    return [];
  }

  return addPartyMembersFromUi(inferredMembers, {
    statusPrefix: "Added",
    contextPurpose: "player_seeded_party_context",
  });
}

async function applyPlayerPartyDirectives(parsedMessage, fallbackText = "") {
  const members = inferPartyMembersFromDirectives(parsedMessage, fallbackText, state.campaign);
  if (!members.length) {
    return [];
  }

  return addPartyMembersFromUi(members, {
    statusPrefix: "Added from player instruction",
    contextPurpose: "player_directed_party_context",
  });
}

async function reconcilePartyDirectivesFromHistory() {
  if (!state.sqlitePath || !state.campaign?.sessionLog?.messages?.length) {
    return [];
  }

  const existingNames = new Set((state.campaign.party ?? []).map((member) => normalizeNameKey(member.name)));
  const members = [];
  for (const message of state.campaign.sessionLog.messages.slice(-30)) {
    if (message.role !== "player") {
      continue;
    }
    const inferred = inferPartyMembersFromDirectives({
      inWorldText: message.body || "",
      metaInstructions: [message.meta || ""].filter(Boolean),
    }, "", state.campaign);
    for (const member of inferred) {
      const key = normalizeNameKey(member.name);
      if (!key || existingNames.has(key)) {
        continue;
      }
      existingNames.add(key);
      members.push(member);
    }
  }

  if (!members.length) {
    return [];
  }

  return addPartyMembersFromUi(members, {
    statusPrefix: "Recovered party instruction: added",
    contextPurpose: "history_party_directive_context",
  });
}

async function addPartyMembersFromUi(members, { statusPrefix = "Added", contextPurpose = "party_update_context" } = {}) {
  const added = [];
  for (const member of members) {
    try {
      const response = await fetch(apiCampaignRecordUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          domain: "party",
          ...member,
        }),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const result = await response.json();
      state.campaign = normalizeCampaign(result.campaign);
      state.campaigns = result.campaigns ?? state.campaigns;
      state.sqlitePath = result.sqlitePath ?? state.sqlitePath;
      state.contextPack = buildContextPack(state.campaign, {
        purpose: contextPurpose,
      });
      added.push(member.name);
    } catch (error) {
      elements.bridgeStatus.textContent = error instanceof Error
        ? `Party seed failed: ${error.message}`
        : "Party seed failed";
    }
  }

  if (added.length) {
    elements.bridgeStatus.textContent = `${statusPrefix} ${added.join(", ")} to the party`;
    setProviderActivity(`Party updated: ${added.join(", ")}`, "idle");
  }

  return added;
}

function inferPartyMembersFromDirectives(parsedMessage, fallbackText, campaign) {
  const directiveText = [
    parsedMessage?.inWorldText,
    ...(parsedMessage?.metaInstructions ?? []),
    fallbackText,
  ].filter(Boolean).join(" ");
  const existingNames = new Set((campaign.party ?? []).map((member) => normalizeNameKey(member.name)));
  const names = inferPartyJoinNames(directiveText)
    .filter((name) => !existingNames.has(normalizeNameKey(name)))
    .slice(0, Math.max(0, 8 - (campaign.party ?? []).length));

  return names.map((name) => ({
    id: `party-${slugify(name)}`,
    name,
    type: "party_member",
    playerRole: "trusted party member",
    ancestryClass: inferDirectivePartyRole(directiveText, name),
    background: `${name} joined the party by direct player instruction during play.`,
    notes: [`Added by player instruction: ${compactSceneSituation(directiveText) || `${name} joins the party.`}`],
  }));
}

function inferPartyJoinNames(text) {
  const names = [];
  const patterns = [
    /\b(?:add|invite|bring)\s+([A-Z][A-Za-z'-]{1,30})(?:\s+[A-Z][A-Za-z'-]{1,30})?\s+(?:to|into)\s+(?:the\s+)?party\b/g,
    /\b([A-Z][A-Za-z'-]{1,30})(?:\s+[A-Z][A-Za-z'-]{1,30})?\s+joins?\s+(?:the\s+)?party\b/g,
    /\b([A-Z][A-Za-z'-]{1,30})(?:\s+[A-Z][A-Za-z'-]{1,30})?\s+joins?\s+(?:up|in|them|him|her|us)\b/g,
  ];

  for (const pattern of patterns) {
    for (const match of String(text ?? "").matchAll(pattern)) {
      if (match[1]) {
        names.push(match[1]);
      }
    }
  }

  return uniqueNames(names.filter(isLikelyCharacterName));
}

function inferDirectivePartyRole(text, name) {
  const escaped = escapeRegExp(name);
  const nearName = new RegExp(`\\b(?:guard|soldier|watchman|captain|scout|mage|wizard|cleric|fighter|ranger)\\b[^.]{0,80}\\b${escaped}\\b|\\b${escaped}\\b[^.]{0,80}\\b(?:guard|soldier|watchman|captain|scout|mage|wizard|cleric|fighter|ranger)\\b`, "i");
  const match = String(text ?? "").match(nearName);
  if (match?.[0]) {
    const role = match[0].match(/\b(guard|soldier|watchman|captain|scout|mage|wizard|cleric|fighter|ranger)\b/i)?.[1];
    if (role) {
      return role.toLowerCase();
    }
  }
  return "trusted party member";
}

function inferPartyMembersFromPlayerText(playerText, campaign) {
  const text = stripParentheticalText([
    campaign.summary,
    campaign.scene?.immediateSituation,
    ...(campaign.lore ?? []).flatMap((entry) => entry.notes ?? []),
    playerText,
  ].filter(Boolean).join(" "));
  if (!text || (campaign.party ?? []).length >= 6) {
    return [];
  }

  const existingNames = new Set((campaign.party ?? []).map((member) => normalizeNameKey(member.name)));
  const namedMembers = inferOpeningPartyNames(text)
    .filter((name) => !existingNames.has(normalizeNameKey(name)))
    .slice(0, 4);
  const impliedMembers = inferImpliedOpeningPartyMembers(text, campaign, namedMembers.length)
    .filter((member) => !existingNames.has(normalizeNameKey(member.name)))
    .filter((member) => !namedMembers.some((name) => normalizeNameKey(name) === normalizeNameKey(member.name)));

  return [
    ...namedMembers.map((name, index) => ({
    id: `party-${slugify(name)}`,
    name,
    type: index === 0 ? "player_character" : "party_member",
    playerRole: index === 0 ? "Player character" : "trusted party member",
    ancestryClass: inferCharacterRoleText(text, name) || "adventurer",
    background: inferCharacterBackgroundText(text, name, index),
    notes: [
      index === 0
        ? "Inferred from the player's opening campaign message."
        : "Inferred as a trusted party member from the player's opening campaign message.",
    ],
    })),
    ...impliedMembers,
  ].slice(0, Math.max(0, 6 - (campaign.party ?? []).length));
}

function stripParentheticalText(value) {
  return String(value ?? "").replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
}

function inferOpeningPartyNames(text) {
  const names = [];
  const pairPatterns = [
    /\b([A-Z][A-Za-z'’-]{1,30})\s+and\s+(?:(?:his|her|their)\s+)?(?:(?:best|old|close|trusted|new|slower|faster|friend|companion|ally)\s+){0,6}([A-Z][A-Za-z'’-]{1,30})\s+(?:are|were|run|sprint|walk|enter|head|travel|dash)\b/,
    /\b([A-Z][A-Za-z'’-]{1,30})\s+and\s+([A-Z][A-Za-z'’-]{1,30})\s+(?:are|were|run|sprint|walk|enter|head|travel|dash)\b/,
  ];

  for (const pattern of pairPatterns) {
    const match = text.match(pattern);
    if (match) {
      names.push(match[1], match[2]);
      break;
    }
  }

  if (!names.length) {
    const firstPerson = text.match(/\b(?:I am|I'm|my character is|playing as)\s+([A-Z][A-Za-z'’-]{1,30})\b/i);
    if (firstPerson?.[1]) {
      names.push(firstPerson[1]);
    }
  }

  return uniqueNames(names.filter(isLikelyCharacterName));
}

function inferImpliedOpeningPartyMembers(text, campaign, namedCount = 0) {
  const existingCount = (campaign.party ?? []).length + namedCount;
  const targetCount = inferOpeningPartyCount(text);
  const members = [];
  const primaryName = campaign.party?.[0]?.name || inferOpeningPartyNames(text)[0] || "the player character";
  const primaryShortName = String(primaryName).split(/\s+/)[0] || "the player character";

  if (/\b(?:long[-\s]?time|old|close|trusted|best)\s+friend\b/i.test(text) && existingCount + members.length < targetCount) {
    members.push(createImpliedPartyMember({
      name: `${primaryShortName}'s Longtime Friend`,
      role: "trusted friend",
      note: `A longtime friend of ${primaryShortName}, implied by the campaign seed. Fill in their true name and details during play.`,
    }));
  }

  const unnamedNeeded = Math.max(0, targetCount - existingCount - members.length);
  for (let index = 0; index < unnamedNeeded; index += 1) {
    members.push(createImpliedPartyMember({
      name: `Unnamed Party Member ${index + 1}`,
      role: "trusted party member",
      note: "An unnamed party member implied by the campaign seed. Fill in their name, role, and details during play.",
    }));
  }

  if (/\b(?:cat|hound|wolf|hawk|raven|familiar|animal)\s+companion\b/i.test(text) && existingCount + members.length < 6) {
    members.push(createImpliedPartyMember({
      name: `${primaryShortName}'s Animal Companion`,
      role: inferAnimalCompanionRole(text),
      note: "Animal companion implied by the campaign seed. Track exact abilities and limits as they are established in play.",
    }));
  }

  return members;
}

function inferOpeningPartyCount(text) {
  const digitMatch = text.match(/\b(\d+)\s+(?:party\s+)?members?\b/i);
  if (digitMatch) {
    return clampPartySeedCount(Number(digitMatch[1]));
  }

  const wordMatch = text.match(/\b(one|two|three|four|five|six)\s+(?:party\s+)?members?\b/i);
  if (wordMatch) {
    return clampPartySeedCount(numberWordToInt(wordMatch[1]));
  }

  const othersMatch = text.match(/\band\s+(\d+|one|two|three|four|five)\s+others?\b/i);
  if (othersMatch) {
    return clampPartySeedCount((campaignHasPrimary(text) ? 1 : 0) + numberWordToInt(othersMatch[1]));
  }

  return 1;
}

function campaignHasPrimary(text) {
  return /\bPrimary player character\b|\bplayer character\b|\bI am\b|\bI'm\b|\bplaying as\b/i.test(text);
}

function clampPartySeedCount(value) {
  return Math.min(6, Math.max(1, Number(value) || 1));
}

function numberWordToInt(value) {
  const words = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
  };
  return words[String(value).toLowerCase()] ?? Number(value) ?? 0;
}

function createImpliedPartyMember({ name, role, note }) {
  return {
    id: `party-${slugify(name)}`,
    name,
    type: "party_member",
    playerRole: "trusted party member",
    ancestryClass: role,
    background: note,
    notes: [note],
  };
}

function inferAnimalCompanionRole(text) {
  const animalMatch = text.match(/\b(large\s+)?([A-Za-z-]+)(?:\s+style)?\s+(?:cat|hound|wolf|hawk|raven|familiar|animal)\s+companion\b/i);
  if (animalMatch?.[0]) {
    return animalMatch[0].replace(/^a\s+/i, "").toLowerCase();
  }
  return "animal companion";
}

function inferCharacterRoleText(text, name) {
  const escaped = escapeRegExp(name);
  const classMatch = text.match(new RegExp(`\\b${escaped}\\b[^.]{0,140}\\b(ranger|fighter|druid|rogue|thief|wizard|cleric|bard|scout|warrior|mage)\\b`, "i"));
  if (classMatch?.[1]) {
    return classMatch[1].toLowerCase();
  }

  const patterns = [
    new RegExp(`\\b${escaped}\\s+is\\s+([^,.!?]{4,90})`, "i"),
    new RegExp(`\\b${escaped}\\s+[^.]{0,60}\\b(?:ranger|fighter|druid|rogue|thief|wizard|cleric|bard|scout|warrior|mage)\\b[^,.!?]{0,50}`, "i"),
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return compactRoleText(match[1]);
    }
    if (match?.[0]) {
      return compactRoleText(match[0].replace(new RegExp(`^${escaped}\\s+`, "i"), ""));
    }
  }

  return "";
}

function inferCharacterBackgroundText(text, name, index) {
  const role = inferCharacterRoleText(text, name);
  if (role) {
    return `${name} is ${role}.`;
  }
  return index === 0
    ? `${name} is the player character introduced in the opening scene.`
    : `${name} is introduced as a trusted party member in the opening scene.`;
}

function compactRoleText(value) {
  return String(value ?? "")
    .replace(/\band\b.*$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.!,;:]+$/, "");
}

function uniqueNames(names) {
  const seen = new Set();
  return names.filter((name) => {
    const key = normalizeNameKey(name);
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function isLikelyCharacterName(name) {
  const key = normalizeNameKey(name);
  return Boolean(key) && !new Set(["the", "they", "there", "forest", "camp", "test", "trying", "on"]).has(key);
}

function normalizeNameKey(value) {
  return String(value ?? "").trim().toLowerCase();
}

function slugify(value) {
  return normalizeNameKey(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "member";
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
  state.turnFlow.clearRepair();
}

function setCampaignFromPayload(payload, contextPurpose) {
  const previousCampaignId = state.campaign?.id;
  state.campaign = normalizeCampaign(payload.campaign);
  state.sourceMode = payload.source ?? "sqlite";
  state.sqlitePath = payload.sqlitePath;
  state.campaigns = payload.campaigns ?? state.campaigns;
  state.contextPack = buildContextPack(state.campaign, {
    purpose: contextPurpose,
  });
  state.prompt = "";
  state.reviewBatch = null;
  if (previousCampaignId && previousCampaignId !== state.campaign.id) {
    state.turnFlow.clearRepair();
  }
}

function currentProviderSettings() {
  const settings = state.campaign?.providerSettings ?? {};
  const saved = loadLastProviderSettings();
  const preferredProvider = settings.preferredProvider === "chatgpt"
    ? "bridge"
    : settings.preferredProvider || saved.preferredProvider || "ollama";
  return {
    preferredProvider,
    selectedModel: settings.selectedModel || saved.selectedModel || "llama3.1:8b",
    generationTimeoutMs: Number(settings.generationTimeoutMs || saved.generationTimeoutMs) || 120000,
    outputLimit: Math.max(1800, Number(settings.outputLimit || saved.outputLimit) || 1800),
    fastMode: settings.fastMode ?? saved.fastMode ?? false,
    ollamaBaseUrl: settings.ollamaBaseUrl || saved.ollamaBaseUrl || "http://127.0.0.1:11434",
  };
}

function turnProjection() {
  return state.turnFlow.getProjection();
}

function hasActiveGeneration() {
  return state.turnFlow.hasActiveGeneration();
}

function activeTurnRepair() {
  return state.turnFlow.getRepair();
}

function turnFlowBlocksNewTurn() {
  const projection = turnProjection();
  return projection.hasActiveGeneration || projection.hasRepair || projection.isResolving;
}

function currentAppMode() {
  return clientMode ? "thin" : "full";
}

async function switchAppMode(mode) {
  const nextMode = mode === "thin" ? "thin" : "full";
  localStorage.setItem(appModeStorageKey, nextMode);
  renderAppModeControls();

  if (nextMode === currentAppMode()) {
    setProviderActivity(nextMode === "thin" ? "Already in ThinLoreKeeper mode" : "Already in full LoreKeeper mode", "idle");
    return;
  }

  if (window.lorekeeperDesktop?.relaunchMode) {
    setProviderActivity(`Relaunching as ${nextMode === "thin" ? "ThinLoreKeeper" : "LoreKeeper"}...`, "working");
    await window.lorekeeperDesktop.relaunchMode(nextMode);
    return;
  }

  const shortcut = nextMode === "thin" ? "ThinLoreKeeper" : "LoreKeeper";
  setProviderActivity(`Use the ${shortcut} shortcut to open that mode`, "waiting");
}

function renderAppModeControls() {
  if (elements.appModeSelect) {
    elements.appModeSelect.value = currentAppMode();
  }
  if (elements.appModeNote) {
    elements.appModeNote.textContent = clientMode
      ? "ThinLoreKeeper is the lightweight companion mode. It joins a host and syncs visible Table State."
      : "Full LoreKeeper hosts campaigns, owns SQLite and AI providers, and can also join another host when needed.";
  }
}

function loadLastProviderSettings() {
  try {
    return JSON.parse(localStorage.getItem(userSettingsStorageKey) || "{}");
  } catch {
    return {};
  }
}

function rememberProviderSettings(settings) {
  localStorage.setItem(userSettingsStorageKey, JSON.stringify({
    preferredProvider: settings.preferredProvider,
    selectedModel: settings.selectedModel,
    generationTimeoutMs: settings.generationTimeoutMs,
    outputLimit: settings.outputLimit,
    fastMode: settings.fastMode,
    ollamaBaseUrl: settings.ollamaBaseUrl,
  }));
}

async function saveProviderSettingsFromControls() {
  const timeoutSeconds = Number(elements.generationTimeout.value) || 120;
  const patch = {
    preferredProvider: elements.providerMode.value || "bridge",
    selectedModel: elements.ollamaModel.value || "llama3.1:8b",
    generationTimeoutMs: Math.max(10, timeoutSeconds) * 1000,
    outputLimit: Math.max(128, Number(elements.outputLimit.value) || 1800),
    fastMode: elements.fastMode.checked,
  };

  try {
    setProviderActivity("Saving provider settings...", "working");
    const response = await fetch(apiProviderSettingsUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    const payload = await response.json();
    setCampaignFromPayload(payload, "provider_settings_update");
    rememberProviderSettings(currentProviderSettings());
    state.providerStatus = payload.providerStatus ?? state.providerStatus;
    render();
    setProviderActivity("Provider settings saved", "idle");
  } catch (error) {
    elements.bridgeStatus.textContent = error instanceof Error ? `Provider settings failed: ${error.message}` : "Provider settings failed";
    setProviderActivity("Provider settings save failed", "error");
  }
}

async function refreshProviderStatus({ quiet = false } = {}) {
  try {
    if (!quiet) {
      setProviderActivity("Checking local AI...", "working");
    }
    const response = await fetch(apiProviderStatusUrl);
    if (!response.ok) {
      throw new Error(await response.text());
    }
    state.providerStatus = await response.json();
    renderProviderControls();
    if (!quiet) {
      setProviderActivity("Provider status refreshed", "idle");
    }
  } catch (error) {
    elements.ollamaStatus.textContent = error instanceof Error ? `Status check failed: ${error.message}` : "Status check failed";
    if (!quiet) {
      setProviderActivity("Provider status check failed", "error");
    }
  }
}

function renderProviderControls() {
  if (!state.campaign) {
    return;
  }

  if (clientMode) {
    elements.providerMode.disabled = true;
    elements.ollamaModel.disabled = true;
    elements.pullOllamaModel.disabled = true;
    elements.testOllama.disabled = true;
    elements.generationTimeout.disabled = true;
    elements.outputLimit.disabled = true;
    elements.fastMode.disabled = true;
    elements.checkSidecar.disabled = true;
    elements.copyProviderPrompt.disabled = true;
    elements.newProviderChat.disabled = true;
    elements.newCampaign.disabled = true;
    elements.loadImported.disabled = true;
    elements.recheckProvider.hidden = true;
    elements.bridgeCard.hidden = true;
    elements.promptDrawer.hidden = true;
    elements.ollamaStatus.textContent = "ThinLoreKeeper uses the host provider.";
    elements.ollamaBenchmark.textContent = "No local model or browser bridge is needed in this window.";
    applyThinModeChrome();
    return;
  }

  const settings = currentProviderSettings();
  elements.providerMode.value = settings.preferredProvider;
  elements.generationTimeout.value = String(Math.round(settings.generationTimeoutMs / 1000));
  elements.outputLimit.value = String(settings.outputLimit);
  elements.fastMode.checked = settings.fastMode;
  renderModelOptions(settings);

  const ollama = state.providerStatus?.providers?.ollama;
  if (ollama) {
    elements.ollamaStatus.textContent = providerStatusLabel(ollama);
    elements.ollamaBenchmark.textContent = ollama.selectedModelAvailable
      ? `${modelDisplayName(settings.selectedModel)} is installed and ready.`
      : providerSetupHint(ollama, settings.selectedModel);
    renderSelectedModelSummary(settings, ollama);
  }

  elements.checkSidecar.disabled = settings.preferredProvider !== "bridge";
  elements.newProviderChat.disabled = settings.preferredProvider !== "bridge";
  elements.recheckProvider.hidden = settings.preferredProvider !== "bridge";
  elements.bridgeCard.hidden = settings.preferredProvider !== "bridge";
  elements.promptDrawer.hidden = settings.preferredProvider !== "bridge";
  applyFullModeChrome();
}

function applyThinModeChrome() {
  renderAppModeControls();
  document.body.classList.add("thin-lorekeeper-mode");
  elements.deleteCampaign.hidden = true;
  elements.providerStatus.textContent = "Mode: ThinLoreKeeper companion";
  hideSetupSection(elements.providerMode, true);
  hideSetupSection(elements.newCampaign, true);
  hideSetupSection(elements.responseImport, true);
  elements.startLocalTable.hidden = true;
  elements.stopLocalTable.hidden = true;
  elements.resolvePartyInputs.hidden = true;
  elements.joinCampaign.hidden = false;
  if (elements.joinCampaignMain) {
    elements.joinCampaignMain.hidden = false;
    elements.joinCampaignMain.disabled = hasActiveGeneration();
  }
  if (elements.syncGuestTable) {
    elements.syncGuestTable.hidden = false;
  }
  elements.recheckProvider.hidden = true;
  elements.cancelGeneration.hidden = true;
  document.querySelectorAll("[data-add-domain]").forEach((button) => {
    button.hidden = true;
    button.disabled = true;
  });
  const connected = state.guestSession?.status === "connected";
  const activeCombatTurn = state.campaign?.combat?.inCombat ? state.campaign.combat.currentTurnId : null;
  const isGuestCombatTurn = !activeCombatTurn || activeCombatTurn === state.guestSession?.partyMemberId;
  elements.playerInput.disabled = !connected || !isGuestCombatTurn;
  elements.playerInput.placeholder = !connected
    ? "Join a hosted LoreKeeper table before sending party-member actions."
    : isGuestCombatTurn
      ? `Type as ${state.guestSnapshot?.assignedCharacter?.name ?? "your assigned party member"}. The host submits it to the DM.`
      : `Waiting for ${labelById(state.campaign, activeCombatTurn)}'s combat turn.`;
  elements.buildTurn.disabled = !connected || !isGuestCombatTurn;
  elements.buildTurn.textContent = "Send To Host";
}

function applyFullModeChrome() {
  renderAppModeControls();
  document.body.classList.remove("thin-lorekeeper-mode");
  elements.deleteCampaign.hidden = false;
  hideSetupSection(elements.providerMode, false);
  hideSetupSection(elements.newCampaign, false);
  hideSetupSection(elements.responseImport, false);
  elements.startLocalTable.hidden = false;
  elements.stopLocalTable.hidden = false;
  elements.resolvePartyInputs.hidden = false;
  elements.joinCampaign.hidden = false;
  if (elements.joinCampaignMain) {
    elements.joinCampaignMain.hidden = true;
    elements.joinCampaignMain.disabled = true;
  }
  if (elements.syncGuestTable) {
    elements.syncGuestTable.hidden = false;
  }
  document.querySelectorAll("[data-add-domain]").forEach((button) => {
    button.hidden = false;
    button.disabled = false;
  });
  const combatGate = hostCombatInputGate();
  elements.playerInput.disabled = combatGate.inputDisabled;
  elements.playerInput.placeholder = combatGate.placeholder || "I check the alley for watchers. (Keep this tense and heist-focused.)";
  elements.buildTurn.disabled = !turnProjection().canSubmit || combatGate.sendDisabled;
  elements.buildTurn.textContent = "Send Turn";
}

function hostCombatInputGate() {
  const combat = state.campaign?.combat;
  if (!combat?.inCombat || !combat.currentTurnId) {
    return { inputDisabled: false, sendDisabled: false, placeholder: "" };
  }
  const activeId = combat.currentTurnId;
  const activeMember = findById(state.campaign.party, activeId);
  if (activeMember && isHostControlledPartyRecord(activeMember)) {
    return {
      inputDisabled: false,
      sendDisabled: false,
      placeholder: `Act as ${activeMember.name}. It is their combat turn.`,
    };
  }
  const stagedForActive = collectStagedRemoteInputs().length > 0;
  const activeName = labelById(state.campaign, activeId);
  return {
    inputDisabled: true,
    sendDisabled: !stagedForActive,
    placeholder: stagedForActive
      ? `${activeName}'s remote action is staged. Send Turn resolves it.`
      : `Waiting for ${activeName}'s combat turn.`,
  };
}

function hideSetupSection(element, hidden) {
  const section = element?.closest(".setup-section");
  if (section) {
    section.hidden = hidden;
  }
}

function renderModelOptions(settings) {
  const ollama = state.providerStatus?.providers?.ollama;
  const installed = installedOllamaModelIds();
  const recommended = (ollama?.recommendedModels ?? []).map((model) => model.id);
  const options = dedupeModelOptions([settings.selectedModel, ...installed, ...recommended].filter(Boolean), settings.selectedModel);

  elements.ollamaModel.replaceChildren(
    ...options.map((model) => {
      const option = document.createElement("option");
      option.value = model;
      option.textContent = formatModelOptionLabel(model, isOllamaModelInstalled(model, installed));
      option.selected = normalizeOllamaModelId(model) === normalizeOllamaModelId(settings.selectedModel);
      return option;
    }),
  );
}

function installedOllamaModelIds() {
  const ollama = state.providerStatus?.providers?.ollama;
  return (ollama?.models ?? []).map((model) => model.name || model.model).filter(Boolean);
}

function dedupeModelOptions(modelIds, selectedModel) {
  const byCanonicalId = new Map();
  const selectedCanonicalId = normalizeOllamaModelId(selectedModel);
  for (const modelId of modelIds) {
    const canonicalId = normalizeOllamaModelId(modelId);
    if (!canonicalId) {
      continue;
    }

    const current = byCanonicalId.get(canonicalId);
    const candidateIsSelected = canonicalId === selectedCanonicalId;
    const currentIsSelected = normalizeOllamaModelId(current) === selectedCanonicalId;
    if (!current || (candidateIsSelected && !currentIsSelected)) {
      byCanonicalId.set(canonicalId, modelId);
    }
  }

  return [...byCanonicalId.values()];
}

function isOllamaModelInstalled(modelId, installedModels) {
  const canonicalId = normalizeOllamaModelId(modelId);
  return installedModels.some((installed) => normalizeOllamaModelId(installed) === canonicalId);
}

function formatModelOptionLabel(modelId, isInstalled) {
  const descriptor = getRecommendedModelDescriptor(modelId);
  const label = descriptor?.label ?? modelId;
  const badges = [
    isInstalled ? "installed" : "download needed",
    descriptor?.recommended ? "recommended" : null,
    descriptor?.spec ? `${descriptor.spec} spec` : null,
  ].filter(Boolean);
  return `${label} - ${badges.join(" / ")}`;
}

function renderSelectedModelSummary(settings, ollama) {
  const modelId = settings.selectedModel;
  const installedModelNames = (ollama.models ?? []).map((model) => model.name || model.model).filter(Boolean);
  const installed = isOllamaModelInstalled(modelId, installedModelNames);
  const descriptor = getRecommendedModelDescriptor(modelId);
  const chips = [
    descriptor?.recommended ? "Recommended" : null,
    descriptor?.spec ? `${descriptor.spec} Spec` : null,
    descriptor?.speed ? `Speed: ${descriptor.speed}` : null,
    descriptor?.quality ? `Quality: ${descriptor.quality}` : null,
    installed ? "Installed" : "Not Downloaded",
  ].filter(Boolean);

  elements.ollamaModelSummary.replaceChildren(
    ...chips.map((chip) => {
      const span = document.createElement("span");
      span.className = `model-chip ${chip === "Not Downloaded" ? "missing" : ""}`;
      span.textContent = chip;
      return span;
    }),
  );

  elements.pullOllamaModel.hidden = installed;
  elements.pullOllamaModel.disabled = ollama.state === "ollama_not_installed" || ollama.state === "ollama_not_running";
  elements.pullOllamaModel.textContent = "Download";
  elements.pullOllamaModel.title = `Download ${modelId} with Ollama`;
}

function getRecommendedModelDescriptor(modelId) {
  const canonicalId = normalizeOllamaModelId(modelId);
  const model = recommendedOllamaModels.find((candidate) => normalizeOllamaModelId(candidate.id) === canonicalId);
  if (!model) {
    return {
      label: modelId,
      spec: "Custom",
      speed: null,
      quality: null,
      recommended: false,
    };
  }

  return {
    ...model,
    spec: model.spec ?? inferModelSpec(model.id),
    recommended: Boolean(model.recommended),
  };
}

function inferModelSpec(modelId) {
  if (/14b|27b|70b/i.test(modelId)) {
    return "High";
  }
  if (/nemo|12b/i.test(modelId)) {
    return "Medium";
  }
  return "Low";
}

function providerStatusLabel(ollama) {
  if (ollama.state === "ready") {
    return `Ollama ready: ${modelDisplayName(ollama.selectedModel)}`;
  }
  if (ollama.state === "selected_model_missing") {
    return `Ollama running; ${modelDisplayName(ollama.selectedModel)} is not downloaded`;
  }
  if (ollama.state === "ollama_not_running") {
    return "Ollama installed but not running";
  }
  if (ollama.state === "ollama_not_installed") {
    return "Ollama is not installed";
  }
  return ollama.runtimeMessage || "Ollama status unknown";
}

function providerSetupHint(ollama, selectedModel) {
  if (ollama.state === "ollama_not_installed") {
    return "Install Ollama from ollama.com, then reopen setup and refresh local AI.";
  }
  if (ollama.state === "ollama_not_running") {
    return "Start Ollama, then refresh local AI.";
  }
  return `${modelDisplayName(selectedModel)} is missing. Use Download to pull it locally.`;
}

function modelDisplayName(modelId) {
  return getRecommendedModelDescriptor(modelId)?.label ?? modelId;
}

async function testOllamaModel() {
  try {
    setProviderActivity("Testing Ollama model...", "working");
    const startedAt = performance.now();
    const response = await fetch(apiOllamaTestUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: elements.ollamaModel.value }),
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    const result = await response.json();
    const elapsed = Math.round(performance.now() - startedAt);
    elements.ollamaBenchmark.textContent =
      `Test ${result.ok ? "passed" : "returned"} in ${Math.round((result.durationMs ?? elapsed) / 1000)}s: ${result.text.trim()}`;
    setProviderActivity("Ollama test complete", result.ok ? "idle" : "waiting");
  } catch (error) {
    elements.ollamaBenchmark.textContent = error instanceof Error ? error.message : "Ollama test failed.";
    setProviderActivity("Ollama test failed", "error");
  }
}

async function pullOllamaModel() {
  const model = elements.ollamaModel.value;
  if (!model) {
    elements.ollamaBenchmark.textContent = "Choose a model to download.";
    return;
  }

  try {
    elements.pullOllamaModel.disabled = true;
    elements.pullOllamaModel.textContent = "Downloading...";
    setProviderActivity(`Downloading ${model}...`, "working");
    const response = await fetch(apiOllamaPullUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model }),
    });

    if (!response.ok || !response.body) {
      throw new Error(await response.text());
    }

    for await (const event of readNdjsonResponse(response.body)) {
      if (event.type === "progress") {
        const progress = event.progress ?? {};
        elements.ollamaBenchmark.textContent = formatPullProgress(model, progress);
      } else if (event.type === "done") {
        elements.ollamaBenchmark.textContent = `${model} downloaded. Refreshing local models...`;
        await saveProviderSettingsPatch({ selectedModel: model, preferredProvider: "ollama" });
        await refreshProviderStatus({ quiet: true });
        setProviderActivity(`${model} ready`, "idle");
      } else if (event.type === "error") {
        throw new Error(event.error || "Model download failed.");
      }
    }
  } catch (error) {
    elements.ollamaBenchmark.textContent = error instanceof Error ? error.message : "Model download failed.";
    setProviderActivity("Model download failed", "error");
  } finally {
    renderProviderControls();
  }
}

async function saveProviderSettingsPatch(patch) {
  const response = await fetch(apiProviderSettingsUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const payload = await response.json();
  setCampaignFromPayload(payload, "provider_settings_update");
  state.providerStatus = payload.providerStatus ?? state.providerStatus;
  render();
  return payload;
}

function formatPullProgress(model, progress) {
  if (progress.total && progress.completed) {
    const pct = Math.round((progress.completed / progress.total) * 100);
    return `Downloading ${model}: ${pct}% (${formatBytes(progress.completed)} / ${formatBytes(progress.total)})`;
  }

  return `Downloading ${model}: ${progress.status || "working..."}`;
}

function formatBytes(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes)) {
    return "?";
  }
  if (bytes > 1024 ** 3) {
    return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  }
  if (bytes > 1024 ** 2) {
    return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  }
  return `${Math.round(bytes / 1024)} KB`;
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
      meta: cleanMessageMeta(message.meta),
      source: message.source,
      data: message.data || {},
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
  const providerSettings = currentProviderSettings();
  elements.providerStatus.textContent = providerSettings.preferredProvider === "ollama"
    ? `Provider: Ollama ${providerSettings.selectedModel}`
    : "Provider: ChatGPT campaign chat/manual";
  if (providerSettings.preferredProvider === "bridge" && state.bridge.mode === "extension") {
    elements.providerStatus.textContent = state.bridge.ready
      ? "Provider: campaign chat ready"
      : "Provider: campaign chat waiting";
  }
  elements.saveStatus.textContent = clientMode ? "ThinLoreKeeper: host-owned SQLite" : `Binder: ${state.sourceMode} / SQLite target`;
  if (state.sqlitePath) {
    elements.saveStatus.textContent = "SQLite: active campaign file";
  }
  if (elements.nudgeDm) {
    updateNudgeAvailability();
  }

  renderPlayLog();
  renderParty(campaign);
  renderCombatTracker(campaign);
  renderPeople(campaign);
  renderPlaces(campaign);
  renderThings(campaign);
  renderQuests(campaign);
  renderPrompt(state.prompt);
  renderReviewBatch();
  renderCampaignSelector();
  renderProviderControls();
  renderMultiplayerPanel();
}

function renderCampaignSelector() {
  const campaigns = state.campaigns ?? [];
  elements.deleteCampaign.disabled = !state.sqlitePath || !state.campaign?.title;

  if (clientMode) {
    const option = document.createElement("option");
    option.value = "thin-lorekeeper";
    option.textContent = state.campaign?.title ?? "ThinLoreKeeper";
    option.selected = true;
    elements.campaignSelect.replaceChildren(option);
    elements.campaignSelect.disabled = true;
    elements.deleteCampaign.disabled = true;
    return;
  }

  elements.campaignSelect.disabled = false;

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
    elements.bridgeStatus.textContent = "No active campaign file to delete";
    return;
  }

  elements.deleteCampaignTitle.textContent = `Delete ${state.campaign.title}`;
  elements.deleteCampaignMessage.textContent =
    `This will permanently delete "${state.campaign.title}" from this device, remove its SQLite file, and clean up the campaign index.`;
  elements.confirmDeleteCampaign.disabled = false;
  elements.deleteCampaignDialog.showModal();
  elements.confirmDeleteCampaign.focus();
}

async function deleteActiveCampaign() {
  try {
    elements.bridgeStatus.textContent = "Deleting campaign...";
    const response = await fetch(apiDeleteCampaignUrl, {
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
    setCampaignFromPayload(payload, "campaign_deleted_context");
    seedPlayLog();
    render();
    elements.deleteCampaignDialog.close();
    elements.bridgeStatus.textContent = "Campaign deleted";
  } catch (error) {
    elements.bridgeStatus.textContent = error instanceof Error ? `Delete failed: ${error.message}` : "Delete failed";
  }
}

async function importProviderResponse(responseText, options = {}) {
  if (!responseText) {
    elements.bridgeStatus.textContent = "Paste a provider response first";
    setProviderActivity("Paste a provider response first", "idle");
    return;
  }

  const extraction = extractLorekeeperUpdates(responseText);
  const cleanedText = cleanProviderResponseForPlay(responseText);
  const tableMessages = splitProviderTableMessages(cleanedText, state.campaign, extraction.proposedChanges);
  const implicitSceneChange = options.autoCommit
    ? createImplicitSceneProgressChange(tableMessages, extraction.proposedChanges)
    : null;
  const implicitCombatChange = options.autoCommit
    ? createImplicitCombatStartChange(tableMessages, extraction.proposedChanges, options.data?.turnResponse)
    : null;
  const combatContextChanges = implicitCombatChange
    ? [...extraction.proposedChanges, implicitCombatChange]
    : extraction.proposedChanges;
  const implicitCombatEnemyChange = options.autoCommit
    ? createImplicitCombatEnemySyncChange(tableMessages, combatContextChanges, options.data?.turnResponse)
    : null;
  const implicitCombatAdvanceChange = options.autoCommit
    ? createImplicitCombatAdvanceChange(extraction.proposedChanges, options.data?.turnResponse, options.data?.turn)
    : null;
  const actorPromptContextChanges = [
    ...extraction.proposedChanges,
    ...(implicitCombatChange ? [implicitCombatChange] : []),
    ...(implicitCombatEnemyChange ? [implicitCombatEnemyChange] : []),
    ...(implicitCombatAdvanceChange ? [implicitCombatAdvanceChange] : []),
  ];
  const implicitCombatActorPromptChange = options.autoCommit
    ? createImplicitCombatActorPromptChange(tableMessages, actorPromptContextChanges, options.data?.turnResponse)
    : null;
  const proposedChanges = [
    ...extraction.proposedChanges,
    ...(implicitSceneChange ? [implicitSceneChange] : []),
    ...(implicitCombatChange ? [implicitCombatChange] : []),
    ...(implicitCombatEnemyChange ? [implicitCombatEnemyChange] : []),
    ...(implicitCombatAdvanceChange ? [implicitCombatAdvanceChange] : []),
    ...(implicitCombatActorPromptChange ? [implicitCombatActorPromptChange] : []),
  ];
  const choiceOwnerIndex = choiceOwnerMessageIndex(tableMessages);
  for (const [messageIndex, message] of tableMessages.entries()) {
    await appendPlayMessage({
      ...message,
      meta: cleanMessageMeta(message.meta || options.meta || ""),
      source: options.source ? `${options.source}_response` : message.source,
      data: providerMessageData({
        message,
        messageIndex,
        options,
        choiceOwnerIndex,
        import: {
          source: options.source || "manual_import",
          responseChars: responseText.length,
          cleanedChars: cleanedText.length,
          proposedChanges: proposedChanges.length,
          extractionError: extraction.error || "",
        },
      }),
    });
  }

  const reviewBatch = createReviewBatch({
    campaignId: state.campaign.id,
    source: options.source || "manual_import",
    rawResponse: responseText,
    proposedChanges,
  });

  state.reviewBatch = reviewBatch.proposedChanges.length > 0 ? reviewBatch : null;
  const autoCommitResult = options.autoCommit ? await autoCommitReviewBatch(reviewBatch) : null;

  elements.responseImport.value = "";
  if (extraction.error) {
    pushDiagnosticsEvent("provider_import_warning", {
      source: options.source || "manual_import",
      error: extraction.error,
      responseChars: responseText.length,
    });
    elements.bridgeStatus.textContent = `DM response imported; ${extraction.error}`;
    setProviderActivity("Imported response; no state updates saved", "waiting");
  } else if (autoCommitResult?.applied?.length) {
    elements.bridgeStatus.textContent = `${autoCommitResult.applied.length} state change${autoCommitResult.applied.length === 1 ? "" : "s"} saved to SQLite`;
    setProviderActivity("State updated from local response", "idle");
  } else if (proposedChanges.length > 0) {
    elements.bridgeStatus.textContent = `${proposedChanges.length} proposed state change${proposedChanges.length === 1 ? "" : "s"} awaiting review`;
    setProviderActivity("Imported response; proposed changes awaiting review", "waiting");
  } else {
    elements.bridgeStatus.textContent = "DM response imported with no proposed changes";
    setProviderActivity("Imported provider response", "idle");
  }
  pushDiagnosticsEvent("provider_imported", {
    source: options.source || "manual_import",
    responseChars: responseText.length,
    cleanedChars: cleanedText.length,
    proposedChanges: proposedChanges.length,
    autoCommitted: Boolean(autoCommitResult?.applied?.length),
  });
  render();
  if (options.rememberProviderText !== false) {
    state.bridge.lastImportedProviderText = responseText;
  }
  if (options.autoCommit && autoCommitResult?.applied?.length) {
    schedulePostImportAutomation();
  }
  return {
    imported: true,
    proposedChanges: proposedChanges.length,
    reviewBatch: state.reviewBatch,
    extraction,
    autoCommitResult,
  };
}

function schedulePostImportAutomation() {
  if (clientMode || state.guestSession?.hostBaseUrl) {
    return;
  }
  window.setTimeout(async () => {
    try {
      await maybeAutoResolveEnemyCombatTurn();
      await maybeAutoResolveCombatRemoteInputs();
    } catch (error) {
      pushDiagnosticsEvent("post_import_automation_failed", {
        message: error instanceof Error ? error.message : String(error ?? "Unknown error"),
      });
    }
  }, 350);
}

async function autoCommitReviewBatch(reviewBatch) {
  if (!reviewBatch?.proposedChanges?.length) {
    return null;
  }

  const safeBatch = {
    ...reviewBatch,
    proposedChanges: reviewBatch.proposedChanges.map((change) => ({
      ...change,
      status: shouldAutoApproveChange(change) ? "approved" : change.status,
    })),
  };

  if (!safeBatch.proposedChanges.some((change) => change.status === "approved")) {
    return null;
  }

  return commitExtractedChanges(safeBatch);
}

function shouldAutoApproveChange(change) {
  if (change.validation?.valid === false || change.status === "rejected") {
    return false;
  }
  if (change.importance === "major" || change.visibility === "dm_only" || change.visibility === "system_only") {
    return false;
  }
  return true;
}

function createImplicitSceneProgressChange(tableMessages = [], proposedChanges = []) {
  if (proposedChanges.some((change) => normalizeChangeDomain(change.domain) === "scene")) {
    return null;
  }

  const latestDmText = [...tableMessages]
    .reverse()
    .find((message) => message.role === "dm" && message.body?.trim())?.body;
  const immediateSituation = compactSceneSituation(latestDmText);
  if (!immediateSituation) {
    return null;
  }

  return {
    operation: "update",
    domain: "scene",
    targetId: null,
    importance: "minor",
    visibility: "player_visible",
    summary: "Scene advanced from latest DM narration.",
    data: {
      status: "in_progress",
      immediateSituation,
      lastBeatAt: new Date().toISOString(),
    },
    confidence: "high",
    reason: "Keeps SQLite scene state aligned with the imported DM beat so later turns do not repeat stale prompts.",
  };
}

function createImplicitCombatStartChange(tableMessages = [], proposedChanges = [], turnResponse = null) {
  if (state.campaign?.combat?.inCombat) {
    return null;
  }
  if (proposedChanges.some((change) => normalizeChangeDomain(change.domain) === "combat")) {
    return null;
  }

  const latestDmText = latestDmNarration(tableMessages);
  const structuredCombatSignal = hasStructuredCombatSignal(turnResponse);
  if (!structuredCombatSignal && !isCombatStartNarration(latestDmText)) {
    return null;
  }

  const enemies = inferCombatEnemies(latestDmText);
  const immediateSituation = compactSceneSituation(latestDmText);
  return {
    operation: "update",
    domain: "combat",
    targetId: null,
    importance: "normal",
    visibility: "player_visible",
    summary: "Combat started from latest DM narration.",
    data: {
      inCombat: true,
      round: state.campaign?.combat?.round || 1,
      stakes: immediateSituation,
      enemies,
      lastAction: "Combat started from DM narration.",
    },
    confidence: structuredCombatSignal ? "high" : "medium",
    reason: "Keeps SQLite combat state aligned when a fight is visibly underway but the model omitted an explicit combat update.",
  };
}

function createImplicitCombatEnemySyncChange(tableMessages = [], proposedChanges = [], turnResponse = null) {
  const latestDmText = latestDmNarration(tableMessages);
  const combatWillBeActive =
    Boolean(state.campaign?.combat?.inCombat) ||
    proposedChanges.some((change) => normalizeChangeDomain(change.domain) === "combat" && change.data?.inCombat === true) ||
    hasStructuredCombatSignal(turnResponse) ||
    isCombatStartNarration(latestDmText);
  if (!combatWillBeActive) {
    return null;
  }

  const inferredEnemies = inferCombatEnemies(latestDmText);
  if (!inferredEnemies.length) {
    return null;
  }

  const knownEnemies = [
    ...(state.campaign?.combat?.enemies ?? []),
    ...proposedChanges.flatMap((change) => {
      if (normalizeChangeDomain(change.domain) !== "combat") {
        return [];
      }
      return [
        ...(Array.isArray(change.data?.enemies) ? change.data.enemies : []),
        ...(Array.isArray(change.data?.enemyUpdates) ? change.data.enemyUpdates : []),
      ];
    }),
  ];
  const knownKeys = new Set(knownEnemies.flatMap(enemyIdentityKeys));
  const missingEnemies = inferredEnemies.filter((enemy) =>
    enemyIdentityKeys(enemy).every((key) => !knownKeys.has(key))
  );
  if (!missingEnemies.length) {
    return null;
  }

  return {
    operation: "update",
    domain: "combat",
    targetId: null,
    importance: "normal",
    visibility: "player_visible",
    summary: "Combatant inferred from latest DM narration.",
    data: {
      inCombat: true,
      round: state.campaign?.combat?.round || 1,
      enemyUpdates: missingEnemies,
      lastAction: "Missing combatant added to initiative from DM narration.",
    },
    confidence: hasStructuredCombatSignal(turnResponse) ? "high" : "medium",
    reason: "Keeps the 5E initiative tracker populated when the DM narration names an active hostile but the model omits it from combat state.",
  };
}

function createImplicitCombatAdvanceChange(proposedChanges = [], turnResponse = null, submittedTurn = null) {
  const combat = state.campaign?.combat ?? {};
  if (!combat.inCombat || !combat.currentTurnId) {
    return null;
  }
  const currentTurn = submittedTurn ?? state.currentTurn;
  const rawTurn = String(currentTurn?.playerMessage || "").trim();
  if (!rawTurn || /^\(DM nudge:/i.test(rawTurn)) {
    return null;
  }
  const combatChanges = proposedChanges.filter((change) => normalizeChangeDomain(change.domain) === "combat");
  if (combatChanges.some((change) =>
    change.data?.advanceTurn ||
    change.data?.turnResolved ||
    (change.data?.currentTurnId && change.data.currentTurnId !== combat.currentTurnId) ||
    (change.data?.activeActorId && change.data.activeActorId !== combat.currentTurnId)
  )) {
    return null;
  }
  const actorId =
    currentTurn?.playerInputs?.find((input) => input.characterId)?.characterId ||
    combat.currentTurnId;
  if (!actorId || actorId !== combat.currentTurnId) {
    return null;
  }
  return {
    operation: "update",
    domain: "combat",
    targetId: null,
    importance: "normal",
    visibility: "player_visible",
    summary: `${labelById(state.campaign, actorId)} completed their combat turn.`,
    data: {
      inCombat: true,
      turnResolved: true,
      advanceTurn: true,
      resolvedActorId: actorId,
      lastAction: `${labelById(state.campaign, actorId)}'s combat turn resolved.`,
    },
    confidence: turnResponse?.sceneStatus?.mode === "combat" ? "high" : "medium",
    reason: "Advances the persisted 5E initiative tracker after the active actor's action resolves.",
  };
}

function createImplicitCombatActorPromptChange(tableMessages = [], proposedChanges = [], turnResponse = null) {
  const campaign = state.campaign;
  const combat = campaign?.combat ?? {};
  if (!campaign || !combat.inCombat || !combat.currentTurnId) {
    return null;
  }

  const promptedActorId =
    promptedCombatActorIdFromTurnResponse(turnResponse, campaign) ||
    promptedCombatActorIdFromMessages(tableMessages, campaign);
  if (!promptedActorId || promptedActorId === combat.currentTurnId) {
    return null;
  }
  if (combatActorType(campaign, promptedActorId) !== "party") {
    return null;
  }
  if (combatActorType(campaign, combat.currentTurnId) === "party") {
    return null;
  }

  const combatChanges = proposedChanges.filter((change) => normalizeChangeDomain(change.domain) === "combat");
  if (combatChanges.some((change) =>
    change.data?.advanceTurn ||
    change.data?.turnResolved ||
    change.data?.currentTurnId ||
    change.data?.activeActorId
  )) {
    return null;
  }

  const actorName = labelById(campaign, promptedActorId);
  return {
    operation: "update",
    domain: "combat",
    targetId: null,
    importance: "normal",
    visibility: "player_visible",
    summary: `${actorName} is the active combat actor.`,
    data: {
      inCombat: true,
      promptedActorId,
      onlyFromNonParty: true,
      lastAction: `Combat prompt handed initiative to ${actorName}.`,
    },
    confidence: turnResponse?.sceneStatus?.mode === "combat" || turnResponse?.choices?.forActorId ? "high" : "medium",
    reason: "Repairs stale initiative when the DM asks a party actor to act but persisted currentTurnId still points at an enemy or DM actor.",
  };
}

function promptedCombatActorIdFromTurnResponse(turnResponse = null, campaign = state.campaign) {
  const choices = turnResponse?.choices;
  if (!choices) {
    return "";
  }
  const byId = normalizePromptedActorId(choices.forActorId, campaign);
  if (byId) {
    return byId;
  }
  const byName = partyMemberIdByName(campaign, choices.forActor);
  if (byName) {
    return byName;
  }
  const optionActorIds = (choices.options ?? [])
    .map((option) => normalizePromptedActorId(option?.actorId, campaign))
    .filter(Boolean);
  const uniqueIds = [...new Set(optionActorIds)];
  if (uniqueIds.length === 1) {
    return uniqueIds[0];
  }
  const optionActorNames = (choices.options ?? [])
    .map((option) => partyMemberIdByName(campaign, option?.actor))
    .filter(Boolean);
  const uniqueNames = [...new Set(optionActorNames)];
  return uniqueNames.length === 1 ? uniqueNames[0] : "";
}

function promptedCombatActorIdFromMessages(tableMessages = [], campaign = state.campaign) {
  for (const message of [...tableMessages].reverse()) {
    if (message.role !== "dm" && message.role !== "provider") {
      continue;
    }
    const fromData = promptedCombatActorIdFromMessageData(message.data, campaign);
    if (fromData) {
      return fromData;
    }
    const body = String(message.body ?? "");
    const fromText = promptedCombatActorIdFromText(body, campaign);
    if (fromText) {
      return fromText;
    }
  }
  return "";
}

function promptedCombatActorIdFromMessageData(data = {}, campaign = state.campaign) {
  return (
    promptedCombatActorIdFromTurnResponse(data.turnResponse, campaign) ||
    promptedCombatActorIdFromTurnResponse({ choices: data.choices }, campaign)
  );
}

function promptedCombatActorIdFromText(text = "", campaign = state.campaign) {
  const normalized = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }
  for (const member of campaign?.party ?? []) {
    const name = member.name || labelById(campaign, member.id);
    const firstName = String(name).split(/\s+/)[0];
    const namePatterns = [name, firstName].filter(Boolean).map(escapeRegExp);
    if (!namePatterns.length) {
      continue;
    }
    const actorPattern = `(?:${namePatterns.join("|")})`;
    const promptPatterns = [
      `\\bwhat\\s+do\\s+you\\s+want\\s+${actorPattern}\\s+to\\s+(?:do|try|attempt|respond)\\b`,
      `\\b(?:what|how)\\s+(?:does|should|will|can)\\s+${actorPattern}\\s+(?:do|respond|act|react)\\b`,
      `\\b${actorPattern}\\s*,?\\s+what\\s+do\\s+you\\s+do\\b`,
      `\\b${actorPattern}'s\\s+turn\\b`,
      `\\bact\\s+as\\s+${actorPattern}\\b`,
    ];
    if (promptPatterns.some((pattern) => new RegExp(pattern, "i").test(normalized))) {
      return member.id;
    }
  }
  return "";
}

function normalizePromptedActorId(actorId, campaign = state.campaign) {
  const id = String(actorId ?? "").trim();
  if (!id) {
    return "";
  }
  if ((campaign?.party ?? []).some((member) => member.id === id)) {
    return id;
  }
  return partyMemberIdByName(campaign, id);
}

function partyMemberIdByName(campaign = state.campaign, value = "") {
  const key = normalizeNameKey(value);
  if (!key) {
    return "";
  }
  const match = (campaign?.party ?? []).find((member) => {
    const name = normalizeNameKey(member.name);
    const id = normalizeNameKey(member.id);
    const first = normalizeNameKey(String(member.name ?? "").split(/\s+/)[0]);
    return key === name || key === id || key === first;
  });
  return match?.id || "";
}

function latestDmNarration(tableMessages = []) {
  return [...tableMessages]
    .reverse()
    .find((message) => message.role === "dm" && message.body?.trim())?.body || "";
}

function hasStructuredCombatSignal(turnResponse = null) {
  return Boolean(
    turnResponse?.sceneStatus?.mode === "combat" ||
    turnResponse?.sceneStatus?.danger === "combat" ||
    turnResponse?.flags?.startsCombat === true
  );
}

function isCombatStartNarration(text = "") {
  return /\b(under attack|roll initiative|initiative|enemy|monster|creature|beast|wolf|wounded beast|bar fight|brawl|throws? (?:a )?punch|punch(?:es|ed|ing)?|counterattack|crossbow bolt|blood|fangs|claws|charging|charges|attacks|attackers?|weapon drawn|readies? (?:a )?(?:weapon|crossbow|bow|spell))\b/i.test(text);
}

function inferCombatEnemies(text = "") {
  const lower = String(text).toLowerCase();
  const enemies = [];
  const addEnemy = (id, name, type = "enemy") => {
    if (!enemies.some((enemy) => enemy.id === id || normalizeNameKey(enemy.name) === normalizeNameKey(name))) {
      enemies.push({ id, name, type, hp: null, conditions: [] });
    }
  };

  if (/\bwolf\b/.test(lower)) {
    addEnemy("enemy-wolf", "Massive wolf", "beast");
  } else if (/\bbeast\b/.test(lower)) {
    addEnemy("enemy-beast", "Unknown beast", "beast");
  } else if (/\bcreature\b/.test(lower)) {
    addEnemy("enemy-creature", "Unknown creature", "creature");
  } else if (/\bmonster\b/.test(lower)) {
    addEnemy("enemy-monster", "Unknown monster", "monster");
  }

  if (/\bdrunk (?:miner|dwarf|mining dwarf)\b|\bminer dwarf\b|\bdwarven miner\b/.test(lower)) {
    addEnemy("enemy-drunk-miner", "Drunk miner", "humanoid");
  } else if (/\bminer\b/.test(lower) && /\b(bar fight|brawl|throws? (?:a )?punch|punch(?:es|ed|ing)?|attacks?|hostile|counterattack)\b/.test(lower)) {
    addEnemy("enemy-hostile-miner", "Hostile miner", "humanoid");
  }
  if (/\b(?:bully|brawler|thug)\b/.test(lower)) {
    addEnemy("enemy-brawler", "Brawler", "humanoid");
  }
  if (/\bbandit\b/.test(lower)) {
    addEnemy("enemy-bandit", "Bandit", "humanoid");
  }
  return enemies;
}

function enemyIdentityKeys(enemy = {}) {
  return [
    enemy.id,
    enemy.enemyId,
    enemy.name,
    enemy.title,
  ]
    .map(normalizeNameKey)
    .filter(Boolean);
}

function compactSceneSituation(text = "") {
  const cleaned = String(text)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line && !isChoiceLikeLine(line) && !/^what (?:does|do|would|will|should|can)\b/i.test(line))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) {
    return "";
  }
  return cleaned.length > 520 ? `${cleaned.slice(0, 519).trimEnd()}...` : cleaned;
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
    if (isChoiceLikeLine(line)) {
      dmLines.push(line);
      continue;
    }

    const speakerLine = parseSpeakerLine(line, speakerLookup);
    if (speakerLine) {
      if (isHostControlledPartyRecord(speakerLine.record)) {
        pushDiagnosticsEvent("host_character_autopost_suppressed", {
          name: speakerLine.name,
          body: speakerLine.body,
        });
        continue;
      }

      flushDmLines();
      messages.push({
        role: "party",
        title: speakerLine.name,
        body: speakerLine.body || "Acts at the table.",
        source: "provider_response",
        meta: "Pending host approval",
        data: {
          status: "pending_party_approval",
          characterId: speakerLine.record?.id ?? null,
          characterName: speakerLine.name,
          controllerKind: partyControllerKind(speakerLine.record),
          suggestedByProvider: true,
        },
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
    .map((record) => ({
      record,
      name: record.name || record.title,
    }))
    .filter((entry) => entry.name)
    .map((entry) => ({
      record: entry.record,
      name: String(entry.name).trim(),
    }))
    .filter((entry) => entry.name);
  const firstNames = new Map();

  names.forEach(({ name, record }) => {
    const first = name.split(/\s+/)[0];
    if (!first) {
      return;
    }
    const key = first.toLowerCase();
    firstNames.set(key, firstNames.has(key) ? null : { name, record });
  });

  const lookup = new Map();
  names.forEach(({ name, record }) => lookup.set(name.toLowerCase(), { name, record }));
  for (const [first, entry] of firstNames) {
    if (entry) {
      lookup.set(first, entry);
    }
  }

  return [...lookup.entries()]
    .sort((a, b) => b[0].length - a[0].length)
    .map(([alias, entry]) => ({ alias, name: entry.name, record: entry.record }));
}

function choiceOwnerMessageIndex(messages) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === "dm" || messages[index].role === "provider") {
      return index;
    }
  }
  return Math.max(0, messages.length - 1);
}

function providerMessageData({ message, messageIndex, options = {}, choiceOwnerIndex, import: importData }) {
  const base = {
    ...(message.data || {}),
    import: importData,
  };
  const structuredChoices = options.data?.choices ?? null;
  const ownsChoices = structuredChoices?.options?.length && messageIndex === choiceOwnerIndex;
  if (!ownsChoices) {
    return base;
  }

  return {
    ...base,
    choiceOwner: true,
    choices: structuredChoices,
    turnResponse: options.data?.turnResponse ?? null,
    providerRunId: options.data?.providerResult?.requestId ?? options.data?.providerResult?.request_id ?? null,
  };
}

function parseSpeakerLine(line, speakerLookup) {
  if (isChoiceLikeLine(line)) {
    return null;
  }
  const normalized = line.replace(/^[-*]\s+/, "").replace(/^\*\*(.+?)\*\*/, "$1").trim();
  for (const speaker of speakerLookup) {
    const escaped = escapeRegExp(speaker.alias);
    const pattern = new RegExp(`^(?:["“”']?)(?:\\*\\*)?${escaped}(?:\\*\\*)?\\s*[:\\-]\\s*(.+)$`, "i");
    const match = normalized.match(pattern);
    if (match) {
      return {
        name: speaker.name,
        body: match[1].trim(),
        record: speaker.record,
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
  if (message.role === "player") {
    state.forceScrollToBottom = true;
  }
  const normalized = {
    id: message.id || `msg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    sessionId: message.sessionId || state.campaign.sessionLog?.activeSessionId || "session-main",
    role: message.role,
    title: message.title,
    body: message.body,
    meta: cleanMessageMeta(message.meta || ""),
    source: message.source || "lorekeeper_ui",
    providerRunId: message.providerRunId || null,
    createdAt: message.createdAt || new Date().toISOString(),
    data: message.data || {},
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
      lastImportedProviderText: state.bridge.lastImportedProviderText,
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
      lastImportedProviderText: state.bridge.lastImportedProviderText,
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
      lastImportedProviderText: state.bridge.lastImportedProviderText,
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
    return { providerReceived: false };
  }

  let baselineProviderText = "";

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
        lastImportedProviderText: state.bridge.lastImportedProviderText,
      };
      setProviderActivity("Extension unavailable; prompt copied for manual paste", "error");
      return { providerReceived: false };
    }

    const baselineResponse = await readLatestCompanionResponse().catch(() => null);
    baselineProviderText = baselineResponse?.text ?? "";
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
          responseTimeoutMs: 150000,
        },
      },
      190000,
    );
    progress.stop();

    state.bridge = {
      mode: "extension",
      ready: Boolean(result.ready),
      lastRun: result,
      lastImportedProviderText: state.bridge.lastImportedProviderText,
    };
    if (result.found || result.created) {
      await persistProviderConversationFromBridge(result);
    }

    if (result.sent && result.response?.text) {
      setProviderActivity("ChatGPT response received; importing...", "working");
      await importProviderResponse(result.response.text);
      return { providerReceived: true, imported: true };
    }

    if (result.response?.needsManualSubmit) {
      elements.bridgeStatus.textContent = "Prompt is in the campaign chat; press the send arrow";
      setProviderActivity("Prompt inserted in ChatGPT; press send in provider tab", "waiting");
      state.bridge = {
        mode: "extension",
        ready: true,
        lastRun: result,
        lastImportedProviderText: state.bridge.lastImportedProviderText,
      };
      render();
      return { providerReceived: false, needsManualSubmit: true };
    }

    if (result.loginRequired) {
      await copyPromptToClipboard(prompt, {
        successMessage: "ChatGPT needs login; prompt copied",
        failureMessage: "ChatGPT needs login; copy from prompt drawer",
      });
      setProviderActivity("ChatGPT needs login; prompt copied", "error");
      render();
      return { providerReceived: false };
    }

    const recovered = await importLatestProviderResponse({
      newerThanText: baselineProviderText,
      quietIfUnchanged: true,
    });
    if (recovered?.imported) {
      return { providerReceived: Boolean(result.sent), imported: true, recovered: true };
    }

    await copyPromptToClipboard(prompt, {
      successMessage: "Sidecar did not return a response; prompt copied",
      failureMessage: "Sidecar did not return a response; copy from prompt drawer",
    });
    setProviderActivity("No provider response returned; prompt copied", "error");
    return { providerReceived: Boolean(result.sent) };
  } catch (error) {
    stopSidecarProgress();
    const recovered = await importLatestProviderResponse({
      newerThanText: baselineProviderText,
      quietIfUnchanged: true,
    }).catch(() => null);
    if (recovered?.imported) {
      setProviderActivity("Recovered ChatGPT response after bridge timeout", "idle");
      return { providerReceived: true, imported: true, recovered: true };
    }

    await copyPromptToClipboard(prompt, {
      successMessage: "Sidecar failed; prompt copied",
      failureMessage: "Sidecar failed; copy from prompt drawer",
    });
    state.bridge = {
      mode: "manual",
      ready: false,
      lastRun: null,
      lastImportedProviderText: state.bridge.lastImportedProviderText,
    };
    setProviderActivity("Provider run failed; prompt copied for manual paste", "error");
    render();
    return { providerReceived: false, error };
  }
}

async function runPromptThroughLocalProvider(turn) {
  if (!turn?.playerMessage?.trim()) {
    setProviderActivity("Build a table turn first", "idle");
    return { providerReceived: false };
  }

  state.turnFlow.beginLogicalTurn({
    campaign: state.campaign,
    turn,
    inputKind: /^\(DM nudge:/i.test(turn.playerMessage) ? "nudge" : "player",
    actorId: state.campaign?.combat?.currentTurnId ?? null,
  });
  elements.cancelGeneration.hidden = false;
  elements.cancelGeneration.disabled = false;
  elements.buildTurn.disabled = true;
  setProviderActivity("Generating locally with Ollama...", "working");
  pushDiagnosticsEvent("ollama_generation_started", {
    turnId: turn.turnId,
    playerMessage: turn.playerMessage,
    playerInputs: turn.playerInputs ?? [],
    promptChars: turn.providerPrompt?.length ?? 0,
    providerSettings: currentProviderSettings(),
  });
  render();

  try {
    const run = providerOrchestrator.startLocalGeneration({
      turn,
      providerSettings: currentProviderSettings(),
      validateProviderResult: contractIssueFromProviderResult,
      renderStructuredResponse: (structured) => renderTurnResponseForImport(structured, { includeChoices: false }),
      onEvent: handleProviderGenerationEvent,
    });
    state.turnFlow.startGeneration(run);
    const result = await run.promise;
    if (result?.timedOut || result?.canceled) {
      setProviderActivity(
        result.timedOut ? "Local generation timed out; Send Turn can retry" : "Local generation canceled",
        result.timedOut ? "error" : "idle",
      );
      elements.bridgeStatus.textContent = result.timedOut ? "Local generation timed out" : "Local generation canceled";
      return { providerReceived: Boolean(result.providerReceived), canceled: Boolean(result.canceled), timedOut: Boolean(result.timedOut) };
    }
    if (result?.validationIssue) {
      const meta = providerResultMeta(result.providerResult);
      setTurnRepair({
        reason: result.validationIssue,
        source: "ollama",
        turn,
        responseText: result.responseText,
        rawText: result.rawText,
        parseError: result.providerResult?.parseError || "",
        validationErrors: result.providerResult?.validationErrors ?? [],
        providerResult: result.providerResult,
        meta,
      });
      return { providerReceived: true, imported: false, needsRepair: true };
    }
    if (result?.responseText?.trim()) {
      const meta = providerResultMeta(result.providerResult);
      await importProviderResponse(result.responseText, {
        source: "ollama",
        meta,
        autoCommit: true,
        data: {
          providerResult: result.providerResult,
          turnResponse: result.providerResult?.structured ?? null,
          choices: structuredChoicesForMessage(result.providerResult?.structured),
          turn,
        },
      });
      setProviderActivity(meta ? `Local response imported (${meta})` : "Local response imported", "idle");
      return { providerReceived: Boolean(result.providerReceived), imported: true };
    }
    throw result?.error || new Error("Ollama returned no response text.");
  } catch (error) {
    pushDiagnosticsEvent("ollama_generation_failed", {
      turnId: turn.turnId,
      message: error instanceof Error ? error.message : String(error ?? "Ollama failed"),
      stack: error instanceof Error ? error.stack : "",
    });
    state.turnFlow.failGeneration(error);
    setProviderActivity(error instanceof Error ? `Ollama failed: ${error.message}` : "Ollama failed", "error");
    elements.bridgeStatus.textContent = error instanceof Error ? `Ollama failed: ${error.message}` : "Ollama failed";
    render();
    return { providerReceived: false, error };
  } finally {
    elements.cancelGeneration.hidden = true;
    elements.cancelGeneration.disabled = true;
    updateNudgeAvailability();
    render();
  }
}

function handleProviderGenerationEvent(event) {
  state.turnFlow.applyProviderEvent(event);
  if (event.type === "generation_started" && event.model) {
    setProviderActivity(`Ollama generating with ${event.model}...`, "working");
    pushDiagnosticsEvent("ollama_stream_started", event);
  } else if (event.type === "generation_completed") {
    pushDiagnosticsEvent("ollama_generation_done", {
      turnId: event.turnId,
      requestId: event.requestId,
      result: event.response?.providerResult,
      streamedTextChars: event.response?.responseText?.length ?? 0,
    });
  } else if (event.type === "generation_failed") {
    pushDiagnosticsEvent("ollama_stream_failed", {
      turnId: event.turnId,
      requestId: event.requestId,
      error: event.error,
      recoverable: event.recoverable,
    });
  } else if (event.type === "generation_cancelled") {
    pushDiagnosticsEvent("ollama_generation_canceled", {
      turnId: event.turnId,
      requestId: event.requestId,
      reason: event.reason,
      providerReceived: event.response?.providerReceived,
      responseChars: event.response?.responseText?.length ?? 0,
    });
  }
}

function providerResultMeta(result) {
  return result
    ? `Ollama ${result.model}; ${Math.round((result.durationMs ?? 0) / 1000)}s; context ${result.contextSize ?? 0} chars`
    : "";
}

function isChoiceLikeLine(line) {
  return /^\s*(?:[-*]\s*)?(?:[A-Ha-h]|\d{1,2})\s*[\).:-]\s+/.test(String(line ?? ""));
}

function partyControllerKind(member) {
  if (!member) {
    return "ai_companion";
  }
  return member.controllerKind || (member.type === "player_character" ? "host" : "ai_companion");
}

function isHostControlledPartyRecord(member) {
  return partyControllerKind(member) === "host";
}

function contractIssueFromProviderResult(result) {
  if (!result) {
    return "missing provider result";
  }
  if (result.parseError) {
    return result.parseError;
  }
  if (Array.isArray(result.validationErrors) && result.validationErrors.length) {
    return result.validationErrors[0];
  }
  return "";
}

function cancelActiveGeneration() {
  state.turnFlow.cancelGeneration("user_cancelled");
}

function setTurnRepair(repair) {
  const savedRepair = state.turnFlow.setRepair(repair);
  pushDiagnosticsEvent("turn_repair_required", summarizeTurnRepair(savedRepair));
  const reason = compactUiText(savedRepair.reason || "model response failed the JSON contract", 180);
  elements.bridgeStatus.textContent = `Model response needs repair: ${reason}`;
  setProviderActivity(`Needs repair - ${reason}. Inspect or retry.`, "error");
  updateNudgeAvailability();
  render();
}

function clearTurnRepair() {
  state.turnFlow.clearRepair();
  updateTurnRepairControls();
  updateNudgeAvailability();
}

function compactUiText(value, limit = 160) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length <= limit ? text : `${text.slice(0, Math.max(0, limit - 1)).trimEnd()}...`;
}

function cleanMessageMeta(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(?:meta\s*:\s*)+/i, "")
    .trim();
}

async function retryTurnRepair() {
  const repair = activeTurnRepair();
  if (!repair?.turn) {
    setProviderActivity("No repairable turn is available", "error");
    return;
  }
  setProviderActivity("Retrying with strict JSON contract...", "working");
  state.turnFlow.retryLastTurn();
  updateTurnRepairControls();
  updateNudgeAvailability();
  await runPromptThroughLocalProvider(repair.turn);
}

async function inspectTurnRepair() {
  if (!activeTurnRepair()) {
    return;
  }
  if (elements.setupDialog && !elements.setupDialog.open) {
    elements.setupDialog.showModal();
  }
  await refreshDiagnostics();
  setProviderActivity("Repair details are open in Settings diagnostics", "waiting");
}

async function importTurnRepairAnyway() {
  const repair = activeTurnRepair();
  if (!repair?.responseText) {
    setProviderActivity("No rejected response text is available", "error");
    return;
  }

  const confirmed = await confirmInApp({
    title: "Import Invalid Response?",
    message: "This model response failed the LoreKeeper JSON contract. Importing it may add bad choices or stale state. Use this only when the visible text is worth keeping.",
    acceptLabel: "Import Anyway",
  });
  if (!confirmed) {
    setProviderActivity("Invalid response import canceled", "waiting");
    return;
  }

  clearTurnRepair();
  await importProviderResponse(repair.responseText, {
    source: repair.source || "ollama_repair",
    meta: [repair.meta, "imported despite contract failure"].filter(Boolean).join("; "),
    autoCommit: false,
    rememberProviderText: true,
    data: {
      providerResult: repair.providerResult,
      turn: repair.turn,
      contractWarning: repair.reason,
      importedDespiteContractFailure: true,
    },
  });
}

async function* readNdjsonResponse(body) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
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

async function importLatestProviderResponse({
  newerThanText = "",
  requireNewerThanLastImport = false,
  quietIfUnchanged = false,
} = {}) {
  setProviderActivity("Reading latest ChatGPT response...", "working");
  const latest = await readLatestCompanionResponse();
  const latestText = latest?.text?.trim() ?? "";

  if (!latestText) {
    elements.bridgeStatus.textContent = "No provider response found to import";
    setProviderActivity("No provider response found", "idle");
    return { imported: false, reason: "empty" };
  }

  if (newerThanText && latestText === newerThanText.trim()) {
    if (!quietIfUnchanged) {
      elements.bridgeStatus.textContent = "Latest provider response has not changed";
      setProviderActivity("Latest provider response has not changed", "idle");
    }
    return { imported: false, reason: "unchanged" };
  }

  if (requireNewerThanLastImport && latestText === state.bridge.lastImportedProviderText?.trim()) {
    elements.bridgeStatus.textContent = "Latest provider response is already imported";
    setProviderActivity("Latest provider response already imported", "idle");
    return { imported: false, reason: "duplicate" };
  }

  elements.bridgeStatus.textContent = "Importing latest ChatGPT response...";
  setProviderActivity("Importing latest ChatGPT response...", "working");
  await importProviderResponse(latestText);
  return { imported: true, response: latest };
}

async function readLatestCompanionResponse() {
  const probe = await probeExtensionBridge();
  if (!probe.available || !probe.result?.found || !probe.result?.tab?.id) {
    return null;
  }

  const response = await sendExtensionMessage(
    {
      type: "lorekeeper.providerCommand",
      tabId: probe.result.tab.id,
      command: "readLatestResponse",
      payload: {},
    },
    12000,
  );

  return response?.found ? response : null;
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

async function refreshDiagnostics() {
  if (!elements.diagnosticsOutput) {
    return null;
  }

  elements.diagnosticsStatus.textContent = "Reading";
  const bundle = await buildDiagnosticsSnapshot();
  elements.diagnosticsOutput.value = JSON.stringify(bundle, null, 2);
  elements.diagnosticsStatus.textContent = "Ready";
  return bundle;
}

async function copyDiagnosticsToClipboard() {
  const text = elements.diagnosticsOutput?.value || JSON.stringify(await refreshDiagnostics(), null, 2);
  if (!text) {
    elements.diagnosticsStatus.textContent = "Empty";
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
    elements.diagnosticsStatus.textContent = "Copied";
    setProviderActivity("Diagnostics JSON copied", "idle");
  } catch {
    elements.diagnosticsStatus.textContent = "Copy blocked";
    setProviderActivity("Diagnostics copy blocked; JSON is visible in Settings", "error");
  }
}

async function buildDiagnosticsSnapshot() {
  const renderer = buildRendererDiagnostics();
  if (clientMode) {
    return {
      generatedAt: new Date().toISOString(),
      mode: "thin",
      renderer,
    };
  }

  try {
    const response = await fetch(apiDiagnosticsUrl, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(await response.text());
    }
    return {
      ...(await response.json()),
      renderer,
    };
  } catch (error) {
    return {
      generatedAt: new Date().toISOString(),
      diagnosticsError: error instanceof Error ? error.message : "Diagnostics request failed.",
      renderer,
    };
  }
}

function buildRendererDiagnostics() {
  return {
    generatedAt: new Date().toISOString(),
    url: redactedRendererUrl(),
    clientMode,
    sourceMode: state.sourceMode,
    sqlitePath: state.sqlitePath || "",
    providerActivity: {
      text: elements.providerActivityLabel?.textContent || "",
      state: elements.providerActivity?.dataset.state || "",
    },
    bridgeStatus: elements.bridgeStatus?.textContent || "",
    turnEngine: state.turnFlow.getProjection(),
    currentTurn: summarizeCurrentTurn(state.currentTurn),
    promptChars: state.prompt?.length ?? 0,
    promptTail: state.prompt ? state.prompt.slice(-6000) : "",
    reviewBatch: state.reviewBatch,
    bridge: state.bridge,
    turnRepair: summarizeTurnRepair(activeTurnRepair()),
    recentPlayMessages: state.playMessages.slice(-30),
    diagnosticsEvents: state.diagnosticsEvents.slice(-80),
    campaignCounts: state.campaign ? {
      party: state.campaign.party?.length ?? 0,
      people: state.campaign.people?.length ?? 0,
      places: state.campaign.places?.length ?? 0,
      items: state.campaign.items?.length ?? 0,
      threads: state.campaign.quests?.length ?? 0,
      messages: state.campaign.sessionLog?.messages?.length ?? 0,
    } : {},
  };
}

function redactedRendererUrl() {
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.has("lkToken")) {
      url.searchParams.set("lkToken", "[redacted]");
    }
    return url.toString();
  } catch {
    return String(window.location.href).replace(/([?&]lkToken=)[^&]+/i, "$1[redacted]");
  }
}

function summarizeCurrentTurn(turn) {
  if (!turn) {
    return null;
  }

  return {
    playerMessage: turn.playerMessage,
    playerInputs: turn.playerInputs ?? [],
    parsedMessage: turn.parsedMessage,
    contextSections: turn.contextPack?.sections?.map((section) => ({
      id: section.id,
      title: section.title,
      entries: section.entries?.length ?? 0,
    })) ?? [],
    providerPromptChars: turn.providerPrompt?.length ?? 0,
  };
}

function summarizeTurnRepair(repair) {
  if (!repair) {
    return null;
  }
  return {
    reason: repair.reason,
    validationErrors: repair.validationErrors,
    parseError: repair.parseError,
    responseTextChars: repair.responseText?.length ?? 0,
    rawTextChars: repair.rawText?.length ?? 0,
    model: repair.providerResult?.model,
    createdAt: repair.createdAt,
  };
}

function pushDiagnosticsEvent(type, detail = {}) {
  state.diagnosticsEvents.push({
    type,
    detail,
    at: new Date().toISOString(),
  });
  if (state.diagnosticsEvents.length > 120) {
    state.diagnosticsEvents.splice(0, state.diagnosticsEvents.length - 120);
  }
}

function reportUiError(error) {
  const message = error instanceof Error ? error.message : String(error ?? "Unknown UI error");
  pushDiagnosticsEvent("ui_error", {
    message,
    stack: error instanceof Error ? error.stack : "",
  });
  if (elements.bridgeStatus) {
    elements.bridgeStatus.textContent = `UI error: ${message}`;
  }
  setProviderActivity(`UI error: ${message}`, "error");
}

function setProviderActivity(message, status = "idle") {
  if (!elements.providerActivity) {
    return;
  }

  if (elements.providerActivityLabel) {
    elements.providerActivityLabel.textContent = message;
  } else {
    elements.providerActivity.textContent = message;
  }
  elements.providerActivity.dataset.state = status;
  updateTurnRepairControls();
}

function updateNudgeAvailability() {
  if (!elements.nudgeDm) {
    return;
  }
  const projection = turnProjection();
  elements.nudgeDm.disabled = clientMode || !projection.canNudge || !state.campaign;
  elements.nudgeDm.title = projection.hasRepair
    ? "Resolve the model repair first"
    : projection.hasActiveGeneration
      ? "DM is already generating"
      : "Nudge DM";
}

function updateTurnRepairControls() {
  const projection = turnProjection();
  const active = projection.hasRepair;
  if (elements.repairRetry) {
    elements.repairRetry.hidden = !active;
    elements.repairRetry.disabled = projection.hasActiveGeneration;
  }
  if (elements.repairInspect) {
    elements.repairInspect.hidden = !active;
  }
  if (elements.repairImportAnyway) {
    elements.repairImportAnyway.hidden = !active;
    elements.repairImportAnyway.disabled = projection.hasActiveGeneration;
  }
  if (elements.recheckProvider) {
    elements.recheckProvider.hidden = active || clientMode;
  }
}

function setupCommandDeckResize() {
  const handle = elements.commandResizeHandle;
  if (!handle) {
    return;
  }

  let startY = 0;
  let startHeight = 0;

  setCommandDeckHeight(readStoredCommandDeckHeight());

  handle.addEventListener("pointerdown", (event) => {
    startY = event.clientY;
    startHeight = currentCommandDeckHeight();
    handle.setPointerCapture(event.pointerId);
    document.body.classList.add("resizing-command-deck");
    document.querySelector(".command-deck")?.classList.add("resizing");
    event.preventDefault();
  });

  handle.addEventListener("pointermove", (event) => {
    if (!handle.hasPointerCapture(event.pointerId)) {
      return;
    }

    setCommandDeckHeight(startHeight + startY - event.clientY, true);
  });

  handle.addEventListener("pointerup", (event) => {
    if (handle.hasPointerCapture(event.pointerId)) {
      handle.releasePointerCapture(event.pointerId);
    }
    finishCommandDeckResize();
  });

  handle.addEventListener("pointercancel", finishCommandDeckResize);

  handle.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
      return;
    }

    event.preventDefault();
    const delta = event.key === "ArrowUp" ? 12 : -12;
    setCommandDeckHeight(currentCommandDeckHeight() + delta, true);
  });

  window.addEventListener("resize", () => {
    setCommandDeckHeight(currentCommandDeckHeight(), true);
  });
}

function finishCommandDeckResize() {
  document.body.classList.remove("resizing-command-deck");
  document.querySelector(".command-deck")?.classList.remove("resizing");
  localStorage.setItem(commandDeckHeightStorageKey, String(currentCommandDeckHeight()));
}

function readStoredCommandDeckHeight() {
  const stored = Number(localStorage.getItem(commandDeckHeightStorageKey));
  return Number.isFinite(stored) ? stored : 120;
}

function currentCommandDeckHeight() {
  const rawValue = getComputedStyle(document.documentElement).getPropertyValue("--command-deck-height");
  const parsed = Number.parseFloat(rawValue);
  return Number.isFinite(parsed) ? parsed : readStoredCommandDeckHeight();
}

function setCommandDeckHeight(value, persist = false) {
  const height = clampCommandDeckHeight(value);
  document.documentElement.style.setProperty("--command-deck-height", `${height}px`);
  elements.commandResizeHandle?.setAttribute("aria-valuenow", String(height));
  elements.commandResizeHandle?.setAttribute("aria-valuemin", String(commandDeckMinHeight()));
  elements.commandResizeHandle?.setAttribute("aria-valuemax", String(commandDeckMaxHeight()));
  if (persist) {
    localStorage.setItem(commandDeckHeightStorageKey, String(height));
  }
}

function clampCommandDeckHeight(value) {
  return Math.min(commandDeckMaxHeight(), Math.max(commandDeckMinHeight(), Math.round(Number(value) || 120)));
}

function commandDeckMinHeight() {
  return 92;
}

function commandDeckMaxHeight() {
  return Math.max(140, Math.round(window.innerHeight * 0.42));
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
    lastImportedProviderText: state.bridge.lastImportedProviderText,
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
  const playLog = elements.playLog;
  const wasNearBottom = isPlayLogNearBottom(playLog);
  const previousScrollBottom = playLog.scrollHeight - playLog.scrollTop;
  const messages = state.streamingMessage
    ? [...state.playMessages, state.streamingMessage]
    : state.playMessages;
  const visibleMessages = dedupeProviderPartySuggestions(
    messages.filter((message) => !shouldHideAutonomousHostMessage(message)),
  );

  playLog.replaceChildren(
    ...visibleMessages.map((message) => {
      const wrapper = document.createElement("article");
      wrapper.className = [
        "play-message",
        message.role,
        message.data?.status || "",
        isLocalControllerMessage(message) ? "local" : "",
      ].filter(Boolean).join(" ");

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
      bubble.append(header, ...messageBodyElements(message.body, message.role, message.data));
      const cleanedMeta = cleanMessageMeta(message.meta);
      if (cleanedMeta) {
        const meta = document.createElement("small");
        meta.className = "message-meta";
        meta.textContent = `Meta: ${cleanedMeta}`;
        bubble.append(meta);
      }
      const pendingAction = pendingInputActionForMessage(message);
      if (pendingAction) {
        const actionRow = document.createElement("div");
        actionRow.className = "message-actions";
        if (message.data?.hostStaged) {
          const status = document.createElement("span");
          status.className = "message-action-status";
          status.textContent = "Staged for Send Turn";
          actionRow.append(status);
        } else {
          const stageButton = document.createElement("button");
          stageButton.type = "button";
          stageButton.className = "mini-action message-submit-action";
          stageButton.textContent = "Stage";
          stageButton.title = "Stage this character action for the next Send Turn";
          stageButton.addEventListener("click", () => resolvePendingInput(pendingAction.id));
          actionRow.append(stageButton);
        }
        bubble.append(actionRow);
      }
      const partyApproval = partyApprovalStateForMessage(message);
      if (partyApproval) {
        bubble.append(renderPartyApprovalActions(message, partyApproval));
      }
      wrapper.append(avatar, bubble);
      return wrapper;
    }),
  );
  if (state.forceScrollToBottom || wasNearBottom) {
    playLog.scrollTop = playLog.scrollHeight;
  } else {
    playLog.scrollTop = Math.max(0, playLog.scrollHeight - previousScrollBottom);
  }
  state.forceScrollToBottom = false;
}

function isPlayLogNearBottom(playLog) {
  if (!playLog) {
    return true;
  }
  return playLog.scrollHeight - playLog.scrollTop - playLog.clientHeight < 96;
}

function dedupeProviderPartySuggestions(messages) {
  const seen = new Set();
  return messages.filter((message) => {
    if (message.role !== "party" || !isProviderAuthoredPartyMessage(message)) {
      return true;
    }
    const key = [
      speakerName(message).trim().toLowerCase(),
      String(message.body || "").replace(/\s+/g, " ").trim().toLowerCase(),
    ].join("::");
    if (!key.endsWith("::") && seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function partyApprovalStateForMessage(message) {
  if (message.role !== "party" || !isProviderAuthoredPartyMessage(message) || shouldHideAutonomousHostMessage(message)) {
    return null;
  }
  const status = message.data.status || "pending_party_approval";
  if (!["pending_party_approval", "approved_party_input", "rejected_party_input", "submitted_party_input"].includes(status)) {
    return null;
  }
  return { status };
}

function shouldHideAutonomousHostMessage(message) {
  if (message.role !== "party" || !isProviderAuthoredPartyMessage(message)) {
    return false;
  }
  const member = partyMemberForMessage(message);
  return Boolean(member && isHostControlledPartyRecord(member));
}

function isProviderAuthoredPartyMessage(message) {
  return Boolean(
    message.data?.suggestedByProvider ||
    message.source === "provider_response" ||
    message.source === "ollama_response" ||
    message.source === "bridge_response" ||
    message.data?.import?.source
  );
}

function partyMemberForMessage(message) {
  const id = message.data?.characterId;
  if (id) {
    const match = findById(state.campaign.party, id);
    if (match) {
      return match;
    }
  }
  const name = speakerName(message).trim().toLowerCase();
  return (state.campaign.party ?? []).find((member) => String(member.name || "").trim().toLowerCase() === name) ?? null;
}

function renderPartyApprovalActions(message, approval) {
  const actionRow = document.createElement("div");
  actionRow.className = "message-actions party-approval-actions";

  if (approval.status === "pending_party_approval") {
    const approveButton = document.createElement("button");
    approveButton.type = "button";
    approveButton.className = "mini-action message-approve-action";
    approveButton.textContent = "Approve";
    approveButton.title = "Approve this companion contribution for the next submitted turn";
    approveButton.addEventListener("click", () => setPartySuggestionStatus(message, "approved_party_input"));

    const rejectButton = document.createElement("button");
    rejectButton.type = "button";
    rejectButton.className = "mini-action secondary-action";
    rejectButton.textContent = "Reject";
    rejectButton.title = "Do not submit this companion contribution";
    rejectButton.addEventListener("click", () => setPartySuggestionStatus(message, "rejected_party_input"));

    actionRow.append(approveButton, rejectButton);
    return actionRow;
  }

  const status = document.createElement("span");
  status.className = "message-action-status";
  status.textContent = {
    approved_party_input: "Approved for next turn",
    rejected_party_input: "Rejected",
    submitted_party_input: "Submitted",
  }[approval.status] || approval.status;
  actionRow.append(status);

  if (approval.status === "approved_party_input" || approval.status === "rejected_party_input") {
    const undoButton = document.createElement("button");
    undoButton.type = "button";
    undoButton.className = "mini-action secondary-action";
    undoButton.textContent = "Undo";
    undoButton.addEventListener("click", () => setPartySuggestionStatus(message, "pending_party_approval"));
    actionRow.append(undoButton);
  }

  return actionRow;
}

async function setPartySuggestionStatus(message, status) {
  const meta = {
    pending_party_approval: "Pending host approval",
    approved_party_input: "Approved for next turn",
    rejected_party_input: "Rejected by host",
    submitted_party_input: "Submitted to DM/model",
  }[status] || "";

  await patchPlayMessage(message.id, {
    meta,
    data: {
      status,
      decidedAt: new Date().toISOString(),
    },
  });
  setProviderActivity(meta || "Party suggestion updated", status === "approved_party_input" ? "waiting" : "idle");
}

async function patchPlayMessage(messageId, patch = {}) {
  patchPlayMessageLocal(messageId, patch);
  render();

  try {
    const response = await fetch(apiCampaignMessageUpdateUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: messageId,
        ...patch,
      }),
    });
    if (!response.ok) {
      throw new Error(await response.text());
    }
    const result = await response.json();
    setCampaignFromPayload(result, "message_update");
    seedPlayLog();
    render();
  } catch (error) {
    setProviderActivity(error instanceof Error ? `Message update failed: ${error.message}` : "Message update failed", "error");
  }
}

function patchPlayMessageLocal(messageId, patch = {}) {
  const applyPatch = (message) => message.id === messageId
    ? {
      ...message,
      body: typeof patch.body === "string" ? patch.body : message.body,
      meta: typeof patch.meta === "string" ? cleanMessageMeta(patch.meta) : cleanMessageMeta(message.meta),
      data: {
        ...(message.data ?? {}),
        ...(patch.data ?? {}),
      },
    }
    : message;
  state.playMessages = state.playMessages.map(applyPatch);
  if (state.campaign?.sessionLog?.messages) {
    state.campaign = {
      ...state.campaign,
      sessionLog: {
        ...state.campaign.sessionLog,
        messages: state.campaign.sessionLog.messages.map(applyPatch),
      },
    };
  }
}

function pendingInputActionForMessage(message) {
  const pendingInputId = message.data?.pendingInputId;
  if (!pendingInputId || message.data?.status !== "pending_model_submit") {
    return null;
  }
  return (state.campaign.multiplayer?.pendingTurnInputs ?? [])
    .find((input) => input.id === pendingInputId && input.ready && !input.passed && input.text);
}

function isLocalControllerMessage(message) {
  if (state.guestSession?.status === "connected") {
    const characterId = state.guestSession.partyMemberId;
    const playerId = state.guestSession.playerId;
    const assignedName = state.guestSnapshot?.assignedCharacter?.name;
    return Boolean(
      (characterId && message.data?.characterId === characterId) ||
      (playerId && message.data?.playerId === playerId) ||
      (assignedName && message.role === "party" && speakerName(message) === assignedName)
    );
  }
  return message.role === "player";
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
    ...campaign.party.map((member) => {
      const pendingConnection = pendingJoinConnectionForMember(campaign, member.id);
      const details = [
        `${member.ancestryClass || "unknown role"}${formatHp(member.stats?.hp)}`,
        firstVisibleNote(member),
        pendingConnection ? `Join request: ${pendingConnection.displayName || "Guest"} waiting for approval.` : "",
      ].filter(Boolean).join(" - ");
      return recordElement({
        title: member.name,
        body: details,
        badge: controllerLabel(member),
        actions: partyControllerActions(member, pendingConnection),
        onEdit: () => openCharacterSheet(member),
      });
    }),
  );
}

function renderCombatTracker(campaign) {
  if (!elements.combatTrackerSection || !elements.combatTurnOrder) {
    return;
  }
  const view = buildCombatTrackerView(campaign, { controlledActorId: state.guestSession?.partyMemberId });
  elements.combatTrackerSection.hidden = !view.inCombat;
  if (!view.inCombat) {
    elements.combatTurnOrder.replaceChildren();
    elements.combatActiveActor.textContent = "No active turn.";
    return;
  }

  elements.combatRound.textContent = view.roundLabel;
  elements.combatActiveActor.textContent = view.activeLabel;
  elements.combatTurnOrder.replaceChildren(
    ...view.rows.map((entry) => {
      const item = document.createElement("li");
      item.className = [
        "combat-order-row",
        entry.active ? "active" : "",
        entry.type === "enemy" ? "enemy" : "party",
        entry.controlled ? "controlled" : "",
      ].filter(Boolean).join(" ");
      const rank = document.createElement("span");
      rank.className = "combat-order-rank";
      rank.textContent = String(entry.rank);
      const label = document.createElement("strong");
      label.textContent = entry.name;
      const meta = document.createElement("span");
      meta.className = "combat-order-meta";
      meta.textContent = entry.meta;
      item.append(rank, label, meta);
      return item;
    }),
  );
}

function pendingJoinConnectionForMember(campaign, memberId) {
  return (campaign.multiplayer?.connections ?? []).find((connection) =>
    connection.partyMemberId === memberId && connection.status === "pending"
  );
}

function firstVisibleNote(member) {
  const note = (member.notes ?? []).find((item) => {
    if (!item) {
      return false;
    }
    if (typeof item === "object") {
      return item.visibility !== "dm_only" && item.visibility !== "system_only" && (item.text || item.body || item.summary);
    }
    return true;
  });
  if (!note) {
    return "";
  }
  if (typeof note === "object") {
    return note.text || note.body || note.summary || "";
  }
  return String(note);
}

function partyControllerActions(member, pendingConnection = null) {
  if (clientMode) {
    return [];
  }

  const kind = member.controllerKind || (member.type === "player_character" ? "host" : "ai_companion");
  const actions = [];
  if (pendingConnection) {
    actions.push({
      label: `Approve ${pendingConnection.displayName || "Guest"}`,
      title: `Approve ${pendingConnection.displayName || "Guest"} for ${member.name}`,
      onClick: () => approveGuest(pendingConnection.id),
    });
    actions.push({
      label: "Deny",
      title: `Deny join request for ${member.name}`,
      onClick: () => denyGuest(pendingConnection.id),
    });
  }
  if (kind !== "host") {
    actions.push({
      label: "Claim",
      title: `Claim ${member.name} as your player character`,
      onClick: () => setPartyMemberController(member, "host"),
    });
  }
  if (kind === "host") {
    actions.push({
      label: "AI",
      title: `Return ${member.name} to AI companion control`,
      onClick: () => setPartyMemberController(member, "ai_companion"),
    });
  }
  actions.push({
    label: "Invite Player",
    title: `Invite a player to control ${member.name}`,
    onClick: () => createInviteForMember(member),
  });
  return actions;
}

function openCharacterSheet(member) {
  state.activeCharacterSheet = member.id;
  state.activeCharacterSheetAutofill = null;
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

function autoFillOpenCharacterSheet() {
  const name = elements.sheetName.value.trim() || "Adventurer";
  const ancestryClass = elements.sheetAncestryClass.value.trim();
  const role = elements.sheetRole.value.trim();
  const level = parseOptionalNumber(elements.sheetLevel.value) ?? 1;
  const background = elements.sheetBackground.value.trim();
  const sheet = buildFiveELiteCharacterSeed({
    name,
    ancestry: inferAncestryFromSheetText(ancestryClass),
    characterClass: [ancestryClass, role].filter(Boolean).join(" "),
    level,
    concept: background,
    autoSheet: true,
  });

  elements.sheetName.value = sheet.name;
  elements.sheetAncestryClass.value = ancestryClass || sheet.ancestryClass;
  elements.sheetRole.value = role || "Player character";
  elements.sheetLevel.value = sheet.level ?? "";
  elements.sheetXp.value = elements.sheetXp.value.trim() || String(sheet.experience ?? "");
  elements.sheetHpCurrent.value = sheet.stats.hp.current ?? "";
  elements.sheetHpMax.value = sheet.stats.hp.max ?? "";
  elements.sheetAc.value = sheet.stats.armorClass ?? "";
  elements.sheetProf.value = sheet.proficiencyBonus ?? "";
  elements.sheetBackground.value = background || sheet.background;
  elements.sheetStr.value = sheet.stats.abilityScores.STR ?? "";
  elements.sheetDex.value = sheet.stats.abilityScores.DEX ?? "";
  elements.sheetCon.value = sheet.stats.abilityScores.CON ?? "";
  elements.sheetInt.value = sheet.stats.abilityScores.INT ?? "";
  elements.sheetWis.value = sheet.stats.abilityScores.WIS ?? "";
  elements.sheetCha.value = sheet.stats.abilityScores.CHA ?? "";
  elements.sheetSkills.value = mergeMultiline(elements.sheetSkills.value, sheet.skills);
  elements.sheetAbilities.value = mergeMultiline(elements.sheetAbilities.value, sheet.abilities);
  elements.sheetSpells.value = mergeMultiline(elements.sheetSpells.value, sheet.spells);
  elements.sheetNotes.value = mergeMultiline(elements.sheetNotes.value, ["Auto-filled with a 5E-lite standard array."]);
  state.activeCharacterSheetAutofill = sheet;
  elements.bridgeStatus.textContent = `${sheet.name} sheet auto-filled; review and save when ready`;
}

async function saveCharacterSheet() {
  const member = findById(state.campaign.party, state.activeCharacterSheet);
  if (!member) {
    elements.bridgeStatus.textContent = "Character not found";
    return;
  }

  const autoSheet = state.activeCharacterSheetAutofill;
  const preservedResources = autoSheet?.resources ?? member.resources ?? member.stats?.resources ?? {};
  const preservedAttacks = autoSheet?.attacks ?? member.attacks ?? member.weapons ?? member.equipment?.weapons ?? [];
  const preservedConditions = member.conditions ?? member.stats?.conditions ?? autoSheet?.conditions ?? [];
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
      spellSlots: preservedResources.spellSlots ?? member.stats?.spellSlots ?? null,
      resources: preservedResources,
      conditions: preservedConditions,
      spells: splitMultiline(elements.sheetSpells.value),
    },
    speedFt: autoSheet?.speedFt ?? member.speedFt ?? member.speed ?? member.stats?.speedFt ?? member.stats?.speed ?? null,
    resources: preservedResources,
    attacks: preservedAttacks,
    conditions: preservedConditions,
    inventory: member.inventory ?? member.equipment ?? member.items ?? [],
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
      state.activeCharacterSheetAutofill = null;
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

function mergeMultiline(existing, additions) {
  return uniqueTextList([splitMultiline(existing), additions]).join("\n");
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
  if (state.reviewBatch?.proposedChanges?.length) {
    const changes = state.reviewBatch.proposedChanges;
    elements.reviewCount.textContent = String(changes.length);
    elements.reviewList.replaceChildren(
      ...changes.slice(0, 6).map((change) =>
        recordElement({
          title: `${change.status} / ${change.operation} / ${change.domain}`,
          body: change.validation?.valid === false
            ? `${change.summary} (${change.validation.errors.join("; ")})`
            : change.summary,
        }),
      ),
    );
    return;
  }

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
      "No pending state changes.",
    ),
  );
}

function inferAncestryFromSheetText(value) {
  const match = String(value ?? "").match(/\b(human|elf|dwarf|halfling|gnome|orc|tiefling|dragonborn|half-elf|half-orc)\b/i);
  return match?.[1] ?? "";
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
    findById(campaign.combat?.enemies ?? [], id)?.name ||
    id
  );
}

function recordElement({ title, body, badge, actions = [], onEdit }) {
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
  if (badge) {
    const badgeNode = document.createElement("span");
    badgeNode.className = "controller-badge";
    badgeNode.textContent = badge;
    heading.append(badgeNode);
  }

  const copy = document.createElement("p");
  copy.textContent = body || "No notes recorded.";

  wrapper.append(heading, copy);
  if (actions.length) {
    const actionRow = document.createElement("div");
    actionRow.className = "record-actions";
    for (const action of actions) {
      const button = document.createElement("button");
      button.className = "mini-action";
      button.type = "button";
      button.textContent = action.label;
      button.title = action.title || action.label;
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        action.onClick();
      });
      actionRow.append(button);
    }
    wrapper.append(actionRow);
  }
  return wrapper;
}

function cleanProviderResponseForPlay(text) {
  const withoutUpdates = stripLorekeeperUpdates(text);
  const withoutRolePrefix = stripProviderRolePrefix(withoutUpdates);
  const withoutMarkdownNoise = stripProviderMarkdownNoise(withoutRolePrefix);
  const withReadableChoices = normalizeChoiceFormattingForPlay(withoutMarkdownNoise);
  return stripTrailingStatusBlock(withReadableChoices).trim() || "The DM response was imported for review.";
}

function stripProviderRolePrefix(text) {
  return String(text ?? "")
    .replace(/^\s*(?:\*\*)?\s*(?:DM|Dungeon Master|Lorekeeper|Assistant)\s*(?:\*\*)?\s*[:\-]\s*/i, "")
    .replace(/^\s*(?:#|##)\s*(?:DM|Dungeon Master|Lorekeeper|Assistant)\s*$/gim, "")
    .trim();
}

function stripProviderMarkdownNoise(text) {
  return String(text ?? "")
    .replace(/\*\*(DM|Dungeon Master|Options?|proposedChanges)\s*:\*\*/gi, "$1:")
    .replace(/\*\*([^*\n]{1,80})\*\*/g, "$1")
    .replace(/(?:^|\n)\s*proposedChanges\s*:\s*$/i, "")
    .trim();
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

function normalizeChoiceFormattingForPlay(text) {
  const blocks = String(text ?? "")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
  const normalized = [];

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    const nextBlock = blocks[index + 1];
    const choiceBlock = normalizeInlineChoiceBlock(block, nextBlock);
    if (choiceBlock) {
      normalized.push(choiceBlock);
      if (isSomethingElseChoice(nextBlock)) {
        index += 1;
      }
      continue;
    }

    normalized.push(block);
  }

  return normalized.join("\n\n");
}

function normalizeInlineChoiceBlock(block, nextBlock = "") {
  if (!block) {
    return "";
  }

  const numberedPanel = extractInlineNumberedChoicePanel(block);
  if (!numberedPanel) {
    return null;
  }

  const items = isSomethingElseChoice(nextBlock)
    ? [...numberedPanel.items, cleanChoiceText(nextBlock)]
    : numberedPanel.items;
  const pieces = [];
  if (numberedPanel.beforeText) {
    pieces.push(numberedPanel.beforeText);
  }
  pieces.push(numberedPanel.prompt);
  pieces.push(items.map((item, index) => `${index + 1}. ${item}`).join("\n"));
  return pieces.join("\n\n");
}

function isSomethingElseChoice(text) {
  return /^something else\.?$/i.test(String(text ?? "").trim());
}

function messageBodyElements(text, role = "dm", data = {}) {
  const structuredChoiceBlock = structuredChoiceBlockFromMessageData(data);
  const blocks = mergeStructuredChoiceBlock(
    extractChoicePanel(normalizeMessageBlocks(text, role), role),
    structuredChoiceBlock,
  );

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
      block.items.forEach((itemText, index) => {
        const item = document.createElement("li");
        const button = document.createElement("button");
        button.type = "button";
        button.className = "choice-option";
        button.textContent = itemText;
        button.title = `Choose ${choiceLabelForIndex(index)}`;
        button.addEventListener("click", () => chooseVisibleOption(block, index));
        item.append(button);
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

    if (block.type === "mechanics") {
      const panel = document.createElement("div");
      panel.className = "roll-panel";
      const title = document.createElement("strong");
      title.className = "roll-panel-title";
      title.textContent = "Mechanics";
      panel.append(title);

      block.rows.forEach((row) => {
        const item = document.createElement("div");
        item.className = `roll-row ${row.category || ""}`.trim();
        const label = document.createElement("span");
        label.className = "roll-label";
        label.textContent = row.label;
        const detail = document.createElement("span");
        detail.className = "roll-detail";
        detail.textContent = row.detail;
        item.append(label, detail);
        panel.append(item);
      });
      return panel;
    }

    const paragraph = document.createElement("p");
    paragraph.textContent = block.text;
    return paragraph;
  });
}

function normalizeMessageBlocks(text, role) {
  const normalizedText = role === "dm" || role === "provider"
    ? normalizeChoiceFormattingForPlay(text)
    : String(text ?? "");
  const rawBlocks = normalizedText
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
  const seenMechanics = new Set();

  rawBlocks.forEach((block, index) => {
    for (const part of splitMechanicsFromBlock(block)) {
      const renderable = part.type === "mechanics"
        ? { type: "mechanics", rows: dedupeMechanicsRows(part.rows, seenMechanics) }
        : textBlockToRenderableBlock(part.text);
      if (renderable.type === "mechanics" && !renderable.rows.length) {
        continue;
      }
      if (renderable.type === "list" || renderable.type === "choices" || renderable.type === "combat" || renderable.type === "mechanics") {
        flushProseGroup();
        if (renderable.type === "choices" && renderable.beforeText) {
          normalized.push({
            type: "paragraph",
            text: renderable.beforeText,
          });
        }
        normalized.push(renderable);
        continue;
      }

      if (shouldKeepDmBlockSeparate(renderable.text, index, rawBlocks.length)) {
        flushProseGroup();
        normalized.push(renderable);
        continue;
      }

      proseGroup.push(renderable.text);
      const joinedLength = proseGroup.join(" ").length;
      if (proseGroup.length >= 4 || joinedLength >= 480) {
        flushProseGroup();
      }
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
  const match = text.match(/(?:^|\.|\?|!)\s*((?:What (?:does|do|would|will|should|can) .*?\?|What do you do|What now|Your move|Choose)[?!.]?)\s*$/i);
  return match?.[1]?.trim() ?? null;
}

function mergeStructuredChoiceBlock(blocks, structuredChoiceBlock) {
  if (!structuredChoiceBlock?.items?.length) {
    return blocks;
  }
  const withoutParsedChoices = blocks.filter((block) => block.type !== "choices");
  return [...withoutParsedChoices, structuredChoiceBlock];
}

function cleanChoiceText(text) {
  const cleaned = text
    .trim()
    .replace(/^[-*]\s+/, "")
    .replace(/^(?:\d+|[A-Ha-h])[.)]\s*/, "")
    .trim();
  const duplicateSomethingElse = cleaned.match(/^(something else(?:\.\.\.|\.?)?)\s*:\s*something else(?:\.\.\.|\.?)?$/i);
  if (duplicateSomethingElse) {
    return "Something else.";
  }
  return cleaned;
}

function isLikelyChoiceText(text) {
  return text.length <= 220 && !/^["“].+["”]$/.test(text);
}

function textBlockToRenderableBlock(block) {
  const lines = block.split(/\n/).map((line) => line.trim()).filter(Boolean);
  const isList = lines.length > 1 && lines.every((line) => /^[-*]\s+/.test(line));
  const numberedChoices = extractNumberedChoiceLines(lines);
  const isCombatBlock = lines.some((line) => /^Options:$/i.test(line)) &&
    lines.some((line) => /^(Chosen|Damage|Narration):/i.test(line));

  if (numberedChoices) {
    return numberedChoices;
  }

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

  if (blocks.length < 1) {
    return blocks;
  }

  const last = blocks.at(-1);
  const inlinePanel = extractInlineChoicePanel(last);
  if (inlinePanel) {
    const nextBlocks = blocks.slice(0, -1);
    if (inlinePanel.beforeText) {
      nextBlocks.push({
        ...last,
        text: inlinePanel.beforeText,
      });
    }
    nextBlocks.push({
      type: "choices",
      prompt: inlinePanel.prompt,
      items: inlinePanel.items,
    });
    return nextBlocks;
  }

  if (blocks.length < 2) {
    return blocks;
  }

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

function extractInlineChoicePanel(block) {
  if (block?.type !== "paragraph") {
    return null;
  }

  const text = block.text.trim();
  const numberedPanel = extractInlineNumberedChoicePanel(text);
  if (numberedPanel) {
    return numberedPanel;
  }

  const optionMarker = text.search(/\b(?:Options?|Choices?)\s*:/i);
  if (optionMarker === -1) {
    return null;
  }

  const beforeMarker = text.slice(0, optionMarker).trim();
  const optionText = text.slice(optionMarker).replace(/^\s*(?:Options?|Choices?)\s*:\s*/i, "").trim();
  const prompt = extractChoicePrompt(beforeMarker) || extractChoicePrompt(text) || "What do you do?";
  const promptStart = beforeMarker.lastIndexOf(prompt);
  const beforeText = promptStart >= 0 ? beforeMarker.slice(0, promptStart).trim() : beforeMarker;
  const choices = splitChoiceText(optionText);
  if (choices.length < 2) {
    return null;
  }

  return {
    beforeText,
    prompt,
    items: choices,
  };
}

function extractNumberedChoiceLines(lines) {
  if (lines.length < 2) {
    return null;
  }

  const promptLineIndex = lines.findIndex((line) => extractChoicePrompt(line));
  const firstChoiceIndex = lines.findIndex((line) => /^(?:\d+|[A-Ha-h])[.)]\s+/.test(line));
  if (firstChoiceIndex === -1) {
    return null;
  }

  const prompt = promptLineIndex >= 0 && promptLineIndex < firstChoiceIndex
    ? extractChoicePrompt(lines[promptLineIndex])
    : "What do you do?";
  const beforeText = promptLineIndex > 0 ? lines.slice(0, promptLineIndex).join(" ") : "";
  const choiceLines = lines.slice(firstChoiceIndex);
  const items = splitChoiceText(choiceLines.join(" "));

  if (items.length < 2) {
    return null;
  }

  return {
    type: "choices",
    prompt,
    beforeText,
    items,
  };
}

function extractInlineNumberedChoicePanel(text) {
  const firstNumberedChoice = text.search(/\s(?:1|A)[.)]\s+/i);
  if (firstNumberedChoice === -1) {
    return null;
  }

  const beforeChoices = text.slice(0, firstNumberedChoice).trim();
  const optionText = text.slice(firstNumberedChoice).trim();
  const prompt = extractChoicePrompt(beforeChoices) || extractChoicePrompt(text);
  if (!prompt) {
    return null;
  }

  const choices = splitChoiceText(optionText);
  if (choices.length < 2) {
    return null;
  }

  const promptStart = beforeChoices.lastIndexOf(prompt);
  const beforeText = promptStart >= 0 ? beforeChoices.slice(0, promptStart).trim() : beforeChoices;

  return {
    beforeText,
    prompt,
    items: choices,
  };
}

function splitChoiceText(text) {
  const normalized = text
    .replace(/\s*-\s*(?=(?:\d+[.)]\s+|[A-Z][^.!?]{8,120}(?:\.|$)))/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) {
    return [];
  }

  const numbered = normalized
    .split(/\s+(?=(?:\d+|[A-Ha-h])[.)]\s+)/)
    .map((item) => item.replace(/^(?:\d+|[A-Ha-h])[.)]\s*/, "").trim())
    .filter(Boolean);
  if (numbered.length >= 2) {
    return normalizeChoiceItems(numbered.map(cleanChoiceText).filter(Boolean));
  }

  const sentenceChoices = normalized
    .split(/\s+-\s+|(?<=\.)\s+(?=[A-Z])/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 12 && !/^something else\.?$/i.test(item));
  const hasFallback = /(?:^|\s)Something else\.?$/i.test(normalized);
  if (sentenceChoices.length >= 2) {
    return normalizeChoiceItems(hasFallback ? [...sentenceChoices, "Something else."] : sentenceChoices);
  }

  return [];
}

function normalizeChoiceItems(items) {
  const normalized = [];
  let hasSomethingElse = false;
  for (const item of items) {
    const cleaned = cleanChoiceText(item);
    if (!cleaned) {
      continue;
    }
    if (/^something else(?:\.\.\.|\.?)$/i.test(cleaned)) {
      if (!hasSomethingElse) {
        normalized.push("Something else.");
        hasSomethingElse = true;
      }
      continue;
    }
    normalized.push(cleaned);
  }
  return normalized;
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
