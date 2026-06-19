import { buildContextPack } from "../src/context-packs/build-context-pack.js";
import { findById } from "../src/campaign-state/formatters.js";
import { normalizeCampaign } from "../src/campaign-state/schema.js";
import { createSampleCampaign } from "../src/campaign-state/sample-campaign.js";
import { createStarterCampaign } from "../src/campaign-state/starter-campaign.js";
import { getActiveProviderConversation } from "../src/campaign-state/provider-conversations.js";
import { createReviewBatch } from "../src/canon-review/proposals.js";
import { extractLorekeeperUpdates } from "../src/canon-review/extract-updates.js";
import { createPlayerTurn } from "../src/play-loop/session-turn.js";
import { normalizeOllamaModelId, recommendedOllamaModels } from "../src/ai/provider-settings.js";
import { renderTurnResponseForImport } from "../src/model-contract/turn-json-contract.js";
import { isAllowedInviteHost } from "../src/multiplayer/invite-security.js";
import { createProviderOrchestrator } from "../src/engine/provider-orchestrator.js";
import { buildSceneRetrieval } from "../src/engine/scene-engine.js";
import { buildTableDebugSnapshot } from "../src/engine/table-debug-snapshot.js";
import { buildTableSessionProjection } from "../src/engine/table-session-engine.js";
import { isHiddenStoryThread } from "../src/context-packs/story-threads.js";
import { buildPartyTemplateCharacters, completeCharacterSeed, splitAncestryClass } from "./character-autocomplete-controller.js";
import { buildCampaignAdoptionPlan } from "./campaign-adoption-controller.js";
import {
  choiceLabelForIndex,
  choiceOptionId,
  choicePanelKey,
  buildChoiceSelectionFromText,
  buildChoiceSelectionMeta,
  choiceSelectionInWorldText,
  choiceSelectionActivityText,
  choiceVoteCounts,
  choiceVoteState,
  choiceVoteSummaryText,
  currentChoiceVotesForBlock,
  currentGuestVoteForChoice as projectedGuestVoteForChoice,
  extractChoiceTokenText,
  isPartyVoteChoiceBlock,
  leadingChoiceVoteEntry as projectedLeadingChoiceVoteEntry,
  pendingSelectionMatchesText,
  structuredChoiceBlockFromMessageData,
  structuredChoicesForMessage,
} from "./choice-vote-controller.js";
import { createImplicitCombatActorPromptChange, latestDmNarration } from "./combat-prompt-repair-controller.js";
import { buildCombatTrackerView, combatActorType, normalizedCombatTurnOrder } from "./combat-tracker-view.js";
import { combatResolutionMessage, engineCombatResolutionChange, resolveEnemyCombatTurn } from "./combat-resolution-controller.js";
import { readTextWithFallback, writeTextWithFallback } from "./clipboard-utils.js";
import { randomAdventureSeedPreset } from "./adventure-seed-presets.js";
import { buildDmNudgePrompt } from "./dm-nudge-controller.js";
import {
  buildGuestAutoResolvePin,
  buildGuestAutoResolvePlan,
  shouldScheduleGuestAutoResolve,
} from "./guest-auto-resolve-controller.js";
import {
  applyManualResponseFallbackProjection,
  buildHostResponseReviewProjection,
  buildManualResponseFallbackProjection,
  renderHostResponseReview,
} from "./host-response-review-controller.js";
import { buildInputComposerProjection, applyInputComposerProjection } from "./input-composer-controller.js";
import { buildJoinPreviewProjection } from "./join-preview-controller.js";
import { dedupeMechanicsRows, splitMechanicsFromBlock } from "./mechanics-formatting.js";
import { buildMultiplayerSessionProjection, renderMultiplayerSessionPanel } from "./multiplayer-session-panel.js";
import {
  buildPartyApprovalControlsProjection,
  buildPartyApprovalProjection,
  partySuggestionActivityForStatus,
  partySuggestionInputFromMessage,
  partySuggestionStatusMeta,
} from "./party-suggestion-controller.js";
import { buildMessageLifecycleProjection, buildPendingInputActionProjection, buildPlayLogProjection, defaultPlayLogVisibleLimit, playLogPageSize } from "./play-log-controller.js";
import { buildCampaignChatFallbackPlan, buildCampaignChatProgressSteps, campaignChatFallbackReasons } from "./provider-chat-controller.js";
import {
  buildProviderImportOutcome,
  buildProviderImportPlan,
  cleanChoiceText,
  cleanProviderResponseForPlay,
  decideLatestProviderImport,
  extractChoicePrompt,
  extractInlineNumberedChoicePanel,
  normalizeProviderChoiceFormattingForPlay,
  prepareAutoCommitReviewBatch,
  splitChoiceText,
  splitProviderTableMessages,
} from "./provider-import-controller.js";
import { contractIssueFromProviderResult, providerResultMeta } from "./provider-result-controller.js";
import { buildReviewPanelProjection, renderReviewPanel } from "./proposed-changes-panel.js";
import { applySettingsSurfaceProjection, buildSettingsSurfaceProjection, settingsModeForTab } from "./settings-surface-controller.js";
import { buildStagedInputRecoveryPlan, providerFailureReason, stagedInputRecoveryActions } from "./staged-input-recovery-controller.js";
import { applyTableActionProjection, buildAiCompanionNudgeGate, buildNudgeDmCommandGate, buildStartAdventureCommandGate, buildTableActionProjection } from "./table-action-controller.js";
import { buildMultiplayerPollingPlan, multiplayerPollingActions } from "./table-background-polling-controller.js";
import { applyTableFocusProjection, buildTableFocusProjection } from "./table-focus-controller.js";
import { currentTableTalkMessages as projectCurrentTableTalkMessages } from "./table-talk-controller.js";
import { buildAdventureOpeningPrompt, isCampaignReadyForOpening as isOpeningReady } from "./table-opening-controller.js";
import { tableStatusForActivity, tableTimelineEvent } from "./table-status.js";
import { buildTurnContentGate, buildTurnSubmitGate } from "./turn-submit-controller.js";
import { createTurnFlowRuntime } from "./turn-flow-runtime.js";
import {
  isHardBlockedTurnRepair,
  turnRepairActivityText,
  turnRepairBlockedMessage,
  turnRepairImportOptions,
  turnRepairStatusText,
  turnRepairUseAnywayDialog,
} from "./turn-repair-controller.js";

// Renderer orchestration map:
// 1. constants/state/elements,
// 2. event listeners,
// 3. turn/provider/multiplayer actions,
// 4. render helpers,
// 5. small local utilities.
//
// This file is intentionally kept working while smaller pure policies move into
// app/*controller.js and src/engine/*.js. Prefer adding new decisions there with
// tests instead of growing this renderer file further.
const launchParams = new URLSearchParams(window.location.search);
const guestWaitingRoomMode = window.location.pathname === "/guest" || launchParams.get("mode") === "guest";
const clientMode = launchParams.get("mode") === "client" || guestWaitingRoomMode;
const launchInviteLink = launchParams.get("inviteLink") || "";
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
const apiCampaignPlayerNotesUrl = "/api/campaign/player-notes";
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
const apiMultiplayerInviteCharacterUrl = "/api/multiplayer/invite-character";
const apiMultiplayerJoinUrl = "/api/multiplayer/join";
const apiMultiplayerJoinPreviewUrl = "/api/multiplayer/join-preview";
const apiMultiplayerWaitingRegisterUrl = "/api/multiplayer/waiting-room/register";
const apiMultiplayerWaitingStatusUrl = "/api/multiplayer/waiting-room/status";
const apiMultiplayerWaitingSeatUrl = "/api/multiplayer/waiting-room/seat";
const apiMultiplayerGuestSnapshotUrl = "/api/multiplayer/guest-snapshot";
const apiMultiplayerActionUrl = "/api/multiplayer/action";
const apiMultiplayerChoiceVoteUrl = "/api/multiplayer/choice-vote";
const apiMultiplayerPassUrl = "/api/multiplayer/pass";
const apiMultiplayerDisconnectUrl = "/api/multiplayer/disconnect";
const apiMultiplayerCombatJoinUrl = "/api/multiplayer/combat/join";
const apiMultiplayerTableTalkUrl = "/api/multiplayer/table-talk";
const apiMultiplayerSettingsUrl = "/api/multiplayer/settings";
const apiMultiplayerApproveUrl = "/api/multiplayer/join/approve";
const apiMultiplayerDenyUrl = "/api/multiplayer/join/deny";
const apiMultiplayerRevokeControllerUrl = "/api/multiplayer/controller/revoke";
const apiMultiplayerAiControllerUrl = "/api/multiplayer/controller/ai";
const apiMultiplayerHostControllerUrl = "/api/multiplayer/controller/host";
const apiMultiplayerClearPendingUrl = "/api/multiplayer/pending/clear";
const apiPreTableLobbyPublishUrl = "/api/pretable-lobby/publish";
const apiPreTableLobbyCloseUrl = "/api/pretable-lobby/close";
const apiPreTableLobbyHostSnapshotUrl = "/api/pretable-lobby/host-snapshot";
const apiPreTableLobbySeatUrl = "/api/pretable-lobby/seat";
const apiPreTableLobbyAdoptActiveUrl = "/api/pretable-lobby/adopt-active";
const extensionRequestType = "lorekeeper.appBridge.request";
const extensionResponseType = "lorekeeper.appBridge.response";
const leftRailWidthStorageKey = "lorekeeper.leftRailWidth";
const rightRailWidthStorageKey = "lorekeeper.rightRailWidth";
const campaignNotesHeightStorageKey = "lorekeeper.campaignNotesHeight";
const playerNotesHeightStorageKey = "lorekeeper.playerNotesHeight";
const tableTalkHeightStorageKey = "lorekeeper.tableTalkHeight";
const commandDeckHeightStorageKey = "lorekeeper.commandDeckHeight";
const guestSessionStorageKey = "lorekeeper.guestSession";
const guestRecentSessionStorageKey = "lorekeeper.guestRecentSession";
const guestWaitingRoomStorageKey = "lorekeeper.guestWaitingRoomSession";
const waitingGuestHeartbeatTimeoutMs = 20000;
const multiplayerPollIntervalMs = 1000;
const preTableLobbyPollIntervalMs = 1000;
const debugMetaStorageKey = "lorekeeper.showDebugMeta";
const playerNotesStoragePrefix = "lorekeeper.playerNotes";
const defaultCompanionOptions = {
  providerId: "chatgpt",
  projectHint: "LoreKeeper",
  returnToCaller: true,
};
let preTableLobbyPublishTimer = null;
let preTableLobbyHostPollTimer = null;
const adventureSeedPresetButtons = new WeakSet();
const userSettingsStorageKey = "lorekeeper.lastProviderSettings";
const appModeStorageKey = "lorekeeper.appMode";

// Renderer state is a UI cache, not canon. Campaign canon lives in the server
// and SQLite-backed campaign state; multiplayer authority is validated by
// campaign/table/session ids before server mutations are accepted.
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
  tableTimeline: [],
  lastTableStatusText: "",
  tableSession: null,
  settingsMode: "app",
  pendingChoiceSelection: null,
  playLogVisibleLimit: defaultPlayLogVisibleLimit,
  forceScrollToBottom: false,
  multiplayerSnapshot: null,
  guestSession: loadGuestSession(),
  recentGuestSession: loadRecentGuestSession(),
  waitingRoomSession: loadWaitingRoomSession(),
  guestSnapshot: null,
  guestLobbyPreview: null,
  selectedGuestSeatId: "",
  guestPollInFlight: false,
  joinPreviewTimer: null,
  autoResolvingCombatInput: false,
  lastAutoResolvedRemoteKey: "",
  autoResolveGuestInputsTimer: null,
  autoResolvingGuestInputs: false,
  autoResolvingEnemyTurn: false,
  lastAutoResolvedEnemyKey: "",
  autoResumingPendingTurn: false,
  lastAutoResumedMessageId: "",
  repairingCombatPromptTurn: false,
  lastCombatPromptRepairKey: "",
  lastTableTalkCount: null,
  lastWaitingGuestSignature: "",
  openingRequestedSessionKeys: new Set(),
  unreadTableTalkCount: 0,
  playerNotesCampaignId: "",
  playerNotesSaveTimer: null,
  homeFlow: clientMode ? "join" : "",
  pendingDeleteCampaign: null,
  campaignWizardReturnHome: false,
  campaignWizardCreating: false,
  launchInviteError: "",
};

window.fetch = (input, init = {}) => nativeFetch(input, withLorekeeperApiAuth(input, init));

state.turnFlow = createTurnFlowRuntime();
state.turnFlow.subscribe(handleTurnFlowVisibilityEvent);
const providerOrchestrator = createProviderOrchestrator({
  fetchFn: (...args) => window.fetch(...args),
  endpoint: apiProviderGenerateTurnUrl,
  setTimeoutFn: (...args) => window.setTimeout(...args),
  clearTimeoutFn: (...args) => window.clearTimeout(...args),
});

function isRemoteTableClient() {
  return Boolean(state.guestSession?.hostBaseUrl);
}

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

// Static element registry for the hand-written DOM shell. IDs live in App.jsx;
// behavior lives here until a fuller React state model replaces this bridge.
const elements = {
  app: document.querySelector("#app"),
  title: document.querySelector("#campaign-title"),
  campaignSelect: document.querySelector("#campaign-select"),
  deleteCampaign: document.querySelector("#delete-campaign"),
  sceneLocation: document.querySelector("#scene-location"),
  sceneIntelligence: document.querySelector("#scene-intelligence"),
  sceneIntelligenceTitle: document.querySelector("#scene-intelligence-title"),
  sceneIntelligenceTensions: document.querySelector("#scene-intelligence-tensions"),
  sceneIntelligenceConsequences: document.querySelector("#scene-intelligence-consequences"),
  sceneNoteCount: document.querySelector("#scene-note-count"),
  sceneNoteList: document.querySelector("#scene-note-list"),
  providerStatus: document.querySelector("#provider-status"),
  campaignRailSection: document.querySelector("#campaign-rail-section"),
  homePanel: document.querySelector("#home-panel"),
  homeHostFlow: document.querySelector("#home-host-flow"),
  homeJoinFlow: document.querySelector("#home-join-flow"),
  homeProviderSetup: document.querySelector("#home-provider-setup"),
  homeNewCampaign: document.querySelector("#home-new-campaign"),
  homeSettings: document.querySelector("#home-settings"),
  homeCampaignSelect: document.querySelector("#home-campaign-select"),
  homeDeleteCampaign: document.querySelector("#home-delete-campaign"),
  homeActiveCampaign: document.querySelector("#home-active-campaign"),
  homeCharacterCount: document.querySelector("#home-character-count"),
  providerActivity: document.querySelector("#provider-activity"),
  providerActivityLabel: document.querySelector("#provider-activity-label"),
  recheckProvider: document.querySelector("#recheck-provider"),
  repairRetry: document.querySelector("#repair-retry"),
  repairInspect: document.querySelector("#repair-inspect"),
  repairImportAnyway: document.querySelector("#repair-import-anyway"),
  seatWaitingGuest: document.querySelector("#seat-waiting-guest"),
  startAdventureOpening: document.querySelector("#start-adventure-opening"),
  saveStatus: document.querySelector("#save-status"),
  returnMainMenu: document.querySelector("#return-main-menu"),
  openSetup: document.querySelector("#open-setup"),
  settingsTabsNav: document.querySelector("#settings-tabs"),
  settingsTabs: [...document.querySelectorAll("[data-settings-tab]")],
  settingsPanels: [...document.querySelectorAll("[data-settings-panel]")],
  nudgeDm: document.querySelector("#nudge-dm"),
  setupDialog: document.querySelector("#setup-dialog"),
  setupDialogEyebrow: document.querySelector("#setup-dialog-eyebrow"),
  setupDialogTitle: document.querySelector("#setup-dialog-title"),
  setupDialogSubtitle: document.querySelector("#setup-dialog-subtitle"),
  closeSetup: document.querySelector("#close-setup"),
  providerSetupSection: document.querySelector("#provider-setup-section"),
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
  partyRailSection: document.querySelector("#party-rail-section"),
  partyList: document.querySelector("#party-list"),
  partyCount: document.querySelector("#party-count"),
  combatTrackerSection: document.querySelector("#combat-tracker-section"),
  combatRound: document.querySelector("#combat-round"),
  combatActiveActor: document.querySelector("#combat-active-actor"),
  combatActiveCue: document.querySelector("#combat-active-cue"),
  combatTurnOrder: document.querySelector("#combat-turn-order"),
  peopleList: document.querySelector("#people-list"),
  peopleCount: document.querySelector("#people-count"),
  placeList: document.querySelector("#place-list"),
  placeCount: document.querySelector("#place-count"),
  thingList: document.querySelector("#thing-list"),
  thingCount: document.querySelector("#thing-count"),
  questList: document.querySelector("#quest-list"),
  questCount: document.querySelector("#quest-count"),
  playerNotesPeople: document.querySelector("#player-notes-people"),
  playerNotesPlaces: document.querySelector("#player-notes-places"),
  playerNotesThings: document.querySelector("#player-notes-things"),
  playerNotesScratch: document.querySelector("#player-notes-scratch"),
  campaignNotesPanel: document.querySelector("#campaign-notes-panel"),
  playerNotesPanel: document.querySelector("#player-notes-panel"),
  tableTalkSection: document.querySelector("#table-talk-section"),
  tableTalkLog: document.querySelector("#table-talk-log"),
  tableTalkCount: document.querySelector("#table-talk-count"),
  tableTalkForm: document.querySelector("#table-talk-form"),
  tableTalkInput: document.querySelector("#table-talk-input"),
  tableTalkSend: document.querySelector("#table-talk-send"),
  leftRailResizeHandle: document.querySelector("#left-rail-resize-handle"),
  rightRailResizeHandle: document.querySelector("#right-rail-resize-handle"),
  campaignNotesResizeHandle: document.querySelector("#campaign-notes-resize-handle"),
  playerNotesResizeHandle: document.querySelector("#player-notes-resize-handle"),
  tableTalkResizeHandle: document.querySelector("#table-talk-resize-handle"),
  promptOutput: document.querySelector("#prompt-output"),
  promptSize: document.querySelector("#prompt-size"),
  promptDrawer: document.querySelector("#prompt-drawer"),
  sessionLabel: document.querySelector("#session-label"),
  joinClientPanel: document.querySelector("#join-client-panel"),
  joinClientTitle: document.querySelector("#join-client-title"),
  joinClientCopy: document.querySelector("#join-client-copy"),
  guestInvitePanel: document.querySelector("#guest-invite-panel"),
  guestWaitingRoomPanel: document.querySelector("#guest-waiting-room-panel"),
  guestTablePreview: document.querySelector("#guest-table-preview"),
  guestSeatList: document.querySelector("#guest-seat-list"),
  guestWaitingPlayerName: document.querySelector("#guest-waiting-player-name"),
  guestWaitingRegister: document.querySelector("#guest-waiting-register"),
  guestWaitingStatus: document.querySelector("#guest-waiting-status"),
  joinClientInviteLink: document.querySelector("#join-client-invite-link"),
  joinClientPreview: document.querySelector("#join-client-preview"),
  joinClientPlayerName: document.querySelector("#join-client-player-name"),
  joinClientCharacterName: document.querySelector("#join-client-character-name"),
  joinClientCharacterAncestry: document.querySelector("#join-client-character-ancestry"),
  joinClientCharacterClass: document.querySelector("#join-client-character-class"),
  joinClientCharacterLevel: document.querySelector("#join-client-character-level"),
  joinClientCharacterRole: document.querySelector("#join-client-character-role"),
  joinClientCharacterAppearance: document.querySelector("#join-client-character-appearance"),
  joinClientCharacterBackstory: document.querySelector("#join-client-character-backstory"),
  joinClientCharacterIntegration: document.querySelector("#join-client-character-integration"),
  joinClientCharacterAutocomplete: document.querySelector("#join-client-character-autocomplete"),
  joinClientSubmit: document.querySelector("#join-client-submit"),
  joinClientStatus: document.querySelector("#join-client-status"),
  joinBackHome: document.querySelector("#join-back-home"),
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
  showDebugMeta: document.querySelector("#show-debug-meta"),
  sessionHealthSummary: document.querySelector("#session-health-summary"),
  tableTimelineSummary: document.querySelector("#table-timeline-summary"),
  generationTimeout: document.querySelector("#generation-timeout"),
  outputLimit: document.querySelector("#output-limit"),
  fastMode: document.querySelector("#fast-mode"),
  cancelGeneration: document.querySelector("#cancel-generation"),
  localTableState: document.querySelector("#local-table-state"),
  localTableAddress: document.querySelector("#local-table-address"),
  localTableGuidance: document.querySelector("#local-table-guidance"),
  localTableGuestLink: document.querySelector("#local-table-guest-link"),
  localTableInviteOutput: document.querySelector("#local-table-invite-output"),
  requireGuestActionApproval: document.querySelector("#require-guest-action-approval"),
  holdGuestActionsForGroup: document.querySelector("#hold-guest-actions-for-group"),
  startLocalTable: document.querySelector("#start-local-table"),
  stopLocalTable: document.querySelector("#stop-local-table"),
  copyGuestLink: document.querySelector("#copy-guest-link"),
  copyCharacterInvite: document.querySelector("#copy-character-invite"),
  joinCampaign: document.querySelector("#join-campaign"),
  joinCampaignMain: document.querySelector("#join-campaign-main"),
  inviteNewCharacterMain: document.querySelector("#invite-new-character-main"),
  syncGuestTable: document.querySelector("#sync-guest-table"),
  resolvePartyInputs: document.querySelector("#resolve-party-inputs"),
  waitingGuests: document.querySelector("#waiting-guests"),
  connectedGuests: document.querySelector("#connected-guests"),
  pendingInputs: document.querySelector("#pending-inputs"),
  joinCampaignDialog: document.querySelector("#join-campaign-dialog"),
  joinCampaignForm: document.querySelector("#join-campaign-form"),
  closeJoinCampaignDialog: document.querySelector("#close-join-campaign-dialog"),
  cancelJoinCampaign: document.querySelector("#cancel-join-campaign"),
  joinInviteLink: document.querySelector("#join-invite-link"),
  joinPreview: document.querySelector("#join-preview"),
  joinPlayerName: document.querySelector("#join-player-name"),
  joinCharacterName: document.querySelector("#join-character-name"),
  joinCharacterAncestry: document.querySelector("#join-character-ancestry"),
  joinCharacterClass: document.querySelector("#join-character-class"),
  joinCharacterLevel: document.querySelector("#join-character-level"),
  joinCharacterRole: document.querySelector("#join-character-role"),
  joinCharacterAppearance: document.querySelector("#join-character-appearance"),
  joinCharacterBackstory: document.querySelector("#join-character-backstory"),
  joinCharacterIntegration: document.querySelector("#join-character-integration"),
  joinCharacterAutocomplete: document.querySelector("#join-character-autocomplete"),
  joinStatus: document.querySelector("#join-status"),
  newCampaign: document.querySelector("#new-campaign"),
  loadImported: document.querySelector("#load-imported"),
  playLog: document.querySelector("#play-log"),
  playerForm: document.querySelector("#player-form"),
  playerInput: document.querySelector("#player-input"),
  buildTurn: document.querySelector("#build-turn"),
  commandContext: document.querySelector("#command-context"),
  commandContextPhase: document.querySelector("#command-context-phase"),
  commandContextNext: document.querySelector("#command-context-next"),
  responseImport: document.querySelector("#response-import"),
  pasteResponse: document.querySelector("#paste-response"),
  importResponse: document.querySelector("#import-response"),
  manualResponseFallback: document.querySelector("#manual-response-fallback"),
  manualResponseFallbackSummary: document.querySelector("#manual-response-fallback-summary"),
  manualResponseFallbackHint: document.querySelector("#manual-response-fallback-hint"),
  commandResizeHandle: document.querySelector("#command-resize-handle"),
  hostResponseReview: document.querySelector("#host-response-review"),
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
  recordCharacterAutocomplete: document.querySelector("#record-character-autocomplete"),
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
  newCharacterAutocomplete: document.querySelector("#new-character-autocomplete"),
  wizardAdditionalCharacters: document.querySelector("#wizard-additional-characters"),
  addWizardPartyMember: document.querySelector("#add-wizard-party-member"),
  addPartyTemplate: document.querySelector("#add-party-template"),
  campaignWizardStatus: document.querySelector("#campaign-wizard-status"),
  startCampaignSubmit: document.querySelector("#start-campaign-submit"),
  newJoinerName: document.querySelector("#new-joiner-name"),
  newJoinerAncestry: document.querySelector("#new-joiner-ancestry"),
  newJoinerClass: document.querySelector("#new-joiner-class"),
  newJoinerLevel: document.querySelector("#new-joiner-level"),
  newJoinerConcept: document.querySelector("#new-joiner-concept"),
  newJoinerIntegration: document.querySelector("#new-joiner-integration"),
  newJoinerHostContext: document.querySelector("#new-joiner-host-context"),
  newJoinerAutoSheet: document.querySelector("#new-joiner-auto-sheet"),
  preTableLobbyPanel: document.querySelector("#pretable-lobby-panel"),
  preTableGuestLink: document.querySelector("#pretable-guest-link"),
  copyPreTableGuestLink: document.querySelector("#copy-pretable-guest-link"),
  preTableWaitingGuests: document.querySelector("#pretable-waiting-guests"),
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
    successMessage: "DM instructions copied",
    failureMessage: "Clipboard blocked; instructions are still open",
  });
});

elements.homeHostFlow?.addEventListener("click", async () => {
  await openSelectedHomeCampaign();
});

elements.homeCampaignSelect?.addEventListener("change", () => {
  updateHomeDeleteButton();
});

elements.homeDeleteCampaign?.addEventListener("click", () => {
  openDeleteCampaignDialog(selectedHomeCampaign());
});

elements.homeJoinFlow?.addEventListener("click", () => {
  chooseHomeFlow("join");
});

elements.joinBackHome?.addEventListener("click", async () => {
  await returnToMainMenu();
});

elements.homeNewCampaign?.addEventListener("click", () => {
  chooseHomeFlow("host");
  openCampaignDialog({ returnToMainMenu: true });
});

elements.homeProviderSetup?.addEventListener("click", () => {
  openSetupDialog({ focusProvider: true, mode: "ai" });
});

elements.homeSettings?.addEventListener("click", () => {
  openSetupDialog({ mode: "app" });
});

elements.openSetup.addEventListener("click", () => {
  openSetupDialog({ tab: "friends", mode: "table" });
});

elements.returnMainMenu?.addEventListener("click", async () => {
  await returnToMainMenu();
});

elements.nudgeDm?.addEventListener("click", async () => {
  await nudgeDm();
});

for (const input of playerNoteInputs()) {
  input?.addEventListener("input", savePlayerNotesFromUi);
}

elements.closeSetup.addEventListener("click", () => {
  elements.setupDialog.close();
});

for (const button of elements.settingsTabs) {
  button.addEventListener("click", () => {
    setSettingsTab(button.dataset.settingsTab || "app");
  });
}

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

elements.newCharacterAutocomplete?.addEventListener("click", () => {
  autocompleteCompactCharacterForm(compactCharacterFormRefs("new-character"));
});

elements.addWizardPartyMember?.addEventListener("click", () => {
  addWizardPartyMemberCard();
});

elements.addPartyTemplate?.addEventListener("click", () => {
  addPartyTemplateCharactersToWizard();
});

elements.wizardAdditionalCharacters?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-autocomplete-wizard-character]");
  if (button) {
    autocompleteCompactCharacterForm(compactCharacterFormRefs("wizard-card", button.closest("[data-wizard-character-card]")));
    return;
  }
  const remove = event.target.closest("[data-remove-wizard-character]");
  if (remove) {
    remove.closest("[data-wizard-character-card]")?.remove();
    renumberWizardPartyMemberCards();
  }
});

elements.joinClientCharacterAutocomplete?.addEventListener("click", () => {
  autocompleteCompactCharacterForm(compactCharacterFormRefs("join-client"));
});

elements.joinCharacterAutocomplete?.addEventListener("click", () => {
  autocompleteCompactCharacterForm(compactCharacterFormRefs("join-dialog"));
});

elements.recordCharacterAutocomplete?.addEventListener("click", () => {
  autocompleteCompactCharacterForm(compactCharacterFormRefs("record-party"));
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
  const result = await ensureCampaignChatSession({ openIfMissing: false });
  if (result?.found) {
    await ensureCampaignChatSession({ openIfMissing: true, focusProvider: true });
    return;
  }

  elements.bridgeStatus.textContent = "No saved ChatGPT DM chat found; use New DM Chat first";
});

elements.newProviderChat.addEventListener("click", async () => {
  await startNewProviderConversation();
});

elements.newCampaign?.addEventListener("click", async () => {
  openCampaignDialog();
});

elements.loadImported?.addEventListener("click", async () => {
  const confirmed = await confirmInApp({
    title: "Load Saved Campaign",
    message: "This will open the bundled Veil of the Towers campaign and switch the active table.",
    acceptLabel: "Load Campaign",
  });

  if (!confirmed) {
    elements.bridgeStatus.textContent = "Campaign load canceled";
    return;
  }

  await loadImportedCampaign();
  seedPlayLog();
  render();
  elements.bridgeStatus.textContent = "Campaign loaded";
});

elements.importResponse.addEventListener("click", async () => {
  await importProviderResponse(elements.responseImport.value.trim());
});

elements.responseImport?.addEventListener("input", () => {
  renderReviewBatch();
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

elements.seatWaitingGuest?.addEventListener("click", () => {
  openLocalTableSeating();
});

elements.startAdventureOpening?.addEventListener("click", async () => {
  await startAdventureOpening();
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

elements.showDebugMeta?.addEventListener("change", () => {
  localStorage.setItem(debugMetaStorageKey, elements.showDebugMeta.checked ? "1" : "0");
  renderPlayLog();
  setProviderActivity(elements.showDebugMeta.checked ? "Debug meta visible in play log" : "Debug meta hidden for play", "idle");
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

elements.requireGuestActionApproval?.addEventListener("change", async () => {
  await saveGuestActionSettings();
});

elements.holdGuestActionsForGroup?.addEventListener("change", async () => {
  await saveGuestActionSettings();
});

elements.copyCharacterInvite?.addEventListener("click", async () => {
  await createCharacterRequestInviteFromUi();
});

elements.copyGuestLink?.addEventListener("click", async () => {
  await copyGuestLinkFromUi();
});

elements.joinCampaign.addEventListener("click", () => {
  openJoinCampaignDialog();
});

elements.joinCampaignMain?.addEventListener("click", () => {
  openJoinCampaignDialog();
});

elements.inviteNewCharacterMain?.addEventListener("click", async () => {
  await createCharacterRequestInviteFromUi();
});

elements.joinClientSubmit?.addEventListener("click", async () => {
  await requestJoinFromJoinClientPanel();
});

elements.guestWaitingRegister?.addEventListener("click", async () => {
  await registerGuestWaitingRoom();
});

elements.guestSeatList?.addEventListener("click", (event) => {
  const button = event.target instanceof Element ? event.target.closest("[data-guest-seat-id]") : null;
  if (!button) {
    return;
  }
  state.selectedGuestSeatId = button.dataset.guestSeatId || "";
  renderGuestLobbyPreview();
  if (elements.guestWaitingStatus) {
    const seat = state.guestLobbyPreview?.joinableSeats?.find((item) => item.id === state.selectedGuestSeatId);
    elements.guestWaitingStatus.textContent = seat?.name
      ? `Requesting a seat as ${seat.name}. Enter your name, then ask to join.`
      : "Enter your name and ask to join.";
  }
  elements.guestWaitingPlayerName?.focus();
});

elements.joinClientInviteLink?.addEventListener("input", () => {
  scheduleJoinPreview(elements.joinClientInviteLink.value, "join");
});

elements.joinInviteLink?.addEventListener("input", () => {
  scheduleJoinPreview(elements.joinInviteLink.value, "dialog");
});

elements.syncGuestTable?.addEventListener("click", async () => {
  await refreshGuestSnapshot({ explicit: true });
});

elements.resolvePartyInputs.addEventListener("click", async () => {
  await resolveCollectedPartyInputs();
});

elements.tableTalkForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearTableTalkUnread();
  await sendTableTalkFromUi();
});

elements.tableTalkInput?.addEventListener("focus", () => clearTableTalkUnread());
elements.tableTalkLog?.addEventListener("click", () => clearTableTalkUnread());

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

setupSavedLayoutResizers();
setupCommandDeckResize();

elements.pasteResponse.addEventListener("click", async () => {
  try {
    const result = await readTextWithFallback({
      desktopReadText: window.lorekeeperDesktop?.readClipboardText,
      browserReadText: navigator.clipboard?.readText?.bind(navigator.clipboard),
    });
    if (!result.ok) {
      throw new Error(result.error || "Clipboard read failed.");
    }
    elements.responseImport.value = result.text;
    renderReviewBatch();
    elements.bridgeStatus.textContent = "Copied DM text is ready";
  } catch {
    elements.bridgeStatus.textContent = "Clipboard paste unavailable";
  }
});

function openSetupDialog({ focusProvider = false, tab = "", mode = "" } = {}) {
  const requestedTab = focusProvider ? "ai" : tab || "app";
  const requestedMode = mode || settingsModeForTab(requestedTab);
  setSettingsTab(requestedTab, { mode: requestedMode });
  elements.setupDialog.showModal();
  if (focusProvider) {
    window.setTimeout(() => {
      elements.providerSetupSection?.scrollIntoView({ block: "start", behavior: "smooth" });
      elements.providerSetupSection?.classList.add("setup-section-focused");
      window.setTimeout(() => {
        elements.providerSetupSection?.classList.remove("setup-section-focused");
      }, 1400);
    }, 50);
  }
  if (clientMode) {
    refreshGuestSnapshot({ explicit: false }).catch(() => {});
    return;
  }
  refreshProviderStatus({ quiet: true });
}

function setSettingsTab(tab = "app", { mode = state.settingsMode || "app" } = {}) {
  const projection = buildSettingsSurfaceProjection({ tab, mode });
  state.settingsMode = projection.mode;
  applySettingsSurfaceProjection(elements, projection);
}

document.querySelectorAll("[data-add-domain]").forEach((button) => {
  button.addEventListener("click", () => openRecordDialog(button.dataset.addDomain));
});

elements.closeRecordDialog.addEventListener("click", () => {
  state.editingRecord = null;
  elements.recordDialog.close();
});

elements.closeCampaignDialog.addEventListener("click", () => {
  dismissCampaignWizard();
});

elements.campaignDialog?.addEventListener("close", () => {
  closeCampaignWizardWorkspace();
  state.campaignWizardReturnHome = false;
});

elements.campaignDialog?.addEventListener("cancel", (event) => {
  if (!state.campaignWizardReturnHome) {
    return;
  }
  event.preventDefault();
  dismissCampaignWizard();
});

elements.campaignDialog?.addEventListener("input", () => {
  schedulePreTableLobbyPublish();
});

elements.campaignDialog?.addEventListener("change", () => {
  schedulePreTableLobbyPublish({ immediate: true });
});

elements.copyPreTableGuestLink?.addEventListener("click", async () => {
  await copyPreTableGuestLinkFromUi();
});

elements.campaignForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (state.campaignWizardCreating) {
    return;
  }
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
      controllerKind: selectedRadioValue("new-character-controller", "host"),
    },
    startingPartyMembers: collectWizardAdditionalCharacters(),
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
  state.pendingDeleteCampaign = null;
  elements.deleteCampaignDialog.close();
});

elements.cancelDeleteCampaign.addEventListener("click", () => {
  state.pendingDeleteCampaign = null;
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

elements.playerInput?.addEventListener("input", () => {
  renderInputComposer();
});

async function nudgeDm() {
  const gate = buildNudgeDmCommandGate({
    isHost: !clientMode && !isRemoteTableClient(),
    readyForOpening: isCampaignReadyForOpening(),
    turnProjection: turnProjection(),
  });
  if (gate.blocked) {
    setProviderActivity(gate.activityText, gate.activityState);
    return { providerReceived: false, reason: gate.reason };
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

async function startAdventureOpening() {
  const gate = buildStartAdventureCommandGate({
    isHost: !clientMode && !isRemoteTableClient(),
    readyForOpening: isCampaignReadyForOpening(),
    openingRequested: isOpeningRequestedForCurrentSession(),
    turnProjection: turnProjection(),
  });
  if (gate.blocked) {
    setProviderActivity(gate.activityText, gate.activityState);
    return { providerReceived: false, reason: gate.reason };
  }

  markOpeningRequestedForCurrentSession();
  renderTableActions();
  pushDiagnosticsEvent("opening_start_requested", {
    campaignId: state.campaign?.id,
    scene: state.campaign?.scene,
    partyCount: state.campaign?.party?.length ?? 0,
  });
  setProviderActivity("Starting the adventure...", "working");
  return submitPlayerTurnFromInput(buildAdventureOpeningPrompt(), {
    allowBeforeOpening: true,
    skipPlayerEcho: true,
    skipPartySeed: true,
    skipChoiceExpansion: true,
    preserveInput: true,
  });
}

async function nudgeAiPartyMember(member) {
  const inCombat = Boolean(state.campaign?.combat?.inCombat);
  const gate = buildAiCompanionNudgeGate({
    isHost: Boolean(member?.id && !clientMode && !isRemoteTableClient()),
    readyForOpening: isCampaignReadyForOpening(),
    inCombat,
    isActiveCombatTurn: isActiveAiCompanionCombatTurn(member),
    companionName: member?.name || "This companion",
  });
  if (gate.blocked) {
    setProviderActivity(gate.activityText, gate.activityState);
    return { providerReceived: false, reason: gate.reason };
  }
  if (state.campaign?.combat?.inCombat) {
    const prompt = buildAiCompanionCombatNudgePrompt(member);
    setProviderActivity(`Prompting ${member.name} for a companion combat suggestion...`, "working");
    return submitPlayerTurnFromInput(prompt, {
      skipPlayerEcho: true,
      skipPartySeed: true,
      skipChoiceExpansion: true,
      preserveInput: true,
    });
  }
  const prompt = [
    `Invite ${member.name} to make one brief AI companion RP contribution now.`,
    `(AI companion nudge: ${member.name} may speak, react, ask a useful question, notice a small grounded detail, or take a low-stakes helpful action that fits their character.`,
    "Do not decide the party's direction, consume major resources, start combat, make attacks, move or speak for any host/remote-controlled character, or override a human player's agency.",
    `If ${member.name} contributes, render it as a party table entry from ${member.name}; include a short DM response only if the scene needs one.`,
    "Use existing scene context and consequences. No option list unless there is an immediate natural question.)",
  ].join(" ");
  setProviderActivity(`Prompting ${member.name} for a companion RP beat...`, "working");
  return submitPlayerTurnFromInput(prompt, {
    skipPlayerEcho: true,
    skipPartySeed: true,
    skipChoiceExpansion: true,
    preserveInput: true,
  });
}

function isActiveAiCompanionCombatTurn(member) {
  return Boolean(
    member?.id &&
    state.campaign?.combat?.inCombat &&
    state.campaign.combat.currentTurnId === member.id &&
    partyControllerKind(member) === "ai_companion"
  );
}

function buildAiCompanionCombatNudgePrompt(member) {
  return [
    `Invite ${member.name} to suggest their combat turn action now.`,
    `(AI companion combat nudge: ${member.name} is the active initiative actor. Suggest exactly one concise combat action in ${member.name}'s voice or tactical posture.`,
    "Do not roll dice, deal damage, spend resources, apply conditions, move initiative, resolve the action, or act for any other party member.",
    "Render this as a party table entry from the companion so the host can Stage For DM, Resolve Now, or Pass.",
    "If a rules choice is unclear, suggest the safest legal option and mention what the host should confirm.)",
  ].join(" ");
}

function normalizeSubmittedPlayerMessage(originalInput, options = {}) {
  const text = String(originalInput ?? "").trim();
  const pendingSelection = state.pendingChoiceSelection;
  state.pendingChoiceSelection = null;
  if (!text || options.skipChoiceExpansion) {
    return text;
  }

  const selectedChoices = buildChoiceSelectionFromText({
    text,
    panel: latestChoicePanelFromMessages(),
  }) || (pendingSelectionMatchesText(pendingSelection, text) ? pendingSelection : null);
  if (!selectedChoices) {
    return text;
  }

  pushDiagnosticsEvent("choice_selection_expanded", selectedChoices);
  state.pendingChoiceSelection = selectedChoices;
  const inWorldText = choiceSelectionInWorldText(selectedChoices, text);
  return [
    inWorldText,
    buildChoiceSelectionMeta(selectedChoices, {
      actualAction: inWorldText,
      inCombat: state.campaign?.combat?.inCombat,
    }),
  ].join("\n\n");
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

function currentChoiceVotes(block = {}) {
  return currentChoiceVotesForBlock(block, state.campaign?.multiplayer?.choiceVotes ?? []);
}

function leadingChoiceVoteEntry(block = {}) {
  return projectedLeadingChoiceVoteEntry(block, {
    choiceVotes: currentChoiceVotes(block),
    isHost: !isRemoteTableClient(),
  });
}

function currentGuestVoteForChoice(block = {}) {
  const playerId = state.guestSession?.playerId || state.guestSnapshot?.connection?.playerId || "";
  const characterId = state.guestSession?.partyMemberId || state.guestSnapshot?.connection?.partyMemberId || "";
  return projectedGuestVoteForChoice(block, {
    choiceVotes: currentChoiceVotes(block),
    playerId,
    characterId,
  });
}

function chooseVisibleOption(block, index) {
  const item = block.items?.[index];
  if (!item) {
    return;
  }
  const label = choiceLabelForIndex(index);
  const optionId = choiceOptionId(block, index);
  if (isRemoteTableClient() && isPartyVoteChoiceBlock(block)) {
    submitGuestChoiceVote(block, index);
    return;
  }
  state.pendingChoiceSelection = {
    labels: [label],
    choices: [item],
    optionRecords: [block.options?.[index] ?? null],
    prompt: block.prompt || "",
    scope: block.scope || "",
    forActorId: block.forActorId ?? null,
    forActor: block.forActor || "",
    forActorIds: Array.isArray(block.forActorIds) ? block.forActorIds : [],
    allowVote: block.allowVote === true,
    selectedOptionIds: [optionId],
    inWorldText: `I choose ${label}: ${item}`,
  };
  elements.playerInput.value = `I choose ${label}: ${item}`;
  elements.playerInput.focus();
  renderInputComposer();
  const voteCount = choiceVoteCounts(block, currentChoiceVotes(block)).get(optionId) || 0;
  setProviderActivity(choiceSelectionActivityText(label, voteCount), "idle");
}

async function submitPlayerTurnFromInput(originalInput, options = {}) {
  // Danger zone: renderer still coordinates input echoing, staged guest inputs,
  // provider execution, and recovery lifecycle. Future target: a TurnFlow
  // command handler that returns a projection for app.js to render.
  const submitGate = buildTurnSubmitGate({
    turnProjection: turnProjection(),
    repair: activeTurnRepair(),
    allowDuringRepair: options.allowDuringRepair,
    readyForOpening: isCampaignReadyForOpening(),
    allowBeforeOpening: options.allowBeforeOpening,
  });
  if (submitGate.blocked) {
    elements.bridgeStatus.textContent = submitGate.bridgeText;
    setProviderActivity(submitGate.activityText, submitGate.activityState);
    return { providerReceived: false, reason: submitGate.reason };
  }
  const approvedPartyInputs = options.playerInputs ? [] : collectApprovedPartyInputs();
  const stagedRemoteInputs = options.playerInputs ? [] : collectStagedRemoteInputs();
  const normalizedMessage = normalizeSubmittedPlayerMessage(originalInput, options);
  const playerInputs = options.playerInputs ?? [
    ...playerInputsFromChoiceSelection(state.pendingChoiceSelection),
    ...approvedPartyInputs,
    ...stagedRemoteInputs,
  ];
  const playerMessage = normalizedMessage;
  const contentGate = buildTurnContentGate({ playerMessage, playerInputs });
  if (contentGate.blocked) {
    elements.bridgeStatus.textContent = contentGate.bridgeText;
    setProviderActivity(contentGate.activityText, contentGate.activityState);
    return { providerReceived: false, reason: contentGate.reason };
  }

  setProviderActivity("Preparing the DM turn...", "working");
  state.currentTurn = createPlayerTurn({
    campaign: state.campaign,
    playerMessage,
    playerInputs,
  });
  state.contextPack = state.currentTurn.contextPack;
  state.prompt = state.currentTurn.providerPrompt;
  state.currentTurn.turnId = state.currentTurn.turnId || state.currentTurn.id;
  const currentTurnId = state.currentTurn.turnId;
  const visiblePlayerText = state.currentTurn.parsedMessage?.inWorldText;
  const metaText = (state.currentTurn.parsedMessage?.metaInstructions ?? []).join(" ");
  let playerEchoMessageId = null;
  if (!options.skipPlayerEcho && normalizedMessage && visiblePlayerText) {
    const duplicate = findUnresolvedDuplicatePlayerMessage(visiblePlayerText, metaText);
    if (duplicate) {
      pushDiagnosticsEvent("duplicate_player_turn_echo_suppressed", {
        duplicateOf: duplicate.id,
        body: visiblePlayerText,
      });
      playerEchoMessageId = duplicate.id;
      patchPlayMessageLocal(duplicate.id, {
        data: {
          turnId: currentTurnId,
          status: "turn_waiting_for_dm",
          lifecycle: "waiting_for_dm",
        },
      });
    } else {
      const playerEcho = await appendPlayMessage({
        role: "player",
        title: "You",
        body: visiblePlayerText,
        meta: metaText,
        source: "player_input",
        data: {
          turnId: currentTurnId,
          status: "turn_waiting_for_dm",
          lifecycle: "waiting_for_dm",
        },
      });
      playerEchoMessageId = playerEcho.id;
    }
  } else if (!options.skipPlayerEcho && normalizedMessage && metaText) {
    const playerEcho = await appendPlayMessage({
      role: "player",
      title: "You (meta)",
      body: metaText,
      meta: "Out-of-world instruction",
      source: "player_meta",
      data: {
        turnId: currentTurnId,
        status: "turn_waiting_for_dm",
        lifecycle: "waiting_for_dm",
      },
    });
    playerEchoMessageId = playerEcho.id;
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
  state.currentTurn.turnId = currentTurnId;
  render();
  const providerMode = currentProviderSettings().preferredProvider;
  const runResult = providerMode === "ollama"
    ? await runPromptThroughLocalProvider(state.currentTurn)
    : await runPromptThroughCampaignChat(state.prompt);
  await updatePlayerTurnEchoLifecycle(playerEchoMessageId, runResult);
  await applyStagedInputRecoveryPlan(buildStagedInputRecoveryPlan({
    runResult,
    approvedPartyInputs,
    stagedRemoteInputs,
  }), runResult);
  if (runResult?.imported) {
    state.currentTurn = null;
  }
  if (runResult?.providerReceived && !options.preserveInput) {
    elements.playerInput.value = "";
  } else if (!runResult?.providerReceived && !options.preserveInput && !elements.playerInput.value.trim()) {
    elements.playerInput.value = originalInput;
  }
  renderInputComposer();
  schedulePostTurnRecovery(runResult?.imported ? "turn_imported" : "turn_not_imported");
  return runResult;
}

async function updatePlayerTurnEchoLifecycle(messageId, runResult = {}) {
  if (!messageId) {
    return;
  }
  let status = "turn_waiting_for_dm";
  let lifecycle = "waiting_for_dm";
  if (runResult?.imported) {
    status = "turn_resolved";
    lifecycle = "resolved";
  } else if (runResult?.needsRepair) {
    status = "turn_needs_review";
    lifecycle = "needs_review";
  } else if (runResult?.timedOut) {
    status = "turn_timed_out";
    lifecycle = "timed_out";
  } else if (runResult?.canceled) {
    status = "turn_canceled";
    lifecycle = "canceled";
  } else if (runResult?.error || runResult?.providerReceived === false) {
    status = "turn_failed";
    lifecycle = "failed";
  } else if (runResult?.providerReceived) {
    status = "turn_waiting_for_import";
    lifecycle = "waiting_for_import";
  }

  await patchPlayMessage(messageId, {
    data: {
      status,
      lifecycle,
      providerReceived: Boolean(runResult?.providerReceived),
      imported: Boolean(runResult?.imported),
      recovered: Boolean(runResult?.recovered),
      needsRepair: Boolean(runResult?.needsRepair),
      timedOut: Boolean(runResult?.timedOut),
      canceled: Boolean(runResult?.canceled),
      failureReason: runResult?.error instanceof Error ? runResult.error.message : "",
    },
  }, { tolerateMissing: true });
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
  renderInputComposer();
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
      updatedAt: input.updatedAt,
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

async function markApprovedPartyInputsStillStaged(inputs, runResult = {}) {
  const failureReason = providerFailureReason(runResult);
  for (const input of inputs) {
    await patchPlayMessage(input.id, {
      meta: "Still staged; DM did not resolve it. Retry when ready.",
      data: {
        lifecycle: "dm_failed_still_staged",
        failureReason,
        lastFailureAt: new Date().toISOString(),
      },
    });
  }
}

async function markRemoteInputsStillStaged(inputs, runResult = {}) {
  const failureReason = providerFailureReason(runResult);
  for (const input of inputs) {
    const message = state.playMessages.find((item) => item.data?.pendingInputId === input.id);
    if (!message) {
      continue;
    }
    await patchPlayMessage(message.id, {
      meta: "Still staged at the host table; DM did not resolve it. Retry when ready.",
      data: {
        lifecycle: "dm_failed_still_staged",
        failureReason,
        lastFailureAt: new Date().toISOString(),
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
    ...localTableAuthorityPayload(),
  });
  setCampaignFromPayload(result, "local_table_pending_cleared");
  state.multiplayerSnapshot = result.multiplayer;
  seedPlayLog();
  render();
}

async function dropPendingRemoteInput(inputId) {
  if (!inputId) {
    return;
  }
  const result = await postJson(apiMultiplayerClearPendingUrl, {
    inputIds: [inputId],
    disposition: "dropped",
    ...localTableAuthorityPayload(),
  });
  setCampaignFromPayload(result, "local_table_pending_dropped");
  state.multiplayerSnapshot = result.multiplayer;
  seedPlayLog();
  setProviderActivity("Staged guest action dropped", "idle");
  render();
}

async function applyStagedInputRecoveryPlan(plan, runResult = {}) {
  if (plan?.approvedParty?.hasInputs) {
    if (plan.approvedParty.action === stagedInputRecoveryActions.MARK_SUBMITTED) {
      await markApprovedPartyInputsSubmitted(plan.approvedParty.inputs);
    } else if (plan.approvedParty.action === stagedInputRecoveryActions.KEEP_STAGED) {
      await markApprovedPartyInputsStillStaged(plan.approvedParty.inputs, runResult);
    }
  }
  if (plan?.stagedRemote?.hasInputs) {
    if (plan.stagedRemote.action === stagedInputRecoveryActions.CLEAR_PENDING) {
      await clearSubmittedRemoteInputs(plan.stagedRemote.inputs);
    } else if (plan.stagedRemote.action === stagedInputRecoveryActions.KEEP_STAGED) {
      await markRemoteInputsStillStaged(plan.stagedRemote.inputs, runResult);
    }
  }
  if (plan?.pendingRemote?.hasInputs) {
    if (plan.pendingRemote.action === stagedInputRecoveryActions.CLEAR_PENDING) {
      const result = await postJson(apiMultiplayerClearPendingUrl, {
        inputIds: plan.pendingRemote.inputs.map((input) => input.id),
        ...localTableAuthorityPayload(),
      });
      setCampaignFromPayload(result, "local_table_pending_cleared");
      state.multiplayerSnapshot = result.multiplayer;
      render();
    } else if (plan.pendingRemote.action === stagedInputRecoveryActions.KEEP_STAGED) {
      await markRemoteInputsStillStaged(plan.pendingRemote.inputs, runResult);
    }
  }
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

installInternalDebugHarness();
await boot();
startMultiplayerPolling();

async function boot() {
  if (clientMode) {
    await bootClientMode();
    return;
  }
  if (isRemoteTableClient() && state.guestSession?.connectionId) {
    await bootRemoteClientMode();
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
  document.title = "LoreKeeper Join";
  const loadedInvite = applyLaunchInviteLink();
  state.sourceMode = "guest";
  state.campaigns = [];
  state.sqlitePath = "";
  state.campaign = createGuestShellCampaign();
  state.contextPack = buildContextPack(state.campaign, {
    purpose: "guest_client_shell",
  });
  seedPlayLog();
  render();
  if (state.launchInviteError) {
    setProviderActivity(state.launchInviteError, "error");
  } else {
    setProviderActivity(
      loadedInvite
        ? "Invite link loaded. Enter your name, then join the hosted table."
        : guestWaitingRoomMode
        ? "Guest waiting room ready. Ask the host for a seat."
        : "LoreKeeper Join ready. Paste a host invite link to join.",
      loadedInvite ? "waiting" : "idle",
    );
  }
  if (guestWaitingRoomMode) {
    await refreshGuestLobbyPreview({ quiet: true }).catch(() => {});
  }

  if (state.guestSession?.hostBaseUrl && state.guestSession?.connectionId) {
    try {
      await refreshGuestSnapshot({ explicit: false });
      return;
    } catch {
      setProviderActivity("Saved host connection is unavailable. Paste a fresh invite link.", "waiting");
    }
  }

  if (guestWaitingRoomMode && state.waitingRoomSession?.waitingGuestId) {
    if (elements.guestWaitingPlayerName && state.waitingRoomSession.playerName) {
      elements.guestWaitingPlayerName.value = state.waitingRoomSession.playerName;
    }
    await refreshWaitingRoomStatus({ explicit: false }).catch(() => {
      setProviderActivity("Waiting room session expired. Ask to join again.", "waiting");
      clearWaitingRoomSession();
      render();
    });
    return;
  }

  window.setTimeout(() => {
    if (guestWaitingRoomMode) {
      elements.guestWaitingPlayerName?.focus();
      return;
    }
    if (loadedInvite && elements.joinClientPlayerName && !elements.joinClientPlayerName.value) {
      elements.joinClientPlayerName.focus();
      return;
    }
    elements.joinClientInviteLink?.focus();
  }, 200);
}

async function bootRemoteClientMode() {
  state.sourceMode = "guest";
  state.campaigns = [];
  state.sqlitePath = "";
  state.campaign = createGuestShellCampaign();
  state.contextPack = buildContextPack(state.campaign, {
    purpose: "remote_join_client_shell",
  });
  seedPlayLog();
  render();
  setProviderActivity("Rejoining hosted table...", "waiting");

  try {
    await refreshGuestSnapshot({ explicit: false });
  } catch {
    clearGuestSession();
    state.sourceMode = "loading";
    setProviderActivity("Saved host connection is unavailable. Join again with a fresh invite.", "waiting");
    await loadCampaign();
    await refreshProviderStatus({ quiet: true });
    await refreshMultiplayerSnapshot({ quiet: true });
    seedPlayLog();
    render();
  }
}

function startMultiplayerPolling() {
  window.setInterval(async () => {
    try {
      const pollingPlan = buildMultiplayerPollingPlan({
        activeGeneration: hasActiveGeneration(),
        guestWaitingRoomMode,
        localTableRunning: state.campaign?.multiplayer?.localTable?.running,
        guestHostBaseUrl: state.guestSession?.hostBaseUrl,
        guestConnectionId: state.guestSession?.connectionId,
        waitingRoomGuestId: state.waitingRoomSession?.waitingGuestId,
        campaignWizardCreating: state.campaignWizardCreating,
      });

      if (pollingPlan.action === multiplayerPollingActions.REFRESH_HOST_SNAPSHOT_DURING_GENERATION) {
        await refreshMultiplayerSnapshot({ quiet: true });
        renderTableTalk();
        renderTableActions();
        announceWaitingGuestsIfNeeded();
        return;
      }
      if (pollingPlan.action === multiplayerPollingActions.IDLE_DURING_GENERATION) {
        return;
      }
      if (pollingPlan.action === multiplayerPollingActions.REFRESH_GUEST_SNAPSHOT) {
        await refreshGuestSnapshot({ explicit: false });
        return;
      }
      if (pollingPlan.action === multiplayerPollingActions.REFRESH_WAITING_ROOM_STATUS) {
        await refreshWaitingRoomStatus({ explicit: false });
        return;
      }
      if (pollingPlan.action === multiplayerPollingActions.REFRESH_GUEST_LOBBY_PREVIEW) {
        await refreshGuestLobbyPreview({ quiet: true }).catch(() => {});
        return;
      }
      if (pollingPlan.action === multiplayerPollingActions.IDLE_CAMPAIGN_WIZARD_CREATING) {
        return;
      }
      if (pollingPlan.action === multiplayerPollingActions.POLL_LOCAL_TABLE) {
        const response = await fetch(apiCampaignUrl, { cache: "no-store" });
        if (!response.ok) {
          return;
        }
        const payload = await response.json();
        setCampaignFromPayload(payload, "local_table_poll");
        await refreshMultiplayerSnapshot({ quiet: true });
        seedPlayLog();
        render();
        announceWaitingGuestsIfNeeded();
        schedulePostTurnRecovery("local_table_poll");
      }
    } catch (error) {
      if (state.guestSession?.hostBaseUrl) {
        setProviderActivity(
          error instanceof Error ? `Guest table refresh waiting: ${error.message}` : "Guest table refresh waiting on host",
          "waiting",
        );
      }
    }
  }, multiplayerPollIntervalMs);
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
    const resolution = resolveEnemyCombatTurn(state.campaign, current, turnKey);
    const result = await commitEngineCombatResolution(resolution, {
      source: "combat_engine_enemy_turn",
      summary: resolution.actionRecord.summary || `${current.name} completed their combat turn.`,
    });
    if (result?.applied?.length) {
      await appendPlayMessage(combatResolutionMessage(resolution));
      const activeAfterCommit = state.campaign?.combat?.currentTurnId ?? null;
      if (!state.campaign?.combat?.inCombat || (activeAfterCommit && activeAfterCommit !== current.id)) {
        state.lastAutoResolvedEnemyKey = turnKey;
        setProviderActivity("Enemy turn resolved", "idle");
      } else {
        state.lastAutoResolvedEnemyKey = "";
        setProviderActivity(`${current.name}'s turn needs review; initiative did not advance`, "waiting");
      }
    }
  } catch (error) {
    pushDiagnosticsEvent("enemy_turn_resolution_failed", {
      actorId: current.id,
      message: error instanceof Error ? error.message : String(error ?? "Unknown error"),
    });
    setProviderActivity(error instanceof Error ? `Enemy turn needs review: ${error.message}` : "Enemy turn needs review", "waiting");
  } finally {
    state.autoResolvingEnemyTurn = false;
  }
}

async function commitEngineCombatResolution(resolution, options = {}) {
  const change = engineCombatResolutionChange(state.campaign, resolution, options);
  const reviewBatch = createReviewBatch({
    campaignId: state.campaign.id,
    source: options.source || "combat_engine",
    rawResponse: resolution.actionRecord?.narration || "",
    proposedChanges: [change],
  });
  reviewBatch.proposedChanges = reviewBatch.proposedChanges.map((proposedChange) => ({
    ...proposedChange,
    status: proposedChange.validation?.valid ? "approved" : proposedChange.status,
  }));
  return commitExtractedChanges(reviewBatch);
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

  const repair = createImplicitCombatActorPromptChange({
    campaign: state.campaign,
    tableMessages: state.playMessages,
  });
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
    await markPendingPlayerTurnRecovering(pending, reason);
    setProviderActivity("Resuming unresolved player turn...", "working");
    const runResult = await submitPlayerTurnFromInput(turnText, {
      skipPlayerEcho: true,
      skipPartySeed: true,
      preserveInput: true,
      resumePendingTurn: true,
    });
    await updatePlayerTurnEchoLifecycle(pending.id, {
      ...runResult,
      recovered: true,
    });
  } finally {
    state.autoResumingPendingTurn = false;
  }
}

async function markPendingPlayerTurnRecovering(message, reason = "unknown") {
  if (!message?.id) {
    return;
  }
  await patchPlayMessage(message.id, {
    data: {
      status: "turn_recovering",
      lifecycle: "recovering",
      recoveryReason: reason,
      recoveryStartedAt: new Date().toISOString(),
    },
  });
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
  const inputs = earliestGuestInputForImmediateResolution(collectStagedRemoteInputs());
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

function applyLaunchInviteLink() {
  const inviteLink = String(launchInviteLink || "").trim();
  if (!inviteLink || guestWaitingRoomMode) {
    return false;
  }
  const parsed = parseInviteLinkForClient(inviteLink);
  if (!parsed.valid) {
    state.launchInviteError = parsed.error;
    return false;
  }

  const rememberedName = state.guestSession?.playerName || state.recentGuestSession?.playerName || "";
  if (state.guestSession?.inviteLink !== inviteLink) {
    clearGuestSession({ keepRecent: false });
  }
  clearWaitingRoomSession();
  state.recentGuestSession = {
    inviteLink,
    hostBaseUrl: `http://${parsed.host}:${parsed.port}`,
    playerName: rememberedName,
    campaignId: parsed.campaign,
    tableId: parsed.tableId,
    sessionId: parsed.sessionId,
    partyMemberId: parsed.seat,
    savedAt: new Date().toISOString(),
  };
  localStorage.setItem(guestRecentSessionStorageKey, JSON.stringify(state.recentGuestSession));
  return true;
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
  resetTurnCarryover();
}

async function selectCampaignByPath(sqlitePath) {
  try {
    elements.bridgeStatus.textContent = "Opening campaign...";
    setProviderActivity("Opening campaign...", "working");
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

function compactCharacterFormRefs(kind, root = document) {
  const bySelector = (selector) => root?.querySelector?.(selector) ?? null;
  if (kind === "new-character") {
    return {
      name: elements.newCharacterName,
      ancestry: elements.newCharacterAncestry,
      characterClass: elements.newCharacterClass,
      level: elements.newCharacterLevel,
      concept: elements.newCharacterConcept,
    };
  }
  if (kind === "wizard-card") {
    return {
      name: bySelector("[data-character-field='name'], #new-joiner-name"),
      ancestry: bySelector("[data-character-field='ancestry'], #new-joiner-ancestry"),
      characterClass: bySelector("[data-character-field='class'], #new-joiner-class"),
      level: bySelector("[data-character-field='level'], #new-joiner-level"),
      concept: bySelector("[data-character-field='concept'], #new-joiner-concept"),
      integrationPrompt: bySelector("[data-character-field='integration'], #new-joiner-integration"),
      hostIntegrationPrompt: bySelector("[data-character-field='hostContext'], #new-joiner-host-context"),
      autoSheet: bySelector("[data-character-field='autoSheet'], #new-joiner-auto-sheet"),
      controllerKind: selectedRadioValueFromRoot(root, "[data-character-field='controllerKind']", "ai_companion"),
    };
  }
  if (kind === "join-client") {
    return {
      name: elements.joinClientCharacterName,
      ancestry: elements.joinClientCharacterAncestry,
      characterClass: elements.joinClientCharacterClass,
      level: elements.joinClientCharacterLevel,
      roleIntent: elements.joinClientCharacterRole,
      appearance: elements.joinClientCharacterAppearance,
      backstory: elements.joinClientCharacterBackstory,
      integrationPrompt: elements.joinClientCharacterIntegration,
    };
  }
  if (kind === "join-dialog") {
    return {
      name: elements.joinCharacterName,
      ancestry: elements.joinCharacterAncestry,
      characterClass: elements.joinCharacterClass,
      level: elements.joinCharacterLevel,
      roleIntent: elements.joinCharacterRole,
      appearance: elements.joinCharacterAppearance,
      backstory: elements.joinCharacterBackstory,
      integrationPrompt: elements.joinCharacterIntegration,
    };
  }
  if (kind === "record-party") {
    const split = splitAncestryClass(elements.recordRole?.value);
    return {
      name: elements.recordName,
      ancestry: virtualFormValue(split.ancestry),
      characterClass: elements.recordRole,
      level: virtualFormValue("1"),
      concept: elements.recordNotes,
    };
  }
  return {};
}

function autocompleteCompactCharacterForm(refs = {}) {
  const regenerateDerivedFields = true;
  state.characterAutocompleteRerollCounter = (state.characterAutocompleteRerollCounter || 0) + 1;
  const completed = completeCharacterSeed(compactCharacterSeedFromRefs(refs), {
    campaign: characterAutocompleteCampaignContext(),
    regenerate: regenerateDerivedFields,
    regenerateNonce: state.characterAutocompleteRerollCounter,
    startingPartyMembers: characterAutocompleteStartingPartyMembers(),
  });
  setIfBlank(refs.name, completed.name);
  setIfBlank(refs.ancestry, completed.ancestry);
  setIfBlank(refs.characterClass, completed.characterClass);
  setIfBlank(refs.level, String(completed.level || 1));
  setIfBlank(refs.roleIntent, completed.roleIntent);
  setGeneratedFormValue(refs.appearance, completed.appearance, { regenerate: regenerateDerivedFields });
  setGeneratedFormValue(refs.backstory, completed.backstory, { regenerate: regenerateDerivedFields });
  setGeneratedFormValue(refs.concept, completed.backstory, { regenerate: regenerateDerivedFields });
  setGeneratedFormValue(refs.integrationPrompt, completed.integrationPrompt, { regenerate: regenerateDerivedFields });
  setGeneratedFormValue(refs.hostIntegrationPrompt, completed.hostIntegrationPrompt, { regenerate: regenerateDerivedFields });
  setProviderActivity(`${completed.name} re-seeded`, "idle");
}

function characterAutocompleteCampaignContext() {
  if (elements.campaignDialog?.open) {
    return {
      title: elements.newCampaignTitle?.value,
      summary: elements.newCampaignPremise?.value,
      tone: elements.newCampaignTone?.value,
      startingLocation: elements.newCampaignStartingLocation?.value,
    };
  }
  return state.campaign;
}

function characterAutocompleteStartingPartyMembers() {
  if (!elements.campaignDialog?.open) {
    return [];
  }
  return [
    compactCharacterSeedFromRefs(compactCharacterFormRefs("new-character")),
    ...collectWizardAdditionalCharacters(),
  ].filter((member) => [member.name, member.ancestry, member.characterClass, member.concept].some((value) => String(value ?? "").trim()));
}

function compactCharacterSeedFromRefs(refs = {}) {
  return {
    name: refs.name?.value,
    ancestry: refs.ancestry?.value,
    characterClass: refs.characterClass?.value,
    level: refs.level?.value,
    roleIntent: refs.roleIntent?.value,
    appearance: refs.appearance?.value,
    backstory: refs.backstory?.value,
    concept: refs.concept?.value,
    integrationPrompt: refs.integrationPrompt?.value,
    hostIntegrationPrompt: refs.hostIntegrationPrompt?.value,
    controllerKind: typeof refs.controllerKind === "string" ? refs.controllerKind : refs.controllerKind?.value,
  };
}

function addWizardPartyMemberCard(input = {}) {
  const container = elements.wizardAdditionalCharacters;
  if (!container) {
    return null;
  }
  const index = container.querySelectorAll("[data-wizard-character-card]").length;
  const card = document.createElement("article");
  card.className = "wizard-character-card";
  card.dataset.wizardCharacterCard = String(index);
  card.innerHTML = `
    <div class="wizard-character-card-heading">
      <h3>Character ${index + 2}</h3>
      <div class="wizard-character-actions">
        <button class="mini-action" type="button" data-autocomplete-wizard-character="${index}">Auto-Complete</button>
        <button class="icon-action" type="button" title="Remove character" data-remove-wizard-character="${index}">x</button>
      </div>
    </div>
    <div class="controller-choice-row" aria-label="Character ${index + 2} controller">
      <label><input type="radio" name="wizard-character-controller-${index}" value="ai_companion" data-character-field="controllerKind" checked /><span>Companion</span></label>
      <label><input type="radio" name="wizard-character-controller-${index}" value="host" data-character-field="controllerKind" /><span>You</span></label>
      <label><input type="radio" name="wizard-character-controller-${index}" value="remote_invite" data-character-field="controllerKind" /><span>Invite Friend</span></label>
    </div>
    <div class="campaign-wizard-grid">
      <label><span>Name</span><input data-character-field="name" autocomplete="off" placeholder="Oskar, Ingrid, Bren..." /></label>
      <label><span>Ancestry</span><input data-character-field="ancestry" autocomplete="off" placeholder="Dwarf, elf, human..." /></label>
      <label><span>Class / role</span><input data-character-field="class" autocomplete="off" placeholder="Soldier, scout, cleric..." /></label>
      <label><span>Level</span><input data-character-field="level" inputmode="numeric" value="1" /></label>
    </div>
    <label><span>Character pitch</span><textarea data-character-field="concept" rows="3" placeholder="Who are they, what do they care about, and what do they bring?"></textarea></label>
    <label><span>Why they are with the party</span><textarea data-character-field="integration" rows="3" placeholder="Old friend, squadmate, hired guide, sibling, rival..."></textarea></label>
    <label><span>Scene cue for DM Voice</span><textarea data-character-field="hostContext" rows="3" placeholder="How they fit into the opening scene."></textarea></label>
    <label class="check-row"><input data-character-field="autoSheet" type="checkbox" checked /><span>Auto-fill a 5E-lite sheet for this party member</span></label>
  `;
  container.append(card);
  const refs = compactCharacterFormRefs("wizard-card", card);
  setFormValue(refs.name, input.name);
  setFormValue(refs.ancestry, input.ancestry);
  setFormValue(refs.characterClass, input.characterClass);
  setFormValue(refs.level, input.level ?? "1");
  setFormValue(refs.concept, input.concept);
  setFormValue(refs.integrationPrompt, input.integrationPrompt);
  setFormValue(refs.hostIntegrationPrompt, input.hostIntegrationPrompt);
  setWizardControllerKind(card, input.controllerKind || "ai_companion");
  refs.name?.focus();
  return card;
}

function addPartyTemplateCharactersToWizard() {
  const primarySeed = compactCharacterSeedFromRefs(compactCharacterFormRefs("new-character"));
  const characters = buildPartyTemplateCharacters(primarySeed, {
    campaign: characterAutocompleteCampaignContext(),
    startingPartyMembers: characterAutocompleteStartingPartyMembers(),
    count: 3,
  });
  for (const character of characters) {
    const card = nextEmptyWizardCharacterCard() || addWizardPartyMemberCard();
    fillWizardPartyMemberCard(card, character);
  }
  renumberWizardPartyMemberCards();
  setProviderActivity("Party set added; review names and seats", "idle");
}

function nextEmptyWizardCharacterCard() {
  return [...(elements.wizardAdditionalCharacters?.querySelectorAll("[data-wizard-character-card]") ?? [])]
    .find((card) => {
      const input = wizardCharacterInputFromRefs(compactCharacterFormRefs("wizard-card", card));
      return ![input.name, input.ancestry, input.characterClass, input.concept, input.integrationPrompt, input.hostIntegrationPrompt]
        .some((value) => String(value ?? "").trim());
    }) || null;
}

function fillWizardPartyMemberCard(card, character = {}) {
  const refs = compactCharacterFormRefs("wizard-card", card);
  setFormValue(refs.name, character.name);
  setFormValue(refs.ancestry, character.ancestry);
  setFormValue(refs.characterClass, character.characterClass);
  setFormValue(refs.level, character.level ?? "1");
  setFormValue(refs.concept, character.concept || character.backstory);
  setFormValue(refs.integrationPrompt, character.integrationPrompt);
  setFormValue(refs.hostIntegrationPrompt, character.hostIntegrationPrompt);
  if (refs.autoSheet) {
    refs.autoSheet.checked = true;
  }
  setWizardControllerKind(card, character.controllerKind || "ai_companion");
}

function renumberWizardPartyMemberCards() {
  [...(elements.wizardAdditionalCharacters?.querySelectorAll("[data-wizard-character-card]") ?? [])].forEach((card, index) => {
    card.dataset.wizardCharacterCard = String(index);
    const heading = card.querySelector("h3");
    if (heading) heading.textContent = `Character ${index + 2}`;
    card.querySelector(".controller-choice-row")?.setAttribute("aria-label", `Character ${index + 2} controller`);
    card.querySelectorAll("[data-character-field='controllerKind']").forEach((input) => {
      input.name = `wizard-character-controller-${index}`;
    });
    card.querySelector("[data-autocomplete-wizard-character]")?.setAttribute("data-autocomplete-wizard-character", String(index));
    card.querySelector("[data-remove-wizard-character]")?.setAttribute("data-remove-wizard-character", String(index));
  });
}

function collectWizardAdditionalCharacters() {
  return [...(elements.wizardAdditionalCharacters?.querySelectorAll("[data-wizard-character-card]") ?? [])]
    .map((card) => wizardCharacterInputFromRefs(compactCharacterFormRefs("wizard-card", card)))
    .filter((input) => [input.name, input.ancestry, input.characterClass, input.concept, input.integrationPrompt, input.hostIntegrationPrompt].some((value) => String(value ?? "").trim()));
}

function wizardCharacterInputFromRefs(refs = {}) {
  return {
    name: refs.name?.value,
    ancestry: refs.ancestry?.value,
    characterClass: refs.characterClass?.value,
    level: refs.level?.value,
    concept: refs.concept?.value,
    integrationPrompt: refs.integrationPrompt?.value,
    hostIntegrationPrompt: refs.hostIntegrationPrompt?.value,
    autoSheet: refs.autoSheet?.checked ?? true,
    controllerKind: normalizeWizardControllerKind(refs.controllerKind),
  };
}

function selectedRadioValue(name, fallback = "") {
  return document.querySelector(`input[name="${name}"]:checked`)?.value || fallback;
}

function selectedRadioValueFromRoot(root = document, selector, fallback = "") {
  return root?.querySelector?.(`${selector}:checked`)?.value || fallback;
}

function setRadioValue(name, value) {
  const target = document.querySelector(`input[name="${name}"][value="${value}"]`);
  if (target) {
    target.checked = true;
  }
}

function setWizardControllerKind(card, value) {
  const normalized = normalizeWizardControllerKind(value);
  const target = card?.querySelector?.(`[data-character-field='controllerKind'][value="${normalized}"]`);
  if (target) {
    target.checked = true;
  }
}

function normalizeWizardControllerKind(value) {
  const normalized = String(value || "").trim();
  return ["host", "ai_companion", "remote_invite", "unassigned"].includes(normalized)
    ? normalized
    : "ai_companion";
}

function setIfBlank(input, value) {
  if (!input || String(input.value ?? "").trim() || value === undefined || value === null) {
    return;
  }
  input.value = String(value);
}

function setFormValue(input, value) {
  if (!input || value === undefined || value === null) {
    return;
  }
  input.value = String(value);
}

function setGeneratedFormValue(input, value, options = {}) {
  if (options.regenerate) {
    setFormValue(input, value);
    return;
  }
  setIfBlank(input, value);
}

function virtualFormValue(value = "") {
  return { value: String(value ?? "") };
}

function setCampaignWizardStatus(message, status = "idle") {
  if (!elements.campaignWizardStatus) {
    return;
  }
  elements.campaignWizardStatus.textContent = message;
  elements.campaignWizardStatus.dataset.state = status;
}

function setCampaignWizardBusy(isBusy) {
  state.campaignWizardCreating = Boolean(isBusy);
  if (!elements.startCampaignSubmit) {
    return;
  }
  elements.startCampaignSubmit.disabled = state.campaignWizardCreating;
  elements.startCampaignSubmit.textContent = state.campaignWizardCreating ? "Setting..." : "Set The Table";
}

function normalizeList(value) {
  if (Array.isArray(value)) {
    return value.filter((entry) => entry !== undefined && entry !== null);
  }
  return value === undefined || value === null ? [] : [value];
}

async function createNewCampaign({ title, premise, startingLocation, tone, playerCharacter, startingPartyMember, startingPartyMembers }) {
  if (state.campaignWizardCreating) {
    return;
  }
  setCampaignWizardBusy(true);
  setCampaignWizardStatus("Setting the table...", "working");
  const trimmedTitle = String(title ?? "").trim() || "Untitled Campaign";
  const trimmedPremise = String(premise ?? "").trim() || "Start a new D&D 5e-lite campaign. Ask for missing essentials, then open with a playable scene.";
  const trimmedStartingLocation = String(startingLocation ?? "").trim();
  const trimmedTone = String(tone ?? "").trim();
  const characterSeed = normalizeWizardCharacter(playerCharacter);
  const joinerSeeds = normalizeWizardJoiners(startingPartyMembers ?? [startingPartyMember]);
  const openingScene = buildOpeningSceneSummary({
    premise: trimmedPremise,
    startingLocation: trimmedStartingLocation,
    character: characterSeed,
    startingPartyMembers: joinerSeeds,
  });
  try {
    elements.bridgeStatus.textContent = "Setting the table...";
    setCampaignWizardStatus("Creating table file...", "working");
    setProviderActivity("Setting the table...", "working");
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
    setCampaignWizardStatus("Saving table...", "working");
    setCampaignFromPayload(payload, "new_campaign_start");
    state.reviewBatch = null;
    elements.responseImport.value = "";

    if (characterSeed.name) {
      setCampaignWizardStatus(`Adding ${characterSeed.name}...`, "working");
      await seedWizardPlayerCharacter(characterSeed);
    }
    for (const joinerSeed of joinerSeeds) {
      setCampaignWizardStatus(`Adding ${joinerSeed.name || "party member"}...`, "working");
      await seedWizardStartingPartyMember(joinerSeed);
    }
    setCampaignWizardStatus("Opening friend seats...", "working");
    const remoteInviteLobby = await openRemoteInviteLobbyForNewCampaign([characterSeed, ...joinerSeeds]);

    seedPlayLog();
    render();
    state.campaignWizardReturnHome = false;
    elements.campaignDialog.close();
    elements.campaignForm.reset();
    resetCampaignWizardDefaults();
    elements.bridgeStatus.textContent = "Table set";
    setCampaignWizardStatus("Table set.", "idle");
    setCampaignWizardBusy(false);
    elements.playerInput.value = "";
    renderInputComposer();
    if (remoteInviteLobby?.link) {
      setProviderActivity(
        remoteInviteLobby.copied
          ? "Guest link copied; friend seats are open."
          : "Friend seats are open; copy the Guest Link from Friends.",
        remoteInviteLobby.copied ? "idle" : "waiting",
      );
    } else {
      setProviderActivity("Table set. Invite friends or press Start Adventure when everyone is seated.", "idle");
    }
  } catch (error) {
    render();
    const message = error instanceof Error ? error.message : "Unknown error";
    elements.bridgeStatus.textContent = `Could not set the table: ${message}`;
    setCampaignWizardStatus(`Could not set table: ${message}`, "error");
    setCampaignWizardBusy(false);
    setProviderActivity(`Could not set the table: ${message}`, "error");
  }
}

async function openRemoteInviteLobbyForNewCampaign(seeds = []) {
  if (!seeds.some((seed) => normalizeWizardControllerKind(seed?.controllerKind) === "remote_invite")) {
    return null;
  }
  try {
    if (!state.campaign?.multiplayer?.localTable?.running) {
      const started = await startLocalTableFromUi();
      if (!started) {
        return null;
      }
    }
    await adoptPreTableLobbyIntoActiveCampaign();
    const link = currentLocalGuestLink();
    if (!link) {
      return null;
    }
    showGuestLink(link);
    const copied = await writeClipboardText(link);
    return { link, copied };
  } catch (error) {
    pushDiagnosticsEvent("remote_invite_lobby_open_failed", {
      message: error instanceof Error ? error.message : "Friend seats did not open.",
    });
    setProviderActivity(error instanceof Error ? `Friend seats failed: ${error.message}` : "Friend seats failed", "error");
    return null;
  }
}

async function adoptPreTableLobbyIntoActiveCampaign() {
  try {
    const result = await postJson(apiPreTableLobbyAdoptActiveUrl, localTableAuthorityPayload());
    setCampaignFromPayload(result, "pretable_lobby_adopted");
    state.multiplayerSnapshot = result.multiplayer;
    return result;
  } catch (error) {
    pushDiagnosticsEvent("pretable_lobby_adopt_failed", {
      message: error instanceof Error ? error.message : "Pre-table lobby guests were not adopted.",
    });
    return null;
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

function openCampaignDialog({ returnToMainMenu = false } = {}) {
  resetCampaignWizardDefaults();
  state.campaignWizardReturnHome = Boolean(returnToMainMenu);
  openCampaignWizardWorkspace();
  bindAdventureSeedPresetAction();
  elements.campaignDialog.showModal();
  schedulePreTableLobbyPublish({ immediate: true });
  elements.newCampaignTitle.focus();
  elements.newCampaignTitle.select();
}

function dismissCampaignWizard() {
  const shouldReturnHome = state.campaignWizardReturnHome;
  elements.campaignDialog.close();
  if (shouldReturnHome) {
    returnToMainMenu();
  }
}

function openCampaignWizardWorkspace() {
  elements.app?.classList.add("campaign-wizard-mode");
  schedulePreTableLobbyPublish({ immediate: true });
  startPreTableLobbyPolling();
}

function closeCampaignWizardWorkspace() {
  elements.app?.classList.remove("campaign-wizard-mode");
  stopPreTableLobbyPolling();
  closePreTableLobby();
}

function schedulePreTableLobbyPublish({ immediate = false } = {}) {
  if (!elements.campaignDialog?.open || clientMode) {
    return;
  }
  clearTimeout(preTableLobbyPublishTimer);
  const run = () => {
    preTableLobbyPublishTimer = null;
    publishPreTableLobbyFromWizard();
  };
  if (immediate) {
    run();
    return;
  }
  preTableLobbyPublishTimer = setTimeout(run, 350);
}

async function publishPreTableLobbyFromWizard() {
  if (!elements.campaignDialog?.open || clientMode) {
    return null;
  }
  const payload = preTableLobbyPayloadFromWizard();
  try {
    const result = await postJson(apiPreTableLobbyPublishUrl, payload);
    renderPreTableLobby(result);
    return result;
  } catch (error) {
    if (elements.preTableWaitingGuests) {
      elements.preTableWaitingGuests.textContent = error instanceof Error ? error.message : "Guest lobby is not available.";
    }
    return null;
  }
}

function startPreTableLobbyPolling() {
  stopPreTableLobbyPolling();
  preTableLobbyHostPollTimer = setInterval(() => {
    refreshPreTableLobbyHostSnapshot();
  }, preTableLobbyPollIntervalMs);
}

function stopPreTableLobbyPolling() {
  if (preTableLobbyHostPollTimer) {
    clearInterval(preTableLobbyHostPollTimer);
    preTableLobbyHostPollTimer = null;
  }
}

async function refreshPreTableLobbyHostSnapshot() {
  if (!elements.campaignDialog?.open || clientMode) {
    return null;
  }
  try {
    const snapshot = await fetchJson(apiPreTableLobbyHostSnapshotUrl);
    if (snapshot.open) {
      renderPreTableLobby(snapshot);
    }
    return snapshot;
  } catch {
    return null;
  }
}

function preTableLobbyPayloadFromWizard() {
  const primary = compactCharacterSeedFromRefs(compactCharacterFormRefs("new-character"));
  const party = [primary, ...collectWizardAdditionalCharacters()]
    .filter((member) => [member.name, member.ancestry, member.characterClass, member.concept].some((value) => String(value ?? "").trim()))
    .map((member) => ({
      id: member.name ? `party-${slugify(member.name)}` : "",
      name: member.name,
      ancestry: member.ancestry,
      characterClass: member.characterClass,
      level: member.level,
      concept: member.concept,
      controllerKind: member.controllerKind,
      inviteIntent: normalizeWizardControllerKind(member.controllerKind) === "remote_invite" ? "remote_player" : "",
    }));
  return {
    draftId: `draft-${slugify(elements.newCampaignTitle?.value || "new-campaign")}`,
    title: elements.newCampaignTitle?.value || "New Campaign",
    premise: elements.newCampaignPremise?.value || "",
    startingLocation: elements.newCampaignStartingLocation?.value || "",
    tone: elements.newCampaignTone?.value || "",
    party,
  };
}

function renderPreTableLobby(snapshot = {}) {
  if (elements.preTableLobbyPanel) {
    elements.preTableLobbyPanel.hidden = false;
  }
  if (elements.preTableGuestLink) {
    elements.preTableGuestLink.value = snapshot.guestLink || "";
  }
  if (!elements.preTableWaitingGuests) {
    return;
  }
  const guests = Array.isArray(snapshot.waitingGuests) ? snapshot.waitingGuests : [];
  const joinableSeats = Array.isArray(snapshot.joinableSeats) ? snapshot.joinableSeats : [];
  const seats = new Map(joinableSeats.map((seat) => [seat.id, seat.name]));
  if (!guests.length) {
    elements.preTableWaitingGuests.textContent = snapshot.joinableSeats?.length
      ? "No guests waiting yet."
      : "No friend seats yet.";
    return;
  }
  elements.preTableWaitingGuests.replaceChildren(...guests.map((guest) => {
    const row = document.createElement("div");
    row.className = "pretable-waiting-guest";
    const seatName = seats.get(guest.preferredPartyMemberId) || "a seat";
    const text = document.createElement("span");
    text.textContent = guest.status === "seated"
      ? `${guest.displayName || "Guest"} is seated as ${seatName}.`
      : `${guest.displayName || "Guest"} requested ${seatName}.`;
    row.append(text);
    const proposal = guest.proposedCharacter ?? {};
    const proposalLine = [proposal.name, proposal.ancestry, proposal.characterClass]
      .filter(Boolean)
      .join(" - ");
    if (proposalLine || proposal.roleIntent) {
      const proposalDetail = document.createElement("small");
      proposalDetail.textContent = proposalLine
        ? `Bringing: ${proposalLine}${proposal.roleIntent ? ` (${proposal.roleIntent})` : ""}`
        : `Bringing: ${proposal.roleIntent}`;
      row.append(proposalDetail);
    }
    if (guest.status !== "seated" && joinableSeats.length) {
      const actions = document.createElement("div");
      actions.className = "pretable-seat-actions";
      const preferredSeat = guest.preferredPartyMemberId
        ? joinableSeats.find((seat) => seat.id === guest.preferredPartyMemberId)
        : null;
      const seatOptions = preferredSeat
        ? [preferredSeat, ...joinableSeats.filter((seat) => seat.id !== preferredSeat.id)]
        : joinableSeats;
      for (const seat of seatOptions.slice(0, 4)) {
        const seatButton = document.createElement("button");
        seatButton.type = "button";
        seatButton.className = "mini-action";
        seatButton.textContent = `Seat as ${seat.name || "Friend"}`;
        seatButton.addEventListener("click", () => {
          seatPreTableWaitingGuest(guest.id, seat.id);
        });
        actions.append(seatButton);
      }
      row.append(actions);
    }
    return row;
  }));
}

async function seatPreTableWaitingGuest(waitingGuestId, partyMemberId) {
  try {
    const snapshot = await postJson(apiPreTableLobbySeatUrl, {
      waitingGuestId,
      partyMemberId,
    });
    renderPreTableLobby(snapshot);
    const guest = snapshot.waitingGuests?.find((item) => item.id === waitingGuestId);
    const seat = snapshot.joinableSeats?.find((item) => item.id === partyMemberId);
    setProviderActivity(`${guest?.displayName || "Guest"} seated${seat?.name ? ` as ${seat.name}` : ""} for launch`, "idle");
  } catch (error) {
    setProviderActivity(error instanceof Error ? `Seat guest failed: ${error.message}` : "Seat guest failed", "error");
  }
}

async function closePreTableLobby() {
  clearTimeout(preTableLobbyPublishTimer);
  preTableLobbyPublishTimer = null;
  if (elements.preTableLobbyPanel) {
    elements.preTableLobbyPanel.hidden = true;
  }
  try {
    await postJson(apiPreTableLobbyCloseUrl, {});
  } catch {
    // Draft lobby state is best-effort; it is not canon.
  }
}

async function copyPreTableGuestLinkFromUi() {
  const snapshot = await publishPreTableLobbyFromWizard();
  const link = snapshot?.guestLink || elements.preTableGuestLink?.value || currentLocalGuestLink();
  if (!link) {
    setProviderActivity("Guest link is not ready yet", "waiting");
    return false;
  }
  const copied = await writeClipboardText(link);
  setProviderActivity(copied ? "Guest link copied" : "Guest link ready in Host New", copied ? "idle" : "waiting");
  return copied;
}

function resetCampaignWizardDefaults() {
  bindAdventureSeedPresetAction();
  elements.newCampaignTitle.value = "";
  elements.newCampaignPremise.value = "";
  elements.newCampaignStartingLocation.value = "";
  elements.newCampaignTone.value = "";
  elements.newCharacterName.value = "";
  elements.newCharacterAncestry.value = "";
  elements.newCharacterClass.value = "";
  elements.newCharacterLevel.value = "1";
  elements.newCharacterConcept.value = "";
  elements.newCharacterAutoSheet.checked = true;
  setRadioValue("new-character-controller", "host");
  if (elements.newJoinerName) {
    [...(elements.wizardAdditionalCharacters?.querySelectorAll("[data-wizard-character-card]") ?? [])]
      .slice(1)
      .forEach((card) => card.remove());
    renumberWizardPartyMemberCards();
    elements.newJoinerName.value = "";
    elements.newJoinerAncestry.value = "";
    elements.newJoinerClass.value = "";
    elements.newJoinerLevel.value = "1";
    elements.newJoinerConcept.value = "";
    elements.newJoinerIntegration.value = "";
    elements.newJoinerHostContext.value = "";
    elements.newJoinerAutoSheet.checked = true;
    setWizardControllerKind(elements.wizardAdditionalCharacters?.querySelector("[data-wizard-character-card]"), "ai_companion");
  }
}

function applyAdventureSeedPreset(seed) {
  elements.newCampaignTitle.value = seed.title;
  elements.newCampaignPremise.value = seed.premise;
  elements.newCampaignStartingLocation.value = seed.startingLocation;
  elements.newCampaignTone.value = seed.tone;
  elements.newCharacterName.value = seed.playerCharacter.name;
  elements.newCharacterAncestry.value = seed.playerCharacter.ancestry;
  elements.newCharacterClass.value = seed.playerCharacter.characterClass;
  elements.newCharacterLevel.value = seed.playerCharacter.level;
  elements.newCharacterConcept.value = seed.playerCharacter.concept;
  elements.newCharacterAutoSheet.checked = seed.playerCharacter.autoSheet !== false;
  setRadioValue("new-character-controller", seed.playerCharacter.controllerKind || "host");
  setProviderActivity("Example filled; review or start the adventure", "idle");
  elements.newCampaignTitle.focus();
  elements.newCampaignTitle.select();
}

function bindAdventureSeedPresetAction(root = elements.campaignDialog ?? document) {
  const button = root?.querySelector?.("[data-adventure-seed-preset]");
  if (!button || adventureSeedPresetButtons.has(button)) {
    return;
  }
  adventureSeedPresetButtons.add(button);
  button.addEventListener("click", () => {
    applyAdventureSeedPreset(randomAdventureSeedPreset());
    schedulePreTableLobbyPublish({ immediate: true });
  });
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
    return result;
  } catch (error) {
    setProviderActivity(error instanceof Error ? `Local table failed: ${error.message}` : "Local table failed", "error");
    return null;
  }
}

async function stopLocalTableFromUi() {
  try {
    setProviderActivity("Stopping local table...", "working");
    const result = await postJson(apiMultiplayerStopUrl, localTableAuthorityPayload());
    setCampaignFromPayload(result, "local_table_stopped");
    state.multiplayerSnapshot = result.multiplayer;
    render();
    setProviderActivity("Local table stopped", "idle");
  } catch (error) {
    setProviderActivity(error instanceof Error ? `Stop failed: ${error.message}` : "Stop failed", "error");
  }
}

async function saveGuestActionSettings() {
  if (!elements.requireGuestActionApproval && !elements.holdGuestActionsForGroup) {
    return;
  }
  const requireGuestActionApproval = Boolean(elements.requireGuestActionApproval?.checked);
  const holdGuestActionsForGroupInput = !requireGuestActionApproval && Boolean(elements.holdGuestActionsForGroup?.checked);
  try {
    const result = await postJson(apiMultiplayerSettingsUrl, {
      requireGuestActionApproval,
      holdGuestActionsForGroupInput,
      ...localTableAuthorityPayload(),
    });
    setCampaignFromPayload(result, "local_table_settings_updated");
    state.multiplayerSnapshot = result.multiplayer;
    render();
    setProviderActivity(
      requireGuestActionApproval
        ? "Friend actions now wait for your review"
        : holdGuestActionsForGroupInput
          ? "Friend actions now collect into a group turn"
          : "Friend actions now reach the table one at a time",
      "idle",
    );
  } catch (error) {
    elements.requireGuestActionApproval.checked = Boolean(state.campaign?.multiplayer?.settings?.requireGuestActionApproval);
    if (elements.holdGuestActionsForGroup) {
      elements.holdGuestActionsForGroup.checked = Boolean(state.campaign?.multiplayer?.settings?.holdGuestActionsForGroupInput);
    }
    setProviderActivity(error instanceof Error ? `Table setting failed: ${error.message}` : "Table setting failed", "error");
  }
}

async function createInviteForMember(member) {
  try {
    if (!state.campaign.multiplayer?.localTable?.running) {
      await startLocalTableFromUi();
    }
    const result = await postJson(apiMultiplayerInviteUrl, {
      partyMemberId: member.id,
      ...localTableAuthorityPayload(),
    });
    setCampaignFromPayload(result, "local_table_invite_created");
    state.multiplayerSnapshot = result.multiplayer;
    render();
    await publishInviteLink(result.inviteLink, {
      copiedMessage: `Invite link copied for ${member.name}`,
      visibleMessage: `Invite ready for ${member.name}; copy it from Table Options.`,
    });
  } catch (error) {
    setProviderActivity(error instanceof Error ? `Invite failed: ${error.message}` : "Invite failed", "error");
  }
}

async function createCharacterRequestInviteFromUi() {
  try {
    if (!state.campaign?.multiplayer?.localTable?.running) {
      await startLocalTableFromUi();
    }
    const result = await postJson(apiMultiplayerInviteCharacterUrl, localTableAuthorityPayload());
    setCampaignFromPayload(result, "local_table_character_invite_created");
    state.multiplayerSnapshot = result.multiplayer;
    render();
    await publishInviteLink(result.inviteLink, {
      copiedMessage: "New character invite copied",
      visibleMessage: "New character invite ready; copy it from Table Options.",
    });
  } catch (error) {
    setProviderActivity(error instanceof Error ? `Join-as invite failed: ${error.message}` : "Join-as invite failed", "error");
  }
}

async function copyGuestLinkFromUi() {
  try {
    if (!state.campaign?.multiplayer?.localTable?.running) {
      const result = await startLocalTableFromUi();
      if (!result) {
        return false;
      }
    }
    const link = currentLocalGuestLink();
    if (!link) {
      throw new Error("The guest page is not ready yet.");
    }
    showGuestLink(link);
    const copied = await writeClipboardText(link);
    if (copied) {
      setProviderActivity("Guest link copied", "idle");
      return true;
    }
    revealGuestLink();
    setProviderActivity("Guest page ready; copy it from Table Options.", "waiting");
    return false;
  } catch (error) {
    setProviderActivity(error instanceof Error ? `Guest link failed: ${error.message}` : "Guest link failed", "error");
    return false;
  }
}

function currentLocalGuestLink() {
  const table = state.campaign?.multiplayer?.localTable ?? state.multiplayerSnapshot?.localTable ?? {};
  if (!table.running) {
    return "";
  }
  const host = table.lanAddress || window.location.hostname || "127.0.0.1";
  const port = table.port || window.location.port;
  return port ? `http://${host}:${port}/guest` : `http://${host}/guest`;
}

function localTableAuthorityPayload(overrides = {}) {
  const table = state.campaign?.multiplayer?.localTable ?? state.multiplayerSnapshot?.localTable ?? {};
  return {
    campaignId: state.campaign?.id || state.multiplayerSnapshot?.campaignId || "",
    tableId: table.tableId || "",
    sessionId: table.sessionId || "",
    ...overrides,
  };
}

function guestTableAuthorityPayload(overrides = {}) {
  return {
    campaignId: state.guestSession?.campaignId || state.waitingRoomSession?.campaignId || "",
    tableId: state.guestSession?.tableId || state.waitingRoomSession?.tableId || "",
    sessionId: state.guestSession?.sessionId || state.waitingRoomSession?.sessionId || "",
    ...overrides,
  };
}

function showGuestLink(link) {
  if (!elements.localTableGuestLink) {
    return;
  }
  elements.localTableGuestLink.value = link;
}

function revealGuestLink() {
  if (!elements.localTableGuestLink) {
    return;
  }
  if (elements.setupDialog && !elements.setupDialog.open) {
    try {
      elements.setupDialog.showModal();
      if (!clientMode) {
        refreshProviderStatus({ quiet: true });
      }
    } catch {
      // The field is still filled when the setup dialog can be opened later.
    }
  }
  try {
    elements.localTableGuestLink.focus();
    elements.localTableGuestLink.select();
  } catch {
    // Selection is only a convenience.
  }
}

async function publishInviteLink(inviteLink, { copiedMessage, visibleMessage } = {}) {
  const link = String(inviteLink ?? "").trim();
  if (!link) {
    throw new Error("Host did not return an invite link.");
  }
  showInviteLink(link);
  const copied = await writeClipboardText(link);
  if (copied) {
    setProviderActivity(copiedMessage || "Invite link copied", "idle");
    return true;
  }
  revealInviteLink();
    setProviderActivity(visibleMessage || "Invite link ready; copy it from Table Options.", "waiting");
  return false;
}

function showInviteLink(inviteLink) {
  if (!elements.localTableInviteOutput) {
    return;
  }
  elements.localTableInviteOutput.value = inviteLink;
  elements.localTableInviteOutput.hidden = false;
}

function revealInviteLink() {
  if (!elements.localTableInviteOutput) {
    return;
  }
  if (elements.setupDialog && !elements.setupDialog.open) {
    try {
      elements.setupDialog.showModal();
      if (!clientMode) {
        refreshProviderStatus({ quiet: true });
      }
    } catch {
      // The invite is still visible in the setup dialog when it can be opened.
    }
  }
  elements.localTableInviteOutput.hidden = false;
  try {
    elements.localTableInviteOutput.focus();
    elements.localTableInviteOutput.select();
  } catch {
    // Selection is a convenience; never fail invite creation because of focus.
  }
}

async function writeClipboardText(text) {
  const result = await writeTextWithFallback(text, {
    desktopWriteText: window.lorekeeperDesktop?.writeClipboardText,
    browserWriteText: navigator.clipboard?.writeText?.bind(navigator.clipboard),
  });
  return result.copied;
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
      ...localTableAuthorityPayload(),
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
  if (elements.joinClientInviteLink?.value) {
    elements.joinInviteLink.value = elements.joinClientInviteLink.value;
  }
  if (elements.joinClientPlayerName?.value) {
    elements.joinPlayerName.value = elements.joinClientPlayerName.value;
  }
  copyJoinClientCharacterToDialog();
  elements.joinStatus.textContent = "Paste an invite link from the host.";
  renderJoinPreview(null, elements.joinPreview);
  elements.joinCampaignDialog.showModal();
  if (elements.joinInviteLink?.value) {
    scheduleJoinPreview(elements.joinInviteLink.value, "dialog", { immediate: true });
  }
  elements.joinInviteLink.focus();
}

async function requestJoinFromUi() {
  await requestJoinWithValues({
    inviteLink: elements.joinInviteLink.value,
    playerName: elements.joinPlayerName.value,
    proposedCharacter: joinDialogCharacterProposal(),
    statusElement: elements.joinStatus,
    submitButton: null,
  });
}

async function requestJoinFromJoinClientPanel() {
  await requestJoinWithValues({
    inviteLink: elements.joinClientInviteLink?.value,
    playerName: elements.joinClientPlayerName?.value,
    proposedCharacter: joinClientCharacterProposal(),
    statusElement: elements.joinClientStatus,
    submitButton: elements.joinClientSubmit,
  });
}

function joinClientCharacterProposal() {
  return {
    name: elements.joinClientCharacterName?.value,
    ancestry: elements.joinClientCharacterAncestry?.value,
    characterClass: elements.joinClientCharacterClass?.value,
    level: elements.joinClientCharacterLevel?.value,
    roleIntent: elements.joinClientCharacterRole?.value,
    appearance: elements.joinClientCharacterAppearance?.value,
    backstory: elements.joinClientCharacterBackstory?.value,
    integrationPrompt: elements.joinClientCharacterIntegration?.value,
  };
}

async function refreshGuestLobbyPreview({ quiet = false } = {}) {
  if (!guestWaitingRoomMode) {
    return null;
  }
  try {
    const hostBaseUrl = window.location.origin;
    const url = new URL(`${hostBaseUrl}${apiMultiplayerJoinPreviewUrl}`);
    const preview = await fetchJson(url.toString());
    state.guestLobbyPreview = preview;
    const seats = preview.joinableSeats ?? [];
    if (state.selectedGuestSeatId && !seats.some((seat) => seat.id === state.selectedGuestSeatId)) {
      state.selectedGuestSeatId = "";
    }
    renderGuestLobbyPreview();
    return preview;
  } catch (error) {
    state.guestLobbyPreview = {
      error: error instanceof Error ? error.message : "Could not read the host table.",
    };
    renderGuestLobbyPreview();
    if (!quiet) {
      setProviderActivity(state.guestLobbyPreview.error, "error");
    }
    return null;
  }
}

function renderGuestLobbyPreview() {
  if (!guestWaitingRoomMode) {
    return;
  }
  if (elements.guestTablePreview) {
    renderJoinPreview(state.guestLobbyPreview, elements.guestTablePreview, {
      emptyText: "Looking for the host table...",
      seatHint: false,
    });
  }
  if (!elements.guestSeatList) {
    return;
  }
  const preview = state.guestLobbyPreview;
  const seats = Array.isArray(preview?.joinableSeats) ? preview.joinableSeats : [];
  elements.guestSeatList.hidden = false;
  if (preview?.error) {
    elements.guestSeatList.replaceChildren();
    return;
  }
  const heading = document.createElement("div");
  heading.className = "guest-seat-list-heading";
  heading.textContent = seats.length ? "Choose a character seat to request" : "No open character seats right now";
  const rows = seats.map((seat) => guestSeatButton(seat));
  const hint = document.createElement("p");
  hint.className = "guest-seat-list-hint";
  hint.textContent = seats.length
    ? "The host will approve the final seat assignment."
    : "Ask the host to mark an AI or invite character as available.";
  elements.guestSeatList.replaceChildren(heading, ...rows, hint);
}

function guestSeatButton(seat) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "guest-seat-button";
  button.dataset.guestSeatId = seat.id;
  button.classList.toggle("selected", state.selectedGuestSeatId === seat.id);

  const title = document.createElement("span");
  title.className = "guest-seat-name";
  title.textContent = seat.name || "Unnamed character";
  const detail = document.createElement("span");
  detail.className = "guest-seat-detail";
  detail.textContent = [
    seat.ancestryClass,
    seat.playerRole,
    seat.role,
    seat.level ? `Level ${seat.level}` : "",
  ].filter(Boolean).join(" / ") || "Available party member";
  button.replaceChildren(title, detail);
  return button;
}

async function registerGuestWaitingRoom() {
  const playerName = String(elements.guestWaitingPlayerName?.value ?? "").trim();
  if (!playerName) {
    if (elements.guestWaitingStatus) {
      elements.guestWaitingStatus.textContent = "Enter the name the host should see at the table.";
    }
    return;
  }
  try {
    if (elements.guestWaitingRegister) {
      elements.guestWaitingRegister.disabled = true;
    }
    const clientId = guestClientId();
    const hostBaseUrl = window.location.origin;
    const result = await postJson(`${hostBaseUrl}${apiMultiplayerWaitingRegisterUrl}`, {
      playerName,
      clientId,
      preferredPartyMemberId: state.selectedGuestSeatId || "",
      proposedCharacter: joinClientCharacterProposal(),
    });
    saveWaitingRoomSession({
      hostBaseUrl,
      clientId,
      waitingGuestId: result.waitingGuest?.id,
      waitingSecret: result.waitingSecret || "",
      campaignId: result.campaignId || "",
      tableId: result.localTable?.tableId || "",
      sessionId: result.localTable?.sessionId || "",
      preferredPartyMemberId: result.waitingGuest?.preferredPartyMemberId || state.selectedGuestSeatId || "",
      playerName,
      campaignTitle: result.campaignTitle || "",
      status: "waiting",
      savedAt: new Date().toISOString(),
    });
    if (elements.guestWaitingStatus) {
      elements.guestWaitingStatus.textContent = "You are in the waiting room. The host can seat you now.";
    }
    setProviderActivity("Waiting for the host to seat you.", "waiting");
    await refreshWaitingRoomStatus({ explicit: true });
  } catch (error) {
    if (elements.guestWaitingStatus) {
      elements.guestWaitingStatus.textContent = error instanceof Error ? error.message : "Could not join the waiting room.";
    }
    setProviderActivity(error instanceof Error ? error.message : "Could not join the waiting room.", "error");
  } finally {
    if (elements.guestWaitingRegister) {
      elements.guestWaitingRegister.disabled = false;
    }
  }
}

async function refreshWaitingRoomStatus({ explicit = false } = {}) {
  const session = state.waitingRoomSession;
  if (!session?.hostBaseUrl || !session?.waitingGuestId) {
    return null;
  }
  const url = new URL(`${session.hostBaseUrl}${apiMultiplayerWaitingStatusUrl}`);
  url.searchParams.set("waitingGuestId", session.waitingGuestId);
  url.searchParams.set("clientId", session.clientId || guestClientId());
  url.searchParams.set("waitingSecret", session.waitingSecret || "");
  if (session.campaignId) {
    url.searchParams.set("campaignId", session.campaignId);
  }
  if (session.tableId) {
    url.searchParams.set("tableId", session.tableId);
  }
  if (session.sessionId) {
    url.searchParams.set("sessionId", session.sessionId);
  }
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  const status = await response.json();
  if (status.seated && status.connection && status.connectionSecret) {
    const guestSession = {
      inviteLink: "",
      hostBaseUrl: session.hostBaseUrl,
      connectionId: status.connection.id,
      clientId: session.clientId || guestClientId(),
      connectionSecret: status.connectionSecret,
      campaignId: status.campaignId,
      tableId: status.localTable?.tableId || status.connection.tableId || session.tableId || "",
      sessionId: status.localTable?.sessionId || status.connection.sessionId || session.sessionId || "",
      partyMemberId: status.connection.partyMemberId,
      playerName: status.connection.displayName || session.playerName || "",
      status: "connected",
      savedAt: new Date().toISOString(),
    };
    saveGuestSession(guestSession);
    clearWaitingRoomSession();
    renderGuestSnapshot(status.snapshot);
    setProviderActivity(`You are seated as ${status.snapshot?.assignedCharacter?.name || "a party member"}.`, "idle");
    return status;
  }
  saveWaitingRoomSession({
    ...session,
    campaignTitle: status.campaignTitle || session.campaignTitle || "",
    status: status.waitingGuest?.status || "waiting",
    savedAt: new Date().toISOString(),
  });
  if (elements.guestWaitingStatus) {
    if (status.reservedSeat?.name || status.waitingGuest?.status === "seated") {
      elements.guestWaitingStatus.textContent = `Seat reserved${status.reservedSeat?.name ? ` as ${status.reservedSeat.name}` : ""}. Waiting for the host to start the table.`;
    } else {
      elements.guestWaitingStatus.textContent = explicit
        ? "Still waiting for the host to choose your seat."
        : "Waiting for the host to choose your seat.";
    }
  }
  return status;
}

function copyJoinClientCharacterToDialog() {
  const pairs = [
    [elements.joinCharacterName, elements.joinClientCharacterName],
    [elements.joinCharacterAncestry, elements.joinClientCharacterAncestry],
    [elements.joinCharacterClass, elements.joinClientCharacterClass],
    [elements.joinCharacterLevel, elements.joinClientCharacterLevel],
    [elements.joinCharacterRole, elements.joinClientCharacterRole],
    [elements.joinCharacterAppearance, elements.joinClientCharacterAppearance],
    [elements.joinCharacterBackstory, elements.joinClientCharacterBackstory],
    [elements.joinCharacterIntegration, elements.joinClientCharacterIntegration],
  ];
  for (const [target, source] of pairs) {
    if (target && source?.value) {
      target.value = source.value;
    }
  }
}

function joinDialogCharacterProposal() {
  return {
    name: elements.joinCharacterName?.value,
    ancestry: elements.joinCharacterAncestry?.value,
    characterClass: elements.joinCharacterClass?.value,
    level: elements.joinCharacterLevel?.value,
    roleIntent: elements.joinCharacterRole?.value,
    appearance: elements.joinCharacterAppearance?.value,
    backstory: elements.joinCharacterBackstory?.value,
    integrationPrompt: elements.joinCharacterIntegration?.value,
  };
}

function hasJoinCharacterProposal(proposal = {}) {
  return Object.values(proposal ?? {}).some((value) => String(value ?? "").trim());
}

function scheduleJoinPreview(inviteLink, target = "join", options = {}) {
  if (state.joinPreviewTimer) {
    window.clearTimeout(state.joinPreviewTimer);
  }
  const previewTarget = target === "dialog" ? "dialog" : "join";
  const run = () => refreshJoinPreview(inviteLink, previewTarget);
  if (options.immediate) {
    run();
    return;
  }
  state.joinPreviewTimer = window.setTimeout(run, 250);
}

async function refreshJoinPreview(inviteLink, target = "join") {
  const previewTarget = target === "dialog" ? "dialog" : "join";
  const previewElement = previewTarget === "dialog" ? elements.joinPreview : elements.joinClientPreview;
  const text = String(inviteLink ?? "").trim();
  if (!previewElement) {
    return;
  }
  if (!text) {
    renderJoinPreview(null, previewElement);
    return;
  }
  const parsed = parseInviteLinkForClient(text);
  if (!parsed.valid) {
    renderJoinPreview({ error: parsed.error }, previewElement);
    return;
  }
  try {
    renderJoinPreview({ loading: true }, previewElement);
    const baseUrl = `http://${parsed.host}:${parsed.port}`;
    const url = new URL(`${baseUrl}${apiMultiplayerJoinPreviewUrl}`);
    url.searchParams.set("inviteLink", text);
    const preview = await fetchJson(url.toString());
    renderJoinPreview(preview, previewElement);
    if (previewTarget === "join" && elements.joinInviteLink?.value === text) {
      renderJoinPreview(preview, elements.joinPreview);
    }
    if (previewTarget === "dialog" && elements.joinClientInviteLink?.value === text) {
      renderJoinPreview(preview, elements.joinClientPreview);
    }
  } catch (error) {
    renderJoinPreview({
      error: error instanceof Error ? error.message : "Could not preview this table.",
    }, previewElement);
  }
}

function renderJoinPreview(preview, container, options = {}) {
  if (!container) {
    return;
  }
  container.hidden = false;
  if (!preview) {
    const empty = document.createElement("p");
    empty.className = "join-preview-empty";
    empty.textContent = options.emptyText || "Paste a host invite link to preview the table.";
    container.replaceChildren(empty);
    return;
  }
  if (preview.loading) {
    const loading = document.createElement("p");
    loading.className = "join-preview-empty";
    loading.textContent = "Checking the host table...";
    container.replaceChildren(loading);
    return;
  }
  if (preview.error) {
    const error = document.createElement("p");
    error.className = "join-preview-empty error";
    error.textContent = preview.error;
    container.replaceChildren(error);
    return;
  }

  const projection = buildJoinPreviewProjection(preview, {
    seatHint: options.seatHint !== false,
  });
  const title = document.createElement("h3");
  title.textContent = projection.title;
  const copy = document.createElement("p");
  copy.textContent = projection.summary;

  const facts = document.createElement("div");
  facts.className = "join-preview-facts";
  facts.replaceChildren(...projection.facts.map(joinPreviewPill));

  const hint = document.createElement("p");
  hint.className = "join-preview-hint";
  hint.textContent = projection.hint;

  const children = [title, copy, facts];
  if (projection.hint) {
    children.push(hint);
  }
  container.replaceChildren(...children);
}

function joinPreviewPill(text) {
  const pill = document.createElement("span");
  pill.textContent = text;
  return pill;
}

async function requestJoinWithValues({ inviteLink, playerName, proposedCharacter = null, statusElement, submitButton } = {}) {
  try {
    const trimmedInviteLink = String(inviteLink ?? "").trim();
    const parsed = parseInviteLinkForClient(trimmedInviteLink);
    if (!parsed.valid) {
      throw new Error(parsed.error);
    }
    const trimmedPlayerName = String(playerName ?? "").trim();
    const normalizedProposal = hasJoinCharacterProposal(proposedCharacter)
      ? proposedCharacter
      : parsed.seat === "new-character"
        ? { name: trimmedPlayerName }
        : null;
    if (!trimmedPlayerName && !String(normalizedProposal?.name ?? "").trim()) {
      throw new Error("Enter the name the host should see at the table.");
    }
    const clientId = guestClientId();
    if (submitButton) {
      submitButton.disabled = true;
    }
    if (statusElement) {
      statusElement.textContent = "Requesting a seat...";
    }
    const baseUrl = `http://${parsed.host}:${parsed.port}`;
    const result = await postJson(`${baseUrl}${apiMultiplayerJoinUrl}`, {
      inviteLink: trimmedInviteLink,
      playerName: trimmedPlayerName || String(normalizedProposal?.name ?? "").trim() || "Guest Player",
      clientId,
      proposedCharacter: normalizedProposal,
    });
    state.guestSession = {
      hostBaseUrl: baseUrl,
      inviteLink: trimmedInviteLink,
      clientId,
      connectionId: result.connection.id,
      connectionSecret: result.connectionSecret || "",
      playerId: result.player.id,
      playerName: result.player.displayName,
      partyMemberId: result.connection.partyMemberId,
      campaignId: parsed.campaign,
      tableId: parsed.tableId || result.connection.tableId || result.snapshot?.localTable?.tableId || "",
      sessionId: parsed.sessionId || result.connection.sessionId || result.snapshot?.localTable?.sessionId || "",
      status: result.connection.status,
      lastRevision: result.snapshot?.revision ?? result.snapshot?.tableState?.revision ?? "",
    };
    saveGuestSession(state.guestSession);
    const requestedCharacterName = String(normalizedProposal?.name ?? "").trim();
    const assignedName = result.snapshot?.assignedCharacter?.name || result.connection?.proposedCharacter?.name || requestedCharacterName;
    const statusText = result.approved
      ? `Joined${assignedName ? ` as ${assignedName}` : ""}. You can submit actions for your assigned character.`
      : `Seat request sent${assignedName ? ` for ${assignedName}` : ""}. Waiting for your friend.`;
    if (statusElement) {
      statusElement.textContent = statusText;
    }
    elements.joinStatus.textContent = statusText;
    if (elements.joinClientStatus) {
      elements.joinClientStatus.textContent = statusText;
    }
    setProviderActivity(statusText, result.approved ? "idle" : "waiting");
    if (result.snapshot) {
      renderGuestSnapshot(result.snapshot);
    } else {
      await refreshGuestSnapshot({ explicit: false });
    }
  } catch (error) {
    const errorText = error instanceof Error ? error.message : "Join failed";
    if (statusElement) {
      statusElement.textContent = errorText;
    }
    elements.joinStatus.textContent = errorText;
    if (elements.joinClientStatus) {
      elements.joinClientStatus.textContent = errorText;
    }
    setProviderActivity(`Join failed: ${errorText}`, "error");
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
    }
  }
}

async function approveGuest(connectionId, hostIntegrationPrompt = "") {
  try {
    const result = await postJson(apiMultiplayerApproveUrl, {
      connectionId,
      hostIntegrationPrompt,
      ...localTableAuthorityPayload(),
    });
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
    const result = await postJson(apiMultiplayerDenyUrl, {
      connectionId,
      ...localTableAuthorityPayload(),
    });
    setCampaignFromPayload(result, "local_table_join_denied");
    state.multiplayerSnapshot = result.multiplayer;
    render();
    setProviderActivity("Guest denied", "idle");
  } catch (error) {
    setProviderActivity(error instanceof Error ? `Deny failed: ${error.message}` : "Deny failed", "error");
  }
}

async function seatWaitingGuestAtTable(waitingGuestId, partyMemberId) {
  try {
    const result = await postJson(apiMultiplayerWaitingSeatUrl, {
      waitingGuestId,
      partyMemberId,
      ...localTableAuthorityPayload(),
    });
    setCampaignFromPayload(result, "local_table_waiting_guest_seated");
    state.multiplayerSnapshot = result.multiplayer;
    render();
    const guest = result.multiplayer?.connections?.find((connection) => connection.partyMemberId === partyMemberId && connection.status === "connected");
    setProviderActivity(`${guest?.displayName || "Guest"} seated at the table`, "idle");
  } catch (error) {
    setProviderActivity(error instanceof Error ? `Seat guest failed: ${error.message}` : "Seat guest failed", "error");
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
    if (state.guestSession.campaignId) {
      url.searchParams.set("campaignId", state.guestSession.campaignId);
    }
    if (state.guestSession.tableId) {
      url.searchParams.set("tableId", state.guestSession.tableId);
    }
    if (state.guestSession.sessionId) {
      url.searchParams.set("sessionId", state.guestSession.sessionId);
    }
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
      setProviderActivity("Host local table is off. Ask the host to start it, then refresh the table.", "waiting");
    } else if (snapshot.awaitingApproval) {
      setProviderActivity("Waiting for your friend", "waiting");
    } else if (snapshot.pendingInput?.passed) {
      setProviderActivity("Passed for this turn. Waiting for the host table.", "waiting");
    } else if (snapshot.pendingInput?.text) {
      setProviderActivity("Action sent. Waiting for the host table to resolve it.", "waiting");
    } else if (snapshot.connection?.status === "connected") {
      setProviderActivity(`Connected as ${snapshot.assignedCharacter?.name ?? snapshot.connection.displayName}`, "idle");
    } else {
      setProviderActivity(`Guest connection ${snapshot.connection?.status ?? "unknown"}`, "waiting");
    }
    return snapshot;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Guest table refresh failed";
    if (/connection secret/i.test(message) || (/connection/i.test(message) && /not found/i.test(message))) {
      clearGuestSession({ keepRecent: false });
      setProviderActivity("Guest session expired. Rejoin from a fresh invite.", "error");
      render();
      return null;
    }
    if (/failed to fetch|networkerror|load failed|fetch/i.test(message)) {
      clearGuestSession({ keepRecent: true });
      setProviderActivity("Host disconnected. Reconnect when the host table is available.", "waiting");
      render();
      return null;
    }
    if (explicit) {
      setProviderActivity(`Guest table refresh failed: ${message}`, "error");
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
      ...guestTableAuthorityPayload(),
    });
    renderGuestSnapshot(result.snapshot);
    if (!pass) {
      elements.playerInput.value = "";
      renderInputComposer();
    }
    const pendingInput = result.snapshot?.pendingInput;
    if (pass || pendingInput?.passed) {
      setProviderActivity("Passed for this turn. Waiting for the host table.", "waiting");
    } else if (pendingInput?.text) {
      setProviderActivity("Action sent. Waiting for the host table to resolve it.", "waiting");
    } else {
      setProviderActivity("Action sent to host", "waiting");
    }
  } catch (error) {
    setProviderActivity(error instanceof Error ? `Guest action failed: ${error.message}` : "Guest action failed", "error");
  }
}

async function submitGuestChoiceVote(block, index) {
  if (!state.guestSession?.hostBaseUrl || !state.guestSession?.connectionId) {
    setProviderActivity("Join a local table first", "error");
    return;
  }
  const item = block.items?.[index] || "";
  const label = choiceLabelForIndex(index);
  const optionId = choiceOptionId(block, index);
  if (elements.playerInput && (
    pendingSelectionMatchesText(state.pendingChoiceSelection, elements.playerInput.value) ||
    extractChoiceTokenText(elements.playerInput.value)
  )) {
    elements.playerInput.value = "";
    renderInputComposer();
  }
  state.pendingChoiceSelection = null;
  try {
    setProviderActivity(`Voted ${label}. Waiting for the host to choose for the party.`, "waiting");
    const result = await postJson(`${state.guestSession.hostBaseUrl}${apiMultiplayerChoiceVoteUrl}`, {
      connectionId: state.guestSession.connectionId,
      clientId: state.guestSession.clientId || guestClientId(),
      connectionSecret: state.guestSession.connectionSecret || "",
      characterId: state.guestSession.partyMemberId,
      choiceKey: choicePanelKey(block),
      optionId,
      optionLabel: label,
      optionText: item,
      prompt: block.prompt || "",
      ...guestTableAuthorityPayload(),
    });
    renderGuestSnapshot(result.snapshot);
    setProviderActivity(`Voted ${label}. The host will make the party call.`, "waiting");
  } catch (error) {
    setProviderActivity(error instanceof Error ? `Vote failed: ${error.message}` : "Vote failed", "error");
  }
}

async function sendTableTalkFromUi() {
  const text = elements.tableTalkInput?.value.trim() ?? "";
  if (!text) {
    return;
  }
  if (elements.tableTalkSend) {
    elements.tableTalkSend.disabled = true;
  }

  try {
    if (state.guestSession?.hostBaseUrl && state.guestSession?.connectionId) {
      const result = await postJson(`${state.guestSession.hostBaseUrl}${apiMultiplayerTableTalkUrl}`, {
        connectionId: state.guestSession.connectionId,
        clientId: state.guestSession.clientId || guestClientId(),
        connectionSecret: state.guestSession.connectionSecret || "",
        text,
        ...guestTableAuthorityPayload(),
      });
      if (result.snapshot) {
        renderGuestSnapshot(result.snapshot);
      } else {
        await refreshGuestSnapshot({ explicit: false });
      }
      elements.tableTalkInput.value = "";
      setProviderActivity("Table talk sent", "idle");
      return;
    }

    const result = await postJson(apiMultiplayerTableTalkUrl, {
      playerName: "Host",
      text,
      ...localTableAuthorityPayload(),
    });
    setCampaignFromPayload(result, "table_talk");
    state.multiplayerSnapshot = result.multiplayer;
    elements.tableTalkInput.value = "";
    render();
    setProviderActivity("Table talk sent", "idle");
  } catch (error) {
    setProviderActivity(error instanceof Error ? `Table talk failed: ${error.message}` : "Table talk failed", "error");
  } finally {
    if (elements.tableTalkSend) {
      elements.tableTalkSend.disabled = false;
    }
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

  await resolvePendingInputsWithText(readyInputs, hostText);
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
  await applyStagedInputRecoveryPlan(buildStagedInputRecoveryPlan({
    runResult,
    pendingInputs: inputs,
  }), runResult);
}

function scheduleAutoResolveGuestInputs(reason = "snapshot") {
  if (!shouldScheduleGuestAutoResolve({
    clientMode,
    hasGuestHostBaseUrl: Boolean(state.guestSession?.hostBaseUrl),
    campaignWizardCreating: state.campaignWizardCreating,
  })) {
    clearAutoResolveGuestInputsTimer();
    return;
  }
  if (state.autoResolveGuestInputsTimer) {
    clearAutoResolveGuestInputsTimer();
  }
  const expectedPin = buildGuestAutoResolvePin(state.campaign);
  state.autoResolveGuestInputsTimer = window.setTimeout(() => {
    state.autoResolveGuestInputsTimer = null;
    maybeAutoResolveGuestInputs(reason, expectedPin);
  }, 150);
}

function clearAutoResolveGuestInputsTimer() {
  if (!state.autoResolveGuestInputsTimer) {
    return;
  }
  window.clearTimeout(state.autoResolveGuestInputsTimer);
  state.autoResolveGuestInputsTimer = null;
}

async function maybeAutoResolveGuestInputs(reason = "snapshot", expectedPin = null) {
  const plan = guestAutoResolvePlan(expectedPin);
  if (!plan.shouldResolve) {
    if (plan.reason === "stale_table_session") {
      pushDiagnosticsEvent("guest_inputs_auto_resolve_skipped", {
        reason,
        skipReason: plan.reason,
        expectedPin,
        currentPin: buildGuestAutoResolvePin(state.campaign),
      });
    }
    return;
  }
  state.autoResolvingGuestInputs = true;
  try {
    pushDiagnosticsEvent("guest_inputs_auto_resolving", {
      reason,
      inputIds: plan.inputs.map((input) => input.id),
      combatActorId: state.campaign?.combat?.currentTurnId ?? null,
    });
    setProviderActivity(plan.activityText, "working");
    await resolvePendingInputsWithText(plan.inputs, "");
  } catch (error) {
    setProviderActivity(error instanceof Error ? `Guest action queued: ${error.message}` : "Guest action queued", "waiting");
  } finally {
    state.autoResolvingGuestInputs = false;
  }
}

function shouldAutoResolveGuestInputs() {
  return guestAutoResolvePlan().shouldResolve;
}

function guestAutoResolvePlan(expectedPin = null) {
  return buildGuestAutoResolvePlan({
    campaign: state.campaign,
    expectedPin,
    campaignWizardCreating: state.campaignWizardCreating,
    autoResolvingGuestInputs: state.autoResolvingGuestInputs,
    turnFlowBlocksNewTurn: turnFlowBlocksNewTurn(),
    hostDraftText: elements.playerInput?.value ?? "",
    stagedInputs: collectStagedRemoteInputs(),
  });
}

function earliestGuestInputForImmediateResolution(inputs) {
  return [...inputs]
    .sort((a, b) => String(a.updatedAt || "").localeCompare(String(b.updatedAt || "")))
    .slice(0, 1);
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
    multiplayer: {
      choiceVotes: tableState.choiceVotes ?? snapshot.choiceVotes ?? [],
      tableTalk: tableState.tableTalk ?? snapshot.tableTalk ?? [],
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
    elements.saveStatus.textContent = "Guest: waiting for seat";
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
    id: "lorekeeper-join",
    title: "LoreKeeper Join",
    summary: "Waiting for a hosted local table.",
    scene: {
      status: "waiting",
      currentPlaceId: "client-lobby",
      immediateSituation: guestWaitingRoomMode
        ? "Ask to join this local table. The host will choose your character seat."
        : "Paste a host invite link to join a local table.",
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
      activeSessionId: "lorekeeper-join-session",
      sessions: [
        {
          id: "lorekeeper-join-session",
          title: "LoreKeeper Join",
          startedAt: new Date().toISOString(),
          endedAt: null,
          recap: "",
        },
      ],
      messages: [
        {
          id: "lorekeeper-join-ready",
          sessionId: "lorekeeper-join-session",
          role: "system",
          title: "LoreKeeper",
        body: guestWaitingRoomMode
          ? "Choose an open table, ask for a seat, and wait for your friend to bring you in."
          : "Join a hosted LoreKeeper table and play as an assigned party member.",
        meta: "No local DM Voice setup is needed here.",
          source: "lorekeeper_join",
          createdAt: new Date().toISOString(),
          data: {},
        },
      ],
    },
  });
}

function renderMultiplayerPanel() {
  renderMultiplayerSessionPanel({
    elements,
    projection: buildMultiplayerSessionProjection({
      campaign: state.campaign,
      clientMode,
      guestSession: state.guestSession,
      guestSnapshot: state.guestSnapshot,
      hostSnapshot: state.multiplayerSnapshot,
      locationPort: location.port,
    }),
    labelById: (id) => labelById(state.campaign, id),
    seatWaitingGuest: seatWaitingGuestAtTable,
    approveGuest,
    denyGuest,
  });
}

function controllerLabel(member) {
  if (member.inviteIntent === "remote_player" && member.controllerKind === "unassigned") {
    return "Invite";
  }
  const kind = member.controllerKind || (member.type === "player_character" ? "host" : "ai_companion");
  return {
    host: "You",
    remote_player: "Friend",
    ai_companion: "Companion",
    unassigned: "Open",
  }[kind] || "Companion";
}

function partyControllerDetail(member) {
  if (member.inviteIntent === "remote_player" && member.controllerKind === "unassigned") {
    return "Waiting for an invited friend.";
  }
  if (member.controllerKind === "host") {
    return "You control this character.";
  }
  if (member.controllerKind === "remote_player") {
    return "A friend controls this character.";
  }
  if (member.controllerKind === "ai_companion") {
    return "Companion.";
  }
  return "";
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
    const tableId = url.searchParams.get("table") || "";
    const sessionId = url.searchParams.get("session") || "";
    const seat = url.searchParams.get("seat") || "";
    const token = url.searchParams.get("token") || "";
    if (url.protocol !== "lorekeeper:" || url.hostname !== "join") {
      return { valid: false, error: "Invite link must start with lorekeeper://join." };
    }
    if (!host || !Number.isInteger(port) || !campaign || !seat || !token) {
      return { valid: false, error: "Invite link is missing host, port, campaign, seat, or token." };
    }
    if (!isAllowedInviteHost(host)) {
      return { valid: false, error: "Invite host must be a local or private LAN address." };
    }
    return { valid: true, host, port, campaign, tableId, sessionId, seat, token };
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

function loadRecentGuestSession() {
  try {
    return JSON.parse(localStorage.getItem(guestRecentSessionStorageKey) || "null");
  } catch {
    return null;
  }
}

function loadWaitingRoomSession() {
  try {
    return JSON.parse(localStorage.getItem(guestWaitingRoomStorageKey) || "null");
  } catch {
    return null;
  }
}

function saveGuestSession(session) {
  state.guestSession = session;
  localStorage.setItem(guestSessionStorageKey, JSON.stringify(session));
  rememberGuestSession(session);
}

function rememberGuestSession(session) {
  if (!session?.inviteLink || !session?.hostBaseUrl) {
    return;
  }
  state.recentGuestSession = {
    inviteLink: session.inviteLink,
    hostBaseUrl: session.hostBaseUrl,
    playerName: session.playerName || "",
    campaignId: session.campaignId || "",
    partyMemberId: session.partyMemberId || "",
    savedAt: new Date().toISOString(),
  };
  localStorage.setItem(guestRecentSessionStorageKey, JSON.stringify(state.recentGuestSession));
}

function clearGuestSession({ keepRecent = true } = {}) {
  if (keepRecent && state.guestSession) {
    rememberGuestSession(state.guestSession);
  }
  state.guestSession = null;
  state.guestSnapshot = null;
  localStorage.removeItem(guestSessionStorageKey);
}

function saveWaitingRoomSession(session) {
  state.waitingRoomSession = session;
  localStorage.setItem(guestWaitingRoomStorageKey, JSON.stringify(session));
}

function clearWaitingRoomSession() {
  state.waitingRoomSession = null;
  localStorage.removeItem(guestWaitingRoomStorageKey);
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
    controllerKind: input.controllerKind ? normalizeWizardControllerKind(input.controllerKind) : "",
  };
}

function normalizeWizardJoiner(input = {}) {
  const seed = normalizeWizardCharacter(input);
  const integrationPrompt = String(input.integrationPrompt ?? "").trim();
  const hostIntegrationPrompt = String(input.hostIntegrationPrompt ?? "").trim();
  const hasAnyValue = [
    seed.name,
    seed.ancestry,
    seed.characterClass,
    seed.concept,
    integrationPrompt,
    hostIntegrationPrompt,
  ].some(Boolean);
  if (!hasAnyValue) {
    return null;
  }
  const completed = completeCharacterSeed({
    ...seed,
    integrationPrompt,
    hostIntegrationPrompt,
  });
  const controllerKind = normalizeWizardControllerKind(input.controllerKind || seed.controllerKind || "ai_companion");

  return {
    ...seed,
    ...completed,
    controllerKind,
    playerRole: wizardPlayerRoleForController(controllerKind),
    integrationPrompt: completed.integrationPrompt,
    hostIntegrationPrompt: completed.hostIntegrationPrompt,
  };
}

function normalizeWizardJoiners(inputs = []) {
  return normalizeList(inputs)
    .map((input) => normalizeWizardJoiner(input))
    .filter(Boolean);
}

function buildOpeningSceneSummary({ premise, startingLocation, character, startingPartyMembers = [] }) {
  const joiners = normalizeList(startingPartyMembers);
  const partyNames = [
    character?.name,
    ...joiners.map((member) => member.name),
  ].filter(Boolean);
  const placeLine = startingLocation
    ? `The table is set at ${startingLocation}.`
    : "The table is set for the first scene.";
  const details = [
    placeLine,
    partyNames.length
      ? `${partyNames.join(", ")} ${partyNames.length === 1 ? "is" : "are"} at the table.`
      : "",
    premise
      ? `Premise: ${premise}`
      : "",
    "Next: invite anyone else you want at the table, then press Start Adventure for the opening narration.",
  ].filter(Boolean);

  return details.join("\n\n");
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
  const baseSheet = character.autoSheet
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
  const sheet = {
    ...baseSheet,
    ...wizardControllerSheetFields(character.controllerKind || "host", { primary: true }),
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

async function seedWizardStartingPartyMember(character) {
  const baseSheet = character.autoSheet
    ? buildFiveELiteCharacterSeed(character)
    : {
        id: `party-${slugify(character.name)}`,
        name: character.name,
        type: "player_character",
        playerRole: character.playerRole || "Starting party member / pending player",
        ancestryClass: [character.ancestry, character.characterClass].filter(Boolean).join(" ") || "adventurer",
        level: character.level,
        background: character.concept,
        notes: [],
      };
  const sheet = {
    ...baseSheet,
    ...wizardControllerSheetFields(character.controllerKind || "ai_companion"),
    integrationPrompt: character.integrationPrompt,
    hostIntegrationPrompt: character.hostIntegrationPrompt,
    notes: [
      ...(Array.isArray(baseSheet.notes) ? baseSheet.notes : []),
      `Created from the new campaign wizard as ${wizardPlayerRoleForController(character.controllerKind || "ai_companion").toLowerCase()}.`,
      character.integrationPrompt ? `Party integration: ${character.integrationPrompt}` : "",
      character.hostIntegrationPrompt ? `Table scene cue: ${character.hostIntegrationPrompt}` : "",
    ].filter(Boolean),
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
  setCampaignFromPayload(result, "new_campaign_starting_party_member");
}

function wizardControllerSheetFields(controllerKind, { primary = false } = {}) {
  const normalized = normalizeWizardControllerKind(controllerKind || (primary ? "host" : "ai_companion"));
  if (normalized === "host") {
    return {
      playerRole: primary ? "Host player character" : "Host-controlled party member",
      controllerKind: "host",
      controllerId: "host",
      fallbackControllerKind: "host",
    };
  }
  if (normalized === "remote_invite") {
    return {
      playerRole: "Remote invite seat",
      controllerKind: "unassigned",
      controllerId: null,
      fallbackControllerKind: "ai_companion",
      inviteIntent: "remote_player",
    };
  }
  return {
    playerRole: primary ? "AI party companion" : "AI party companion",
    controllerKind: "ai_companion",
    controllerId: null,
    fallbackControllerKind: "ai_companion",
  };
}

function wizardPlayerRoleForController(controllerKind) {
  const normalized = normalizeWizardControllerKind(controllerKind);
  if (normalized === "host") {
    return "Host-controlled party member";
  }
  if (normalized === "remote_invite") {
    return "Remote invite seat";
  }
  return "AI party companion";
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
  const attacks = attacksForProfile(profile, abilityScores, proficiencyBonus);
  const equipment = equipmentForProfile(profile, character);

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
    attacks,
    conditions: [],
    skills: skillsForProfile(profile, character),
    abilities: abilitiesForProfile(profile, character),
    spells,
    inventory: equipment.inventory,
    equipment,
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
      ? [
        spell("Frostbite", 0, { castingTime: "action", roll: { save: { ability: "CON" }, damage: "1d6" }, effect: "Cold cantrip that can sap a target's next weapon attack." }),
        spell("Druidcraft", 0, { castingTime: "action", effect: "Small primal omen, sensory, or nature effect." }),
        spell("Entangle", 1, { castingTime: "action", roll: { save: { ability: "STR" }, conditionOnFail: "restrained" }, effect: "Plants restrain creatures in a small area on a failed save." }),
        spell("Goodberry", 1, { castingTime: "action", effect: "Creates simple magical food and minor healing." }),
      ]
      : [
        spell("Druidcraft", 0, { castingTime: "action", effect: "Small primal omen, sensory, or nature effect." }),
        spell("Entangle", 1, { castingTime: "action", roll: { save: { ability: "STR" }, conditionOnFail: "restrained" }, effect: "Plants restrain creatures in a small area on a failed save." }),
        spell("Goodberry", 1, { castingTime: "action", effect: "Creates simple magical food and minor healing." }),
      ];
  }
  if (profile.key === "wizard") {
    return [
      spell("Mage Hand", 0, { castingTime: "action", effect: "Spectral hand manipulates small objects at range." }),
      spell("Detect Magic", 1, { castingTime: "action", effect: "Reveals nearby magical auras with concentration." }),
      spell("Magic Missile", 1, { castingTime: "action", roll: { damage: "3d4+3" }, effect: "Automatic force darts against visible targets." }),
    ];
  }
  if (profile.key === "cleric") {
    return [
      spell("Guidance", 0, { castingTime: "action", effect: "Brief divine help on an ability check." }),
      spell("Bless", 1, { castingTime: "action", effect: "Allies add a small divine bonus to attacks and saves." }),
      spell("Healing Word", 1, { castingTime: "bonus_action", roll: { healing: "1d4+3" }, effect: "Ranged minor healing as a bonus action." }),
    ];
  }
  if (profile.key === "bard") {
    return [
      spell("Vicious Mockery", 0, { castingTime: "action", roll: { save: { ability: "WIS" }, damage: "1d4" }, effect: "Psychic insult that can hinder a target's next attack." }),
      spell("Charm Person", 1, { castingTime: "action", roll: { save: { ability: "WIS" } }, effect: "Social magic that makes one humanoid friendly for a while." }),
      spell("Healing Word", 1, { castingTime: "bonus_action", roll: { healing: "1d4+3" }, effect: "Ranged minor healing as a bonus action." }),
    ];
  }
  return [];
}

function spell(name, level, details = {}) {
  return {
    name,
    level,
    castingTime: details.castingTime || "action",
    roll: details.roll ?? null,
    effect: details.effect || "",
  };
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

function equipmentForProfile(profile, character = {}) {
  const ancestryClass = `${character.ancestry || ""} ${character.characterClass || ""} ${character.concept || ""}`;
  const common = ["Bedroll", "Rations", "Waterskin", "Tinderbox"];
  const kits = {
    druid: {
      armor: "Leather armor",
      weapons: ["Quarterstaff", "Sling"],
      tools: ["Herbalism kit"],
      inventory: ["Druidic focus", "Herbalism kit", ...common],
    },
    rogue: {
      armor: "Leather armor",
      weapons: ["Shortsword", "Shortbow", "Dagger"],
      tools: ["Thieves' tools", "Disguise kit"],
      inventory: ["Thieves' tools", "Disguise kit", "50 ft rope", ...common],
    },
    ranger: {
      armor: "Leather armor",
      weapons: ["Longbow", "Shortsword", "Dagger"],
      tools: ["Hunting trap"],
      inventory: ["Quiver of arrows", "Hunting trap", "50 ft rope", ...common],
    },
    fighter: {
      armor: /dwarf|soldier|guard|knight/i.test(ancestryClass) ? "Chain mail" : "Scale mail",
      weapons: ["Longsword", "Javelin", "Shield"],
      tools: ["Gaming set or soldier's kit"],
      inventory: ["Shield", "Javelins", "Whetstone", ...common],
    },
    wizard: {
      armor: "No armor",
      weapons: ["Dagger", "Quarterstaff"],
      tools: ["Spellbook", "Arcane focus"],
      inventory: ["Spellbook", "Arcane focus", "Ink and quill", ...common],
    },
    cleric: {
      armor: "Scale mail",
      weapons: ["Mace", "Light crossbow", "Shield"],
      tools: ["Holy symbol", "Healer's kit"],
      inventory: ["Holy symbol", "Healer's kit", "Shield", ...common],
    },
    bard: {
      armor: "Leather armor",
      weapons: ["Rapier", "Dagger", "Light crossbow"],
      tools: ["Musical instrument"],
      inventory: ["Musical instrument", "Diplomat's pack", ...common],
    },
    balanced: {
      armor: "Traveling leathers",
      weapons: ["Simple weapon", "Dagger"],
      tools: ["Adventuring kit"],
      inventory: ["Adventuring kit", ...common],
    },
  };
  return kits[profile.key] ?? kits.balanced;
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
  resetTurnCarryover();
  state.turnFlow.reset({ reason: "fallback_imported_campaign_loaded" });
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
  const adoptionPlan = buildCampaignAdoptionPlan({
    previousCampaignId,
    nextCampaignId: state.campaign?.id,
  });
  if (adoptionPlan.resetTurnCarryover) {
    resetTurnCarryover();
  }
  if (adoptionPlan.resetTurnFlow) {
    state.turnFlow.reset({ reason: adoptionPlan.turnFlowResetReason });
  }
  if (adoptionPlan.resetPlayLogLimit) {
    state.playLogVisibleLimit = defaultPlayLogVisibleLimit;
  }
  scheduleAutoResolveGuestInputs(contextPurpose);
}

function resetTurnCarryover() {
  state.currentTurn = null;
  state.pendingChoiceSelection = null;
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
  return clientMode || state.homeFlow === "join" || isRemoteTableClient() ? "join" : "host";
}

function normalizeAppMode(mode) {
  return mode === "join" || mode === "thin" ? "join" : "host";
}

async function switchAppMode(mode) {
  const nextMode = normalizeAppMode(mode);
  localStorage.setItem(appModeStorageKey, nextMode);

  if (!clientMode) {
    chooseHomeFlow(nextMode === "join" ? "join" : "host");
    return;
  }

  renderAppModeControls();

  if (nextMode === currentAppMode()) {
    setProviderActivity(nextMode === "join" ? "Already in Join mode" : "Already in Host mode", "idle");
    return;
  }

  if (window.lorekeeperDesktop?.relaunchMode) {
    setProviderActivity(`Switching to ${nextMode === "join" ? "Join" : "Host"} mode...`, "working");
    await window.lorekeeperDesktop.relaunchMode(nextMode);
    return;
  }

  setProviderActivity(`Use the LoreKeeper app shortcut to open ${nextMode === "join" ? "Join" : "Host"} mode`, "waiting");
}

function renderAppModeControls() {
  if (elements.appModeSelect) {
    elements.appModeSelect.value = currentAppMode();
  }
  if (elements.appModeNote) {
    elements.appModeNote.textContent = clientMode
      ? "Join connects to a host and receives visible table state without local DM Voice setup."
      : "Host runs campaigns, saves your table, manages DM Voice, and can also join another host when needed.";
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
    setProviderActivity("Saving DM Voice settings...", "working");
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
    setProviderActivity("DM Voice settings saved", "idle");
  } catch (error) {
    elements.bridgeStatus.textContent = error instanceof Error ? `DM Voice settings failed: ${error.message}` : "DM Voice settings failed";
    setProviderActivity("DM Voice settings save failed", "error");
  }
}

async function refreshProviderStatus({ quiet = false } = {}) {
  try {
    if (!quiet) {
      setProviderActivity("Checking local DM Voice...", "working");
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
    if (elements.newCampaign) {
      elements.newCampaign.disabled = true;
    }
    if (elements.loadImported) {
      elements.loadImported.disabled = true;
    }
    elements.recheckProvider.hidden = true;
    elements.bridgeCard.hidden = true;
    elements.promptDrawer.hidden = true;
    elements.ollamaStatus.textContent = "Join mode uses the host's DM Voice.";
    elements.ollamaBenchmark.textContent = "No local storyteller setup is needed in this window.";
    applyJoinClientChrome();
    renderTableActions();
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
  applyHostModeChrome();
  renderTableActions();
}

function applyJoinClientChrome() {
  const tableSession = refreshTableSessionProjection();
  renderAppModeControls();
  document.body.classList.add("lorekeeper-join-mode");
  elements.deleteCampaign.hidden = true;
  elements.providerStatus.textContent = "Mode: LoreKeeper Join";
  hideSetupSection(elements.providerMode, true);
  hideSetupSection(elements.newCampaign, true);
  hideSetupSection(elements.responseImport, true);
  elements.startLocalTable.hidden = true;
  elements.stopLocalTable.hidden = true;
  if (elements.copyCharacterInvite) {
    elements.copyCharacterInvite.hidden = true;
  }
  if (elements.copyGuestLink) {
    elements.copyGuestLink.hidden = true;
  }
  if (elements.localTableGuestLink) {
    elements.localTableGuestLink.closest(".local-table-share")?.setAttribute("hidden", "");
  }
  if (elements.requireGuestActionApproval) {
    elements.requireGuestActionApproval.closest(".local-table-option")?.setAttribute("hidden", "");
  }
  if (elements.holdGuestActionsForGroup) {
    elements.holdGuestActionsForGroup.closest(".local-table-option")?.setAttribute("hidden", "");
  }
  elements.resolvePartyInputs.hidden = true;
  elements.joinCampaign.hidden = false;
  const guestConnected = state.guestSession?.status === "connected" || state.guestSnapshot?.connection?.status === "connected";
  if (elements.joinCampaignMain) {
    elements.joinCampaignMain.hidden = guestConnected;
    elements.joinCampaignMain.disabled = guestConnected || hasActiveGeneration();
  }
  if (elements.inviteNewCharacterMain) {
    elements.inviteNewCharacterMain.hidden = true;
  }
  if (elements.syncGuestTable) {
    elements.syncGuestTable.hidden = false;
  }
  elements.recheckProvider.hidden = true;
  document.querySelectorAll("[data-add-domain]").forEach((button) => {
    button.hidden = true;
    button.disabled = true;
  });
  renderInputComposer(tableSession);
}

function applyHostModeChrome() {
  const tableSession = refreshTableSessionProjection();
  renderAppModeControls();
  document.body.classList.remove("lorekeeper-join-mode");
  elements.deleteCampaign.hidden = false;
  elements.startLocalTable.hidden = false;
  elements.stopLocalTable.hidden = false;
  if (elements.copyCharacterInvite) {
    elements.copyCharacterInvite.hidden = false;
  }
  if (elements.copyGuestLink) {
    elements.copyGuestLink.hidden = false;
  }
  if (elements.localTableGuestLink) {
    elements.localTableGuestLink.closest(".local-table-share")?.removeAttribute("hidden");
  }
  if (elements.requireGuestActionApproval) {
    elements.requireGuestActionApproval.closest(".local-table-option")?.removeAttribute("hidden");
  }
  if (elements.holdGuestActionsForGroup) {
    elements.holdGuestActionsForGroup.closest(".local-table-option")?.removeAttribute("hidden");
  }
  elements.resolvePartyInputs.hidden = false;
  elements.joinCampaign.hidden = false;
  if (elements.joinCampaignMain) {
    elements.joinCampaignMain.hidden = true;
    elements.joinCampaignMain.disabled = true;
  }
  if (elements.inviteNewCharacterMain) {
    elements.inviteNewCharacterMain.hidden = false;
    elements.inviteNewCharacterMain.disabled = hasActiveGeneration();
  }
  if (elements.syncGuestTable) {
    elements.syncGuestTable.hidden = false;
  }
  document.querySelectorAll("[data-add-domain]").forEach((button) => {
    button.hidden = false;
    button.disabled = false;
  });
  renderInputComposer(tableSession);
}

function renderInputComposer(tableSession = state.tableSession ?? refreshTableSessionProjection()) {
  if (!state.campaign || !elements.playerInput || !elements.buildTurn) {
    return;
  }
  const hasDraftText = Boolean(elements.playerInput.value.trim());
  if (clientMode) {
    applyInputComposerProjection(elements, buildInputComposerProjection({
      clientMode: true,
      campaign: state.campaign,
      guestSession: state.guestSession,
      guestSnapshot: state.guestSnapshot,
      tableSession,
      hasDraftText,
      labelById: (id) => labelById(state.campaign, id),
    }));
    return;
  }
  const hasSubmitContent = hasDraftText
    || collectApprovedPartyInputs().length > 0
    || collectStagedRemoteInputs().length > 0;
  applyInputComposerProjection(elements, buildInputComposerProjection({
    campaign: state.campaign,
    turnProjection: turnProjection(),
    tableSession,
    hasDraftText,
    hasSubmitContent,
    collectStagedRemoteInputs,
    findPartyMember: (id) => findById(state.campaign.party, id),
    isHostControlledPartyRecord,
    labelById: (id) => labelById(state.campaign, id),
  }));
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
    return "Install Ollama from ollama.com, then reopen DM Voice and refresh.";
  }
  if (ollama.state === "ollama_not_running") {
    return "Start Ollama, then refresh DM Voice.";
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
  let payload = {
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

  if (payload.domain === "party" && !state.editingRecord) {
    const split = splitAncestryClass(payload.role);
    const seed = completeCharacterSeed({
      name: payload.name,
      ancestry: split.ancestry,
      characterClass: split.characterClass || payload.role,
      concept: payload.summary,
    });
    const sheet = buildFiveELiteCharacterSeed(seed);
    payload = {
      ...payload,
      ...sheet,
      role: "AI party companion",
      playerRole: "AI party companion",
      ancestryClass: [seed.ancestry, seed.characterClass].filter(Boolean).join(" "),
      background: seed.backstory,
      controllerKind: "ai_companion",
      controllerId: null,
      fallbackControllerKind: "ai_companion",
      notes: [
        ...(Array.isArray(sheet.notes) ? sheet.notes : []),
        "Created from the party character creator after campaign start.",
        seed.integrationPrompt ? `Party integration: ${seed.integrationPrompt}` : "",
      ].filter(Boolean),
    };
  }

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
    elements.bridgeStatus.textContent = `${recordLabel(payload.domain)} saved; the DM will remember it next turn`;
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
  if (elements.recordCharacterAutocomplete) {
    elements.recordCharacterAutocomplete.hidden = domain !== "party";
  }
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
      notesPlaceholder: "What should LoreKeeper remember about this source image?",
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
  // Danger zone: one render pass still owns the hand-written DOM shell. Future
  // target: keep app.js as event wiring while React/projection modules own the
  // individual table surfaces.
  const campaign = state.campaign;
  const currentPlace = findById(campaign.places, campaign.scene.currentPlaceId);
  const activeSession = activeSessionRecord(campaign);

  renderRightRailState();
  renderHomePanel();
  elements.title.textContent = campaign.title;
  elements.sessionLabel.textContent = activeSession?.title || "Campaign Play";
  elements.sceneLocation.textContent = currentPlace?.name ?? "Current scene";
  renderSceneIntelligence(campaign);
  renderSceneNotebook(campaign);
  const providerSettings = currentProviderSettings();
  elements.providerStatus.textContent = providerSettings.preferredProvider === "ollama"
    ? `DM voice: Local DM ${providerSettings.selectedModel}`
    : "DM voice: ChatGPT DM";
  if (providerSettings.preferredProvider === "bridge" && state.bridge.mode === "extension") {
    elements.providerStatus.textContent = state.bridge.ready
      ? "DM voice: ChatGPT DM ready"
      : "DM voice: ChatGPT DM waiting";
  }
  elements.saveStatus.textContent = clientMode || isRemoteTableClient()
    ? "Hosted table"
    : "Saved locally";
  if (state.sqlitePath) {
    elements.saveStatus.textContent = "Saved locally";
  }
  renderTableActions();

  renderPlayLog();
  renderJoinClientPanel();
  renderParty(campaign);
  renderCombatTracker(campaign);
  renderPeople(campaign);
  renderPlaces(campaign);
  renderThings(campaign);
  renderQuests(campaign);
  renderPlayerNotes(campaign);
  renderTableTalk();
  renderPrompt(state.prompt);
  renderReviewBatch();
  refreshTableSessionProjection();
  renderSessionHealthSummary();
  renderCampaignSelector();
  renderProviderControls();
  renderDebugMetaControl();
  renderMultiplayerPanel();
  renderTableActions();
}

function isCampaignReadyForOpening(campaign = state.campaign) {
  return isOpeningReady(campaign, { isHost: !clientMode && !isRemoteTableClient() });
}

function renderTableActions() {
  const repair = activeTurnRepair();
  applyTableActionProjection(elements, buildTableActionProjection({
    campaign: state.campaign,
    turnProjection: turnProjection(),
    repair,
    repairHardBlocked: isHardBlockedTurnRepair(repair),
    waitingGuests: waitingGuestsForSeating(),
    preferredProvider: currentProviderSettings().preferredProvider,
    isHost: !clientMode && !isRemoteTableClient(),
    openingRequested: isOpeningRequestedForCurrentSession(),
  }));
}

function currentOpeningRequestKey(campaign = state.campaign) {
  if (!campaign?.id) {
    return "";
  }
  const tableSessionId = campaign.multiplayer?.localTable?.sessionId;
  if (tableSessionId) {
    return `table:${campaign.id}:${tableSessionId}`;
  }
  return `solo:${campaign.id}:${campaign.sessionLog?.activeSessionId || "session-main"}`;
}

function isOpeningRequestedForCurrentSession(campaign = state.campaign) {
  const key = currentOpeningRequestKey(campaign);
  return Boolean(key && state.openingRequestedSessionKeys.has(key));
}

function markOpeningRequestedForCurrentSession(campaign = state.campaign) {
  const key = currentOpeningRequestKey(campaign);
  if (key) {
    state.openingRequestedSessionKeys.add(key);
  }
}

function announceWaitingGuestsIfNeeded() {
  const waitingGuests = waitingGuestsForSeating();
  const signature = waitingGuests.map((guest) => `${guest.id}:${guest.displayName || "Guest"}`).join("|");
  if (signature === state.lastWaitingGuestSignature) {
    return;
  }
  state.lastWaitingGuestSignature = signature;
  if (!waitingGuests.length || clientMode) {
    return;
  }
  const stateName = elements.providerActivity?.dataset.state || "idle";
  if (stateName === "working" || stateName === "error") {
    return;
  }
  const firstGuest = waitingGuests[0];
  setProviderActivity(waitingGuests.length === 1
    ? `${firstGuest.displayName || "A guest"} is waiting for a seat.`
    : `${waitingGuests.length} guests are waiting for seats.`,
  "waiting");
}

function openLocalTableSeating() {
  if (elements.setupDialog && !elements.setupDialog.open) {
    try {
      openSetupDialog({ tab: "friends", mode: "table" });
    } catch {
      // If the dialog cannot open, the party cards still expose seating actions.
    }
  } else {
    setSettingsTab("friends", { mode: "table" });
  }
  const section = document.querySelector(".local-table-section");
  section?.scrollIntoView({ block: "start" });
  section?.classList.add("setup-section-focused");
  window.setTimeout(() => section?.classList.remove("setup-section-focused"), 1800);
}

async function openSelectedHomeCampaign() {
  const sqlitePath = String(elements.homeCampaignSelect?.value || "").trim();
  if (!sqlitePath) {
    setProviderActivity("Start a new adventure to create your first saved table.", "waiting");
    return;
  }
  state.homeFlow = "host";
  await selectCampaignByPath(sqlitePath);
}

function chooseHomeFlow(flow) {
  const nextFlow = flow === "join" ? "join" : "host";
  state.homeFlow = nextFlow;
  renderHomePanel();
  renderAppModeControls();
  renderJoinClientPanel();
  if (nextFlow === "join") {
    setProviderActivity("Join ready. Paste a host link or use the guest page to request a seat.", "idle");
    window.setTimeout(() => elements.joinClientInviteLink?.focus(), 50);
    return;
  }
  setProviderActivity("Host ready.", "idle");
}

function visibleCampaigns() {
  return (state.campaigns ?? []).filter((campaign) => !isBackendStarterCampaign(campaign));
}

function isBackendStarterCampaign(campaign = {}) {
  const title = String(campaign.title || "").trim();
  const summary = String(campaign.summary || "").trim();
  return /^Untitled Campaign(?: \d+)?$/i.test(title)
    && summary === "A new D&D 5e-lite campaign ready to grow through play.";
}

async function returnToMainMenu() {
  const wasGuest = Boolean(clientMode || state.guestSession?.hostBaseUrl || state.waitingRoomSession?.waitingGuestId);
  if (wasGuest) {
    await notifyHostGuestLeaving().catch((error) => {
      pushDiagnosticsEvent("guest_leave_disconnect_failed", {
        message: error instanceof Error ? error.message : String(error ?? "disconnect failed"),
      });
    });
    clearGuestSession({ keepRecent: false });
    clearWaitingRoomSession();
    state.guestLobbyPreview = null;
    state.selectedGuestSeatId = "";
    state.launchInviteError = "";
    if (elements.guestWaitingPlayerName) {
      elements.guestWaitingPlayerName.value = "";
    }
  }
  state.homeFlow = "";
  renderHomePanel();
  renderJoinClientPanel();
  setProviderActivity(
    wasGuest ? "Left the hosted table. Choose Join to request another seat." : "Choose Continue, New Adventure, Join, or DM Voice.",
    "idle",
  );
}

async function notifyHostGuestLeaving() {
  const session = state.guestSession;
  if (!session?.hostBaseUrl || !session?.connectionId || !session.connectionSecret) {
    return null;
  }
  return postJson(`${session.hostBaseUrl}${apiMultiplayerDisconnectUrl}`, {
    connectionId: session.connectionId,
    clientId: session.clientId || guestClientId(),
    connectionSecret: session.connectionSecret,
    campaignId: session.campaignId || "",
    tableId: session.tableId || "",
    sessionId: session.sessionId || "",
  });
}

function renderHomePanel() {
  if (!elements.homePanel) {
    return;
  }
  const joinedTable = Boolean(state.guestSession?.hostBaseUrl || state.guestSnapshot?.connection);
  const show = !state.homeFlow && !joinedTable;
  elements.homePanel.hidden = !show;
  renderLobbyChrome({ homeVisible: show });

  if (elements.homeActiveCampaign) {
    const campaignCount = visibleCampaigns().length;
    elements.homeActiveCampaign.textContent = campaignCount
      ? `${campaignCount} saved ${campaignCount === 1 ? "adventure" : "adventures"}`
      : "No saved adventures yet";
  }

  if (elements.homeCharacterCount) {
    elements.homeCharacterCount.textContent = "Characters live with their campaigns";
  }

  renderHomeCampaignPicker();
}

function renderHomeCampaignPicker() {
  if (!elements.homeCampaignSelect) {
    return;
  }
  const campaigns = visibleCampaigns();
  if (!campaigns.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No saved adventures yet";
    option.selected = true;
    elements.homeCampaignSelect.replaceChildren(option);
    elements.homeCampaignSelect.disabled = true;
    if (elements.homeHostFlow) {
      elements.homeHostFlow.disabled = true;
      elements.homeHostFlow.title = "Start a new adventure first.";
    }
    updateHomeDeleteButton();
    return;
  }
  elements.homeCampaignSelect.disabled = false;
  elements.homeCampaignSelect.replaceChildren(
    ...campaigns.map((campaign) => {
      const option = document.createElement("option");
      option.value = campaign.sqlitePath;
      option.textContent = campaign.title;
      option.selected = campaign.sqlitePath === state.sqlitePath;
      return option;
    }),
  );
  if (elements.homeHostFlow) {
    elements.homeHostFlow.disabled = false;
    elements.homeHostFlow.title = "Open the selected campaign as host.";
  }
  updateHomeDeleteButton();
}

function selectedHomeCampaign() {
  const sqlitePath = String(elements.homeCampaignSelect?.value || "").trim();
  if (!sqlitePath) {
    return null;
  }
  return visibleCampaigns().find((campaign) => campaign.sqlitePath === sqlitePath) ?? null;
}

function updateHomeDeleteButton() {
  if (!elements.homeDeleteCampaign) {
    return;
  }
  const selected = selectedHomeCampaign();
  elements.homeDeleteCampaign.disabled = !selected;
  elements.homeDeleteCampaign.title = selected
    ? "Delete the selected saved adventure."
    : "No saved adventure to delete.";
}

function renderLobbyChrome({ homeVisible = null, joinVisible = null } = {}) {
  const home = homeVisible ?? !elements.homePanel?.hidden;
  const join = joinVisible ?? !elements.joinClientPanel?.hidden;
  elements.app?.classList.toggle("lobby-mode", Boolean(home || join));
  elements.app?.classList.toggle("home-mode", Boolean(home));
  elements.app?.classList.toggle("join-mode", Boolean(join));
}

function renderRightRailState() {
}

function renderDebugMetaControl() {
  if (!elements.showDebugMeta) {
    return;
  }
  elements.showDebugMeta.checked = shouldShowDebugMessageMeta();
}

function renderSceneIntelligence(campaign) {
  if (!elements.sceneIntelligence) {
    return;
  }
  const retrieval = buildSceneRetrieval(campaign);
  const scene = retrieval.scene;
  const tensions = scene?.tensions ?? campaign.scene?.tensions ?? [];
  const consequences = retrieval.activeConsequences;
  const hasFirstClassScene = Boolean(campaign.scene?.activeSceneId || (campaign.scenes ?? []).some((record) => record.status === "active"));
  const hasDetails = Boolean(hasFirstClassScene || tensions.length || consequences.length);
  elements.sceneIntelligence.hidden = !hasDetails;
  if (elements.sceneIntelligenceTitle) {
    elements.sceneIntelligenceTitle.textContent = scene?.title || "Current scene";
  }
  if (elements.sceneIntelligenceTensions) {
    elements.sceneIntelligenceTensions.textContent = tensions.length
      ? `Tension: ${tensions.slice(0, 2).join("; ")}`
      : "";
    elements.sceneIntelligenceTensions.hidden = tensions.length === 0;
  }
  if (elements.sceneIntelligenceConsequences) {
    elements.sceneIntelligenceConsequences.textContent = consequences.length
      ? `Consequence: ${consequences.slice(0, 2).map((consequence) => consequence.title).join("; ")}`
      : "";
    elements.sceneIntelligenceConsequences.hidden = consequences.length === 0;
  }
}

function renderSceneNotebook(campaign) {
  if (!elements.sceneNoteList || !elements.sceneNoteCount) {
    return;
  }
  const retrieval = buildSceneRetrieval(campaign);
  const scene = retrieval.scene;
  const records = [];
  if (scene) {
    const location = scene.locationId ? labelById(campaign, scene.locationId) : "";
    records.push(binderRecordElement({
      title: scene.title || "Current scene",
      subtitle: location || scene.type || "scene",
      body: detailLines([
        scene.immediateSituation,
        scene.whyHere ? `Why here: ${scene.whyHere}` : "",
        ...(scene.tensions ?? []).slice(0, 3).map((tension) => `Tension: ${tension}`),
        ...(scene.unresolvedQuestions ?? []).slice(0, 3).map((question) => `Open: ${question}`),
      ]),
    }));
  }

  for (const consequence of retrieval.activeConsequences.slice(0, 3)) {
    records.push(binderRecordElement({
      title: consequence.title || "Consequence",
      subtitle: consequence.scope || consequence.importance || "consequence",
      body: detailLines([
        consequence.description,
        consequence.status ? `Status: ${consequence.status}` : "",
      ]),
    }));
  }

  for (const thread of retrieval.activeThreads.slice(0, 3)) {
    records.push(binderRecordElement({
      title: thread.title || "Open thread",
      subtitle: thread.status || "thread",
      body: detailLines([
        thread.stakes,
        ...(thread.openQuestions ?? []).slice(0, 2).map((question) => `Open: ${question}`),
      ]),
    }));
  }

  for (const relationship of retrieval.relevantRelationships.slice(0, 2)) {
    records.push(binderRecordElement({
      title: `${labelById(campaign, relationship.sourceId)} / ${labelById(campaign, relationship.targetId)}`,
      subtitle: relationship.type || "relationship",
      body: detailLines([relationship.summary, relationship.notes]),
    }));
  }

  elements.sceneNoteCount.textContent = String(records.length);
  elements.sceneNoteList.replaceChildren(
    ...emptyOrRecords(records, "Scene focus, consequences, and active threads will appear here as play creates them."),
  );
}

function renderJoinClientPanel() {
  if (!elements.joinClientPanel) {
    return;
  }
  const connected = state.guestSession?.status === "connected" || state.guestSnapshot?.connection?.status === "connected";
  const joinFlowActive = state.homeFlow === "join" || (clientMode && state.homeFlow !== "");
  const show = joinFlowActive && !connected;
  elements.joinClientPanel.hidden = !show;
  elements.playLog.classList.toggle("play-log-with-join-panel", show);
  renderLobbyChrome({ joinVisible: show });
  if (!show) {
    return;
  }

  const awaitingApproval = state.guestSession?.status === "pending" || state.guestSnapshot?.awaitingApproval;
  if (elements.joinClientTitle) {
    elements.joinClientTitle.textContent = guestWaitingRoomMode ? "Find A Seat" : "Join A Table";
  }
  if (elements.joinBackHome) {
    elements.joinBackHome.hidden = false;
    elements.joinBackHome.querySelector("span")?.replaceChildren(document.createTextNode(guestWaitingRoomMode ? "Leave" : "Back"));
    elements.joinBackHome.title = guestWaitingRoomMode ? "Leave this waiting room" : "Back to main menu";
  }
  if (elements.guestWaitingRoomPanel) {
    elements.guestWaitingRoomPanel.hidden = !guestWaitingRoomMode;
  }
  if (elements.guestInvitePanel) {
    elements.guestInvitePanel.hidden = guestWaitingRoomMode;
  }
  if (guestWaitingRoomMode) {
    renderGuestLobbyPreview();
  }
  const joinCharacterCard = document.querySelector(".join-client-character");
  joinCharacterCard?.toggleAttribute("hidden", false);
  const joinCharacterCopy = joinCharacterCard?.querySelector(".join-client-copy");
  if (joinCharacterCopy) {
    joinCharacterCopy.textContent = guestWaitingRoomMode
      ? "Optional: add character notes so the host knows what you are bringing to the table."
      : "Fill this out when you are bringing someone new to the party.";
  }
  document.querySelector(".join-client-actions")?.toggleAttribute("hidden", guestWaitingRoomMode);
  if (elements.joinClientCopy) {
    elements.joinClientCopy.textContent = guestWaitingRoomMode
      ? "Ask for an open character seat. You will see the full table after your friend seats you."
      : "Paste the invite link, add your table name, and request a seat.";
  }
  if (elements.guestWaitingStatus && guestWaitingRoomMode) {
    const selectedSeat = state.guestLobbyPreview?.joinableSeats?.find((seat) => seat.id === state.selectedGuestSeatId);
    elements.guestWaitingStatus.textContent = state.waitingRoomSession?.waitingGuestId
      ? `Waiting as ${state.waitingRoomSession.playerName || "Guest"}${selectedSeat?.name ? ` for ${selectedSeat.name}` : ""}. The host can seat you now.`
      : selectedSeat?.name
        ? `Requesting a seat as ${selectedSeat.name}. Enter your name, then ask to join.`
        : "Choose a seat if one is available, then enter your name and ask to join.";
  }
  if (elements.joinClientStatus) {
    elements.joinClientStatus.hidden = guestWaitingRoomMode;
  }
  if (elements.joinClientStatus && awaitingApproval) {
    elements.joinClientStatus.textContent = "Seat request sent. Waiting for your friend.";
  }
  const savedSession = state.guestSession || state.recentGuestSession;
  if (elements.joinClientInviteLink && savedSession?.inviteLink && !elements.joinClientInviteLink.value) {
    elements.joinClientInviteLink.value = savedSession.inviteLink;
    scheduleJoinPreview(elements.joinClientInviteLink.value, "join", { immediate: true });
  }
  if (elements.joinClientPlayerName && savedSession?.playerName && !elements.joinClientPlayerName.value) {
    elements.joinClientPlayerName.value = savedSession.playerName;
  }
  if (elements.joinClientStatus && state.launchInviteError) {
    elements.joinClientStatus.textContent = state.launchInviteError;
  } else if (elements.joinClientStatus && !awaitingApproval && !state.guestSession && state.recentGuestSession?.inviteLink) {
    elements.joinClientStatus.textContent = launchInviteLink
      ? "Invite loaded. Enter your name, then join the table."
      : "Previous table remembered. Ask for a seat again when it is open.";
  }
  if (elements.joinClientSubmit) {
    elements.joinClientSubmit.textContent = !launchInviteLink && !state.guestSession && state.recentGuestSession?.inviteLink
      ? "Reconnect"
      : "Join Table";
  }
}

function renderCampaignSelector() {
  const campaigns = visibleCampaigns();
  elements.deleteCampaign.disabled = !state.sqlitePath || !state.campaign?.title || isBackendStarterCampaign(state.campaign);

  if (clientMode || isRemoteTableClient()) {
    const option = document.createElement("option");
    option.value = "lorekeeper-join";
    option.textContent = state.campaign?.title ?? "Remote Table";
    option.selected = true;
    elements.campaignSelect.replaceChildren(option);
    elements.campaignSelect.disabled = true;
    elements.deleteCampaign.disabled = true;
    return;
  }

  elements.campaignSelect.disabled = false;

  if (!campaigns.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No saved adventures yet";
    option.selected = true;
    elements.campaignSelect.replaceChildren(option, newCampaignOption());
    elements.campaignSelect.disabled = true;
    elements.deleteCampaign.disabled = true;
    return;
  }

  elements.campaignSelect.disabled = false;
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

function openDeleteCampaignDialog(target = activeCampaignDeleteTarget()) {
  if (!target?.sqlitePath || !target?.title) {
    elements.bridgeStatus.textContent = "No saved adventure to delete";
    return;
  }

  state.pendingDeleteCampaign = target;
  elements.deleteCampaignTitle.textContent = `Delete ${target.title}`;
  elements.deleteCampaignMessage.textContent =
    `This will remove "${target.title}" from LoreKeeper and keep a local backup in case you need to recover it later.`;
  elements.confirmDeleteCampaign.disabled = false;
  elements.deleteCampaignDialog.showModal();
  elements.confirmDeleteCampaign.focus();
}

function activeCampaignDeleteTarget() {
  if (!state.sqlitePath || !state.campaign?.title || isBackendStarterCampaign(state.campaign)) {
    return null;
  }
  return {
    sqlitePath: state.sqlitePath,
    title: state.campaign.title,
  };
}

async function deleteActiveCampaign() {
  const target = state.pendingDeleteCampaign ?? activeCampaignDeleteTarget();
  if (!target?.sqlitePath || !target?.title) {
    elements.bridgeStatus.textContent = "No saved adventure to delete";
    return;
  }
  try {
    elements.bridgeStatus.textContent = "Deleting campaign...";
    const response = await fetch(apiDeleteCampaignUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        sqlitePath: target.sqlitePath,
        campaignTitle: target.title,
      }),
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    const payload = await response.json();
    state.pendingDeleteCampaign = null;
    setCampaignFromPayload(payload, "campaign_deleted_context");
    seedPlayLog();
    render();
    elements.deleteCampaignDialog.close();
    elements.bridgeStatus.textContent = payload.deletedCampaignBackup?.directory
      ? "Adventure removed; local backup kept"
      : "Adventure removed";
  } catch (error) {
    elements.bridgeStatus.textContent = error instanceof Error ? `Delete failed: ${error.message}` : "Delete failed";
  }
}

async function importProviderResponse(responseText, options = {}) {
  if (!responseText) {
    elements.bridgeStatus.textContent = "Paste a DM response first";
    setProviderActivity("Paste a DM response first", "idle");
    return;
  }

  const extraction = extractLorekeeperUpdates(responseText);
  const cleanedText = cleanProviderResponseForPlay(responseText);
  const tableMessages = splitProviderTableMessages(cleanedText, state.campaign, extraction.proposedChanges, {
    isHostControlledPartyRecord,
    partyControllerKind,
    onHostCharacterSuppressed: ({ name, body }) => pushDiagnosticsEvent("host_character_autopost_suppressed", {
      name,
      body,
    }),
  });
  const importPlan = buildProviderImportPlan({
    campaign: state.campaign,
    responseText,
    cleanedText,
    extraction,
    tableMessages,
    options,
    labelForActor: labelById,
  });
  for (const { message, data } of importPlan.messagePlans) {
    await appendPlayMessage({
      ...message,
      meta: cleanMessageMeta(message.meta || options.meta || ""),
      source: options.source ? `${options.source}_response` : message.source,
      data,
    });
  }

  const { proposedChanges, reviewBatch } = importPlan;
  state.reviewBatch = reviewBatch.proposedChanges.length > 0 ? reviewBatch : null;
  const autoCommitResult = options.autoCommit ? await autoCommitReviewBatch(reviewBatch) : null;

  elements.responseImport.value = "";
  if (extraction.error) {
    pushDiagnosticsEvent("provider_import_warning", {
      source: options.source || "manual_import",
      error: extraction.error,
      responseChars: responseText.length,
    });
  }
  const importOutcome = buildProviderImportOutcome({
    extractionError: extraction.error,
    autoCommitAppliedCount: autoCommitResult?.applied?.length ?? 0,
    proposedChangesCount: proposedChanges.length,
    source: options.source || "provider",
  });
  elements.bridgeStatus.textContent = importOutcome.bridgeStatus;
  setProviderActivity(importOutcome.activityText, importOutcome.activityState);
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
  const safeBatch = prepareAutoCommitReviewBatch(reviewBatch);
  return safeBatch ? commitExtractedChanges(safeBatch) : null;
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

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function commitExtractedChanges(reviewBatch) {
  try {
    elements.bridgeStatus.textContent = "Saving table memory...";
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
    elements.bridgeStatus.textContent = `${result.applied.length} table change${result.applied.length === 1 ? "" : "s"} saved`;
    render();
    return result;
  } catch (error) {
    elements.bridgeStatus.textContent = "Table memory save failed; DM response was still added";
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

async function ensureCampaignChatSession({ openIfMissing = false, focusProvider = false, forceNewConversation = false } = {}) {
  const probe = await probeExtensionBridge();
  if (!probe.available) {
    state.bridge = {
      mode: "manual",
      ready: false,
      lastRun: null,
      lastImportedProviderText: state.bridge.lastImportedProviderText,
    };
    elements.bridgeStatus.textContent = "ChatGPT helper not connected; reload the browser helper";
    setProviderActivity("ChatGPT helper unavailable; DM Instructions are ready for handoff", "error");
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
    elements.bridgeStatus.textContent = "Checking ChatGPT DM conversation...";
    setProviderActivity("Checking ChatGPT DM...", "working");
    const result = await sendExtensionMessage(message, 35000);
    return handleCompanionCheckResult(result);
  } catch (error) {
    state.bridge = {
      mode: "manual",
      ready: false,
      lastRun: null,
      lastImportedProviderText: state.bridge.lastImportedProviderText,
    };
    elements.bridgeStatus.textContent = "ChatGPT helper not connected; reload the browser helper";
    setProviderActivity("ChatGPT helper unavailable; DM Instructions are ready for handoff", "error");
    return {
      ready: false,
      error: error instanceof Error ? error.message : "Extension bridge unavailable.",
    };
  }
}

async function startNewProviderConversation() {
  try {
    elements.bridgeStatus.textContent = "Preparing a new ChatGPT DM chat...";
    setProviderActivity("Preparing a new ChatGPT DM chat...", "working");
    const response = await fetch(apiProviderConversationUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        providerId: defaultCompanionOptions.providerId,
        projectHint: state.campaign.providerSettings?.projectHint || defaultCompanionOptions.projectHint,
        status: "planned",
        notes: "Fresh provider conversation requested from LoreKeeper UI.",
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
    elements.bridgeStatus.textContent = `Opening new ChatGPT DM: ${conversation.conversationHint}`;
    setProviderActivity(`Opening ChatGPT DM for ${conversation.conversationHint}...`, "working");
    render();
    const result = await ensureCampaignChatSession({
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
    setProviderActivity("New DM chat failed", "error");
  }
}

async function bootstrapProviderConversation() {
  const conversation = getActiveProviderConversation(state.campaign, defaultCompanionOptions.providerId);
  const prompt = [
    "# LoreKeeper Campaign Chat Bootstrap",
    "",
    `This provider chat is for the LoreKeeper campaign: ${conversation.conversationHint}.`,
    `Campaign title: ${state.campaign.title}.`,
    `Local campaign id: ${state.campaign.id}.`,
    "",
    "Please name or summarize this chat using that campaign name and id if your UI supports it.",
    "Do not add campaign canon from this bootstrap message.",
    "LoreKeeper SQLite is the source of truth; provider chat history is only scratch memory.",
    "",
    "Reply with one short sentence confirming the DM chat is ready.",
  ].join("\n");

  try {
    elements.bridgeStatus.textContent = `Preparing DM chat for ${conversation.conversationHint}...`;
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

    elements.bridgeStatus.textContent = `ChatGPT DM ready for ${conversation.conversationHint}`;
    setProviderActivity(`ChatGPT DM ready: ${conversation.conversationHint}`, "idle");
  } catch (error) {
    elements.bridgeStatus.textContent = error instanceof Error
      ? `ChatGPT DM opened; setup failed: ${error.message}`
      : "ChatGPT DM opened; setup failed";
    setProviderActivity("ChatGPT DM opened; setup needs a handoff", "error");
  }
}

async function runPromptThroughCampaignChat(prompt) {
  if (!prompt.trim()) {
    elements.bridgeStatus.textContent = "Build a DM turn first";
    setProviderActivity("Build a DM turn first", "idle");
    return { providerReceived: false };
  }

  let baselineProviderText = "";

  try {
    const probe = await probeExtensionBridge();
    if (!probe.available) {
      const fallback = buildCampaignChatFallbackPlan(campaignChatFallbackReasons.EXTENSION_UNAVAILABLE);
      await copyPromptToClipboard(prompt, fallback.copy);
      state.bridge = {
        mode: fallback.bridgeMode,
        ready: false,
        lastRun: null,
        lastImportedProviderText: state.bridge.lastImportedProviderText,
      };
      setProviderActivity(fallback.activityText, fallback.activityState);
      return { providerReceived: false };
    }

    const baselineResponse = await readLatestCompanionResponse().catch(() => null);
    baselineProviderText = baselineResponse?.text ?? "";
    elements.bridgeStatus.textContent = "Sending turn to ChatGPT DM...";
    setProviderActivity("Submitting turn to ChatGPT...", "working");
    const progress = startProviderChatProgress();
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
      setProviderActivity("ChatGPT DM answered; bringing it to the table...", "working");
      await importProviderResponse(result.response.text);
      return { providerReceived: true, imported: true };
    }

    if (result.response?.needsManualSubmit) {
      elements.bridgeStatus.textContent = "Prompt is in ChatGPT DM; press the send arrow";
      setProviderActivity("Prompt inserted in ChatGPT; press send in the ChatGPT tab", "waiting");
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
      const fallback = buildCampaignChatFallbackPlan(campaignChatFallbackReasons.LOGIN_REQUIRED);
      await copyPromptToClipboard(prompt, fallback.copy);
      setProviderActivity(fallback.activityText, fallback.activityState);
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

    const noResponseFallback = buildCampaignChatFallbackPlan(campaignChatFallbackReasons.NO_RESPONSE);
    await copyPromptToClipboard(prompt, noResponseFallback.copy);
    setProviderActivity(noResponseFallback.activityText, noResponseFallback.activityState);
    return { providerReceived: Boolean(result.sent) };
  } catch (error) {
    stopProviderChatProgress();
    const recovered = await importLatestProviderResponse({
      newerThanText: baselineProviderText,
      quietIfUnchanged: true,
    }).catch(() => null);
    if (recovered?.imported) {
      setProviderActivity("Recovered ChatGPT response after bridge timeout", "idle");
      return { providerReceived: true, imported: true, recovered: true };
    }

    const failureFallback = buildCampaignChatFallbackPlan(campaignChatFallbackReasons.RUN_FAILED);
    await copyPromptToClipboard(prompt, failureFallback.copy);
    state.bridge = {
      mode: failureFallback.bridgeMode,
      ready: false,
      lastRun: null,
      lastImportedProviderText: state.bridge.lastImportedProviderText,
    };
    setProviderActivity(failureFallback.activityText, failureFallback.activityState);
    render();
    return { providerReceived: false, error };
  }
}

async function runPromptThroughLocalProvider(turn) {
  // Danger zone: provider orchestration is extracted, but renderer still imports
  // accepted results into play-log/review/recovery surfaces. Future target:
  // ProviderOrchestrator should own table/session envelopes end to end.
  if (!turn?.playerMessage?.trim() && !turn?.playerInputs?.length) {
    setProviderActivity("Build a table turn first", "idle");
    return { providerReceived: false };
  }

  const generationCampaignId = state.campaign?.id ?? null;
  state.turnFlow.beginLogicalTurn({
    campaign: state.campaign,
    turn,
    inputKind: /^\(DM nudge:/i.test(turn.playerMessage) ? "nudge" : "player",
    actorId: state.campaign?.combat?.currentTurnId ?? null,
  });
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
    renderTableActions();
    const result = await run.promise;
    if (generationCampaignId && state.campaign?.id !== generationCampaignId) {
      setProviderActivity("Ignored provider response from previous campaign", "idle");
      pushDiagnosticsEvent("ollama_generation_ignored_campaign_changed", {
        turnId: turn.turnId,
        originalCampaignId: generationCampaignId,
        currentCampaignId: state.campaign?.id ?? null,
      });
      return { providerReceived: Boolean(result?.providerReceived), ignored: true, reason: "campaign_changed" };
    }
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

function cancelActiveGeneration() {
  state.turnFlow.cancelGeneration("user_cancelled");
}

function setTurnRepair(repair) {
  const savedRepair = state.turnFlow.setRepair(repair);
  pushDiagnosticsEvent("turn_repair_required", summarizeTurnRepair(savedRepair));
  elements.bridgeStatus.textContent = turnRepairStatusText(savedRepair);
  setProviderActivity(turnRepairActivityText(savedRepair), "error");
  render();
}

function clearTurnRepair() {
  state.turnFlow.clearRepair();
  renderTableActions();
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
    setProviderActivity("No DM response is available to try again", "error");
    return;
  }
  const retryMessage = await markRepairTurnRetrying(repair);
  setProviderActivity("DM is reconsidering the response...", "working");
  state.turnFlow.retryLastTurn();
  renderTableActions();
  const runResult = await runPromptThroughLocalProvider(repair.turn);
  if (retryMessage?.id) {
    await updatePlayerTurnEchoLifecycle(retryMessage.id, {
      ...runResult,
      recovered: true,
    });
  }
}

async function markRepairTurnRetrying(repair) {
  const message = findPlayerTurnMessageForRepair(repair);
  if (!message?.id) {
    return null;
  }
  await patchPlayMessage(message.id, {
    data: {
      status: "turn_retrying",
      lifecycle: "retrying",
      repairReason: repair.reason || "",
      repairRetryStartedAt: new Date().toISOString(),
    },
  });
  return message;
}

function findPlayerTurnMessageForRepair(repair) {
  const turnId = repair?.turn?.turnId || repair?.turn?.id || "";
  if (!turnId) {
    return null;
  }
  for (let index = state.playMessages.length - 1; index >= 0; index -= 1) {
    const message = state.playMessages[index];
    if (message.role === "player" && message.data?.turnId === turnId) {
      return message;
    }
  }
  return null;
}

async function inspectTurnRepair() {
  if (!activeTurnRepair()) {
    return;
  }
  openSetupDialog({ tab: "troubleshooting", mode: "recovery" });
  await refreshDiagnostics();
  setProviderActivity("DM response review is open", "waiting");
}

async function importTurnRepairAnyway() {
  // Manual repair fallback stays local to the renderer because it is a host UI
  // escape hatch. Future target: a guided recovery flow without raw response
  // import controls in normal play.
  const repair = activeTurnRepair();
  if (!repair?.responseText) {
    setProviderActivity("No reviewed DM response is available", "error");
    return;
  }
  if (isHardBlockedTurnRepair(repair)) {
    setProviderActivity(turnRepairBlockedMessage(repair), "error");
    await inspectTurnRepair();
    return;
  }

  const confirmed = await confirmInApp(turnRepairUseAnywayDialog());
  if (!confirmed) {
    setProviderActivity("DM response kept for review", "waiting");
    return;
  }

  clearTurnRepair();
  await importProviderResponse(repair.responseText, turnRepairImportOptions(repair));
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
  // Bridge/manual-provider import still lands here because it depends on the
  // browser extension sidecar. Future target: provider import service with the
  // same table/session ownership checks as local generation.
  newerThanText = "",
  requireNewerThanLastImport = false,
  quietIfUnchanged = false,
} = {}) {
  setProviderActivity("Reading latest DM response...", "working");
  const latest = await readLatestCompanionResponse();
  const latestText = latest?.text?.trim() ?? "";

  const decision = decideLatestProviderImport({
    latestText,
    newerThanText,
    lastImportedProviderText: state.bridge.lastImportedProviderText || "",
    requireNewerThanLastImport,
  });

  if (decision.action === "skip") {
    if (!(quietIfUnchanged && decision.reason === "unchanged")) {
      elements.bridgeStatus.textContent = decision.bridgeStatus;
      setProviderActivity(decision.activityText, decision.activityState);
    }
    return { imported: false, reason: decision.reason };
  }

  elements.bridgeStatus.textContent = decision.bridgeStatus;
  setProviderActivity(decision.activityText, decision.activityState);
  await importProviderResponse(decision.text);
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
    elements.bridgeStatus.textContent = messages.emptyMessage ?? "No DM turn ready";
    return false;
  }

  try {
    if (await writeClipboardText(prompt)) {
      elements.bridgeStatus.textContent = messages.successMessage ?? "Prompt copied";
      setProviderActivity(messages.successMessage ?? "Prompt copied", "idle");
      return true;
    }
  } catch {
    // Handled below as a visible fallback.
  }
  elements.bridgeStatus.textContent = messages.failureMessage ?? "Clipboard blocked; prompt is in the drawer";
  setProviderActivity(messages.failureMessage ?? "Clipboard blocked; prompt is in the drawer", "error");
  openPromptDrawer();
  return false;
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
  renderSessionHealthSummary(bundle?.renderer?.sessionHealth);
  renderTableTimelineSummary(bundle?.renderer?.tableTimeline ?? []);
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
    if (!(await writeClipboardText(text))) {
      throw new Error("Clipboard write failed.");
    }
    elements.diagnosticsStatus.textContent = "Copied";
    setProviderActivity("Table details copied", "idle");
  } catch {
    elements.diagnosticsStatus.textContent = "Copy blocked";
    setProviderActivity("Copy blocked; table details are visible in Settings", "error");
  }
}

async function buildDiagnosticsSnapshot() {
  const renderer = buildRendererDiagnostics();
  if (clientMode) {
    return {
      generatedAt: new Date().toISOString(),
      mode: "join",
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

function installInternalDebugHarness() {
  const harness = {
    version: 1,
    diagnostics: () => buildDiagnosticsSnapshot(),
    renderer: () => buildRendererDiagnostics(),
    tableSession: () => state.tableSession ?? buildCurrentTableSessionProjection(),
    turnProjection: () => state.turnFlow.getProjection(),
    commitPendingReview: async () => {
      if (!state.reviewBatch?.proposedChanges?.length) {
        return { committed: false, reason: "no_pending_review" };
      }
      const result = await commitExtractedChanges(state.reviewBatch);
      return {
        committed: Boolean(result),
        applied: result?.applied?.length ?? 0,
      };
    },
    submitPlayerTurn: async (input) => {
      const text = String(input && typeof input === "object" ? input.text ?? "" : input ?? "");
      const beforeMessage = state.currentTurn?.playerMessage ?? "";
      const result = await submitPlayerTurnFromInput(text);
      return {
        ...result,
        debug: {
          textLength: text.trim().length,
          beforeMessage,
          afterMessage: state.currentTurn?.playerMessage ?? "",
          activeGeneration: hasActiveGeneration(),
          bridgeStatus: elements.bridgeStatus?.textContent ?? "",
        },
      };
    },
    recentEvents: (limit = 80) => state.diagnosticsEvents.slice(-Math.max(1, Math.min(Number(limit) || 80, 200))),
    recentTimeline: (limit = 80) => state.tableTimeline.slice(-Math.max(1, Math.min(Number(limit) || 80, 200))),
    setPlayLogVisibleLimit: (limit = defaultPlayLogVisibleLimit) => {
      state.playLogVisibleLimit = Math.max(1, Number(limit) || defaultPlayLogVisibleLimit);
      renderPlayLog();
      return state.playLogVisibleLimit;
    },
    seedPlayLogMessages: (messages = []) => {
      state.playMessages = normalizeDebugPlayMessages(messages);
      if (state.campaign) {
        state.campaign = {
          ...state.campaign,
          sessionLog: {
            ...(state.campaign.sessionLog ?? {}),
            messages: state.playMessages,
          },
        };
      }
      state.forceScrollToBottom = true;
      renderPlayLog();
      return state.playMessages.length;
    },
    appendPlayLogMessages: (messages = []) => {
      state.playMessages.push(...normalizeDebugPlayMessages(messages, state.playMessages.length));
      if (state.campaign) {
        state.campaign = {
          ...state.campaign,
          sessionLog: {
            ...(state.campaign.sessionLog ?? {}),
            messages: state.playMessages,
          },
        };
      }
      renderPlayLog();
      return state.playMessages.length;
    },
    stateSummary: () => ({
      campaignId: state.campaign?.id || "",
      campaignTitle: state.campaign?.title || "",
      sourceMode: state.sourceMode,
      homeFlow: state.homeFlow,
      clientMode,
      activeGeneration: hasActiveGeneration(),
      repair: summarizeTurnRepair(activeTurnRepair()),
      tablePhase: state.tableSession?.phase || "",
      playMessages: state.playMessages.length,
    }),
    openSurface: (surface = "app") => {
      const key = String(surface || "app").toLowerCase();
      const targets = {
        app: { tab: "app", mode: "app" },
        preferences: { tab: "app", mode: "app" },
        dm: { tab: "ai", mode: "ai" },
        "dm-voice": { tab: "ai", mode: "ai" },
        friends: { tab: "friends", mode: "table" },
        table: { tab: "friends", mode: "table" },
        troubleshooting: { tab: "troubleshooting", mode: "troubleshooting" },
        diagnostics: { tab: "troubleshooting", mode: "troubleshooting" },
        recovery: { tab: "troubleshooting", mode: "recovery" },
      };
      const target = targets[key] ?? targets.app;
      openSetupDialog(target);
      return target;
    },
  };
  Object.defineProperty(window, "__lorekeeperDebug", {
    value: harness,
    configurable: true,
  });
}

function normalizeDebugPlayMessages(messages = [], offset = 0) {
  return (Array.isArray(messages) ? messages : []).map((message, index) => {
    const role = message.role || (index % 2 === 0 ? "player" : "dm");
    return {
      id: message.id || `debug-message-${offset + index + 1}`,
      sessionId: message.sessionId || state.campaign?.activeSessionId || "debug-session",
      role,
      title: message.title || (role === "player" ? "Harness Player" : "DM"),
      body: message.body || `Harness table message ${offset + index + 1}.`,
      meta: cleanMessageMeta(message.meta || ""),
      source: message.source || "debug_harness",
      data: message.data || {},
      createdAt: message.createdAt || new Date(Date.now() + index).toISOString(),
    };
  });
}

function renderTableTimelineSummary(timeline = []) {
  if (!elements.tableTimelineSummary) {
    return;
  }
  const recent = Array.isArray(timeline) ? timeline.slice(-8).reverse() : [];
  if (!recent.length) {
    const empty = document.createElement("p");
    empty.textContent = "No table timeline yet.";
    elements.tableTimelineSummary.replaceChildren(empty);
    return;
  }

  const list = document.createElement("ol");
  list.className = "table-timeline-list";
  for (const event of recent) {
    const item = document.createElement("li");
    const label = document.createElement("span");
    label.className = "table-timeline-label";
    label.textContent = event.label || event.message || event.type || "Table event";
    const time = document.createElement("time");
    time.dateTime = event.at || "";
    time.textContent = formatMessageTime(event.at);
    item.append(label, time);
    list.append(item);
  }
  elements.tableTimelineSummary.replaceChildren(list);
}

function buildRendererDiagnostics() {
  const tableSession = state.tableSession ?? buildCurrentTableSessionProjection();
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
    tableSession,
    debugSnapshot: buildTableDebugSnapshot({
      campaign: state.campaign,
      tableSession,
      turnProjection: state.turnFlow?.getProjection?.() ?? null,
      currentTurn: state.currentTurn,
      providerActivity: {
        text: elements.providerActivityLabel?.textContent || "",
        state: elements.providerActivity?.dataset.state || "",
        phase: elements.providerActivity?.dataset.phase || "",
      },
      reviewBatch: state.reviewBatch,
      repair: activeTurnRepair(),
      multiplayer: effectiveMultiplayerState(),
      guestSession: state.guestSession,
      guestSnapshot: state.guestSnapshot,
      recentErrors: state.diagnosticsEvents,
    }),
    sessionHealth: buildSessionHealthSummary(),
    recentPlayMessages: state.playMessages.slice(-30),
    tableTimeline: state.tableTimeline.slice(-80),
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

function renderSessionHealthSummary(summary = buildSessionHealthSummary()) {
  if (!elements.sessionHealthSummary) {
    return;
  }
  const headline = document.createElement("strong");
  headline.textContent = summary.headline || "Table Ready";
  const lines = Array.isArray(summary.lines) && summary.lines.length
    ? summary.lines
    : ["No blockers detected."];
  const list = document.createElement("ul");
  list.replaceChildren(
    ...lines.slice(0, 6).map((line) => {
      const item = document.createElement("li");
      item.textContent = line;
      return item;
    }),
  );
  elements.sessionHealthSummary.dataset.tone = summary.tone || "ready";
  elements.sessionHealthSummary.dataset.phase = summary.phase || summary.tableSession?.phase || "";
  elements.sessionHealthSummary.replaceChildren(headline, list);
}

function buildSessionHealthSummary() {
  const tableSession = state.tableSession ?? refreshTableSessionProjection();
  return {
    headline: tableSession.headline,
    tone: tableSession.tone,
    phase: tableSession.phase,
    lines: tableSession.lines?.length ? tableSession.lines : ["No blockers detected."],
    tableSession,
  };
}

function refreshTableSessionProjection() {
  state.tableSession = buildCurrentTableSessionProjection();
  if (elements.providerActivity) {
    elements.providerActivity.dataset.tablePhase = state.tableSession.phase;
    elements.providerActivity.dataset.expectedActor = state.tableSession.expectedActor?.kind || "";
  }
  renderTableFocus(state.tableSession);
  return state.tableSession;
}

function renderTableFocus(tableSession = null) {
  applyTableFocusProjection(elements, buildTableFocusProjection(tableSession));
}

function buildCurrentTableSessionProjection() {
  const providerState = elements.providerActivity?.dataset.state || "idle";
  return buildTableSessionProjection({
    campaign: state.campaign,
    turnProjection: state.turnFlow?.getProjection?.() ?? null,
    providerActivity: {
      text: (elements.providerActivityLabel?.textContent || "").trim(),
      raw: elements.providerActivityLabel?.title || "",
      state: providerState,
      phase: elements.providerActivity?.dataset.phase || providerState,
    },
    reviewBatch: state.reviewBatch,
    repair: activeTurnRepair(),
    multiplayer: effectiveMultiplayerState(),
    guestSession: state.guestSession,
    guestSnapshot: state.guestSnapshot,
    clientMode,
  });
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

function pushTableTimelineEvent(type, detail = {}) {
  const event = tableTimelineEvent(type, detail);
  state.tableTimeline.push(event);
  if (state.tableTimeline.length > 120) {
    state.tableTimeline.splice(0, state.tableTimeline.length - 120);
  }
  return event;
}

function handleTurnFlowVisibilityEvent(event = {}) {
  const type = event.type || "turn_state_changed";
  const label = tableLabelForTurnEvent(type, event);
  if (!label) {
    return;
  }
  pushTableTimelineEvent(type, {
    message: label,
    turnId: event.turnId || event.projection?.turnId || "",
    requestId: event.requestId || event.projection?.activeRequestId || "",
    reason: event.reason || event.error || "",
  });
}

function tableLabelForTurnEvent(type, event = {}) {
  if (type === "turn_locked") return "Turn submitted; DM is resolving it.";
  if (type === "generation_started") return "DM started thinking.";
  if (type === "generation_completed") return "DM response received.";
  if (type === "generation_cancelled") return "DM response canceled.";
  if (type === "generation_failed") return "DM response failed; retry is available.";
  if (type === "turn_retrying") return "Retrying the DM response.";
  if (type === "turn_repair_required") return "DM response needs review.";
  if (type === "turn_repair_cleared") return "DM response review cleared.";
  if (type === "turn_flow_reset") {
    return event.reason === "campaign_changed"
      ? "Campaign switched; table state reset."
      : "Table turn state reset.";
  }
  return "";
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
  const tableStatus = tableStatusForActivity(message, status);
  const visibleMessage = tableStatus.text;

  if (elements.providerActivityLabel) {
    elements.providerActivityLabel.textContent = visibleMessage;
    elements.providerActivityLabel.title = tableStatus.raw && tableStatus.raw !== visibleMessage
      ? `${visibleMessage}\n\nDetail: ${tableStatus.raw}`
      : visibleMessage;
  } else {
    elements.providerActivity.textContent = visibleMessage;
    elements.providerActivity.title = tableStatus.raw && tableStatus.raw !== visibleMessage
      ? `${visibleMessage}\n\nDetail: ${tableStatus.raw}`
      : visibleMessage;
  }
  elements.providerActivity.dataset.state = status;
  elements.providerActivity.dataset.phase = tableStatus.phase;
  refreshTableSessionProjection();
  if (visibleMessage && visibleMessage !== state.lastTableStatusText) {
    state.lastTableStatusText = visibleMessage;
    pushTableTimelineEvent("table_status_changed", {
      message: visibleMessage,
      rawMessage: tableStatus.raw,
      phase: tableStatus.phase,
      tablePhase: state.tableSession.phase,
      status,
    });
  }
  renderTableActions();
  renderInputComposer(state.tableSession);
}

function setupSavedLayoutResizers() {
  setLeftRailWidth(readStoredLayoutSize(leftRailWidthStorageKey, 234), false);
  setRightRailWidth(readStoredLayoutSize(rightRailWidthStorageKey, 232), false);
  setCampaignNotesHeight(readStoredLayoutSize(campaignNotesHeightStorageKey, 432), false);
  setPlayerNotesHeight(readStoredLayoutSize(playerNotesHeightStorageKey, 308), false);
  setTableTalkHeight(readStoredLayoutSize(tableTalkHeightStorageKey, 244), false);

  setupHorizontalRailResize({
    handle: elements.leftRailResizeHandle,
    storageKey: leftRailWidthStorageKey,
    current: currentLeftRailWidth,
    set: setLeftRailWidth,
    direction: 1,
  });
  setupHorizontalRailResize({
    handle: elements.rightRailResizeHandle,
    storageKey: rightRailWidthStorageKey,
    current: currentRightRailWidth,
    set: setRightRailWidth,
    direction: -1,
  });
  setupVerticalPanelResize({
    handle: elements.campaignNotesResizeHandle,
    panelSelector: ".campaign-notes-panel",
    storageKey: campaignNotesHeightStorageKey,
    current: currentCampaignNotesHeight,
    set: setCampaignNotesHeight,
    direction: 1,
  });
  setupVerticalPanelResize({
    handle: elements.playerNotesResizeHandle,
    panelSelector: ".player-notes-panel",
    storageKey: playerNotesHeightStorageKey,
    current: currentPlayerNotesHeight,
    set: setPlayerNotesHeight,
    direction: 1,
  });
  setupVerticalPanelResize({
    handle: elements.tableTalkResizeHandle,
    panelSelector: ".table-talk-section",
    storageKey: tableTalkHeightStorageKey,
    current: currentTableTalkHeight,
    set: setTableTalkHeight,
    direction: -1,
  });

  window.addEventListener("resize", () => {
    setLeftRailWidth(currentLeftRailWidth(), true);
    setRightRailWidth(currentRightRailWidth(), true);
    setCampaignNotesHeight(currentCampaignNotesHeight(), true);
    setPlayerNotesHeight(currentPlayerNotesHeight(), true);
    setTableTalkHeight(currentTableTalkHeight(), true);
  });
}

function setupHorizontalRailResize({ handle, storageKey, current, set, direction }) {
  if (!handle) {
    return;
  }

  let startX = 0;
  let startWidth = 0;

  handle.addEventListener("pointerdown", (event) => {
    startX = event.clientX;
    startWidth = current();
    handle.setPointerCapture(event.pointerId);
    elements.app?.classList.add("resizing-layout");
    event.preventDefault();
  });

  handle.addEventListener("pointermove", (event) => {
    if (!handle.hasPointerCapture(event.pointerId)) {
      return;
    }
    set(startWidth + ((event.clientX - startX) * direction), true);
  });

  const finish = (event) => {
    if (event?.pointerId !== undefined && handle.hasPointerCapture(event.pointerId)) {
      handle.releasePointerCapture(event.pointerId);
    }
    elements.app?.classList.remove("resizing-layout");
    localStorage.setItem(storageKey, String(current()));
  };

  handle.addEventListener("pointerup", finish);
  handle.addEventListener("pointercancel", finish);
  handle.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }
    event.preventDefault();
    const delta = event.key === "ArrowRight" ? 12 : -12;
    set(current() + (delta * direction), true);
  });
}

function setupVerticalPanelResize({ handle, panelSelector, storageKey, current, set, direction }) {
  if (!handle) {
    return;
  }

  let startY = 0;
  let startHeight = 0;

  handle.addEventListener("pointerdown", (event) => {
    startY = event.clientY;
    startHeight = current();
    handle.setPointerCapture(event.pointerId);
    elements.app?.classList.add("resizing-layout");
    document.querySelector(panelSelector)?.classList.add("resizing");
    event.preventDefault();
  });

  handle.addEventListener("pointermove", (event) => {
    if (!handle.hasPointerCapture(event.pointerId)) {
      return;
    }
    set(startHeight + ((event.clientY - startY) * direction), true);
  });

  const finish = (event) => {
    if (event?.pointerId !== undefined && handle.hasPointerCapture(event.pointerId)) {
      handle.releasePointerCapture(event.pointerId);
    }
    elements.app?.classList.remove("resizing-layout");
    document.querySelector(panelSelector)?.classList.remove("resizing");
    localStorage.setItem(storageKey, String(current()));
  };

  handle.addEventListener("pointerup", finish);
  handle.addEventListener("pointercancel", finish);
  handle.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
      return;
    }
    event.preventDefault();
    const delta = event.key === "ArrowUp" ? 12 : -12;
    set(current() + (delta * -direction), true);
  });
}

function readStoredLayoutSize(key, fallback) {
  const raw = localStorage.getItem(key);
  if (raw === null || raw === "") {
    return fallback;
  }
  const stored = Number(raw);
  return Number.isFinite(stored) ? stored : fallback;
}

function currentLeftRailWidth() {
  return currentRootPixelVar("--left-rail-width", 234);
}

function currentRightRailWidth() {
  return currentRootPixelVar("--right-rail-width", 232);
}

function currentCampaignNotesHeight() {
  return currentRootPixelVar("--campaign-notes-height", 432);
}

function currentPlayerNotesHeight() {
  return currentRootPixelVar("--player-notes-height", 308);
}

function currentTableTalkHeight() {
  return currentRootPixelVar("--table-talk-height", 244);
}

function currentRootPixelVar(name, fallback) {
  const rawValue = getComputedStyle(document.documentElement).getPropertyValue(name);
  const parsed = Number.parseFloat(rawValue);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function setLeftRailWidth(value, persist = false) {
  setLayoutPixelVar("--left-rail-width", clampLeftRailWidth(value), leftRailWidthStorageKey, persist);
}

function setRightRailWidth(value, persist = false) {
  setLayoutPixelVar("--right-rail-width", clampRightRailWidth(value), rightRailWidthStorageKey, persist);
}

function setCampaignNotesHeight(value, persist = false) {
  setLayoutPixelVar("--campaign-notes-height", clampRightPanelHeight(value, 176), campaignNotesHeightStorageKey, persist);
}

function setPlayerNotesHeight(value, persist = false) {
  setLayoutPixelVar("--player-notes-height", clampRightPanelHeight(value, 168), playerNotesHeightStorageKey, persist);
}

function setTableTalkHeight(value, persist = false) {
  setLayoutPixelVar("--table-talk-height", clampTableTalkHeight(value), tableTalkHeightStorageKey, persist);
}

function setLayoutPixelVar(name, value, storageKey, persist) {
  document.documentElement.style.setProperty(name, `${value}px`);
  if (persist) {
    localStorage.setItem(storageKey, String(value));
  }
}

function clampLeftRailWidth(value) {
  return clampLayoutNumber(value, 204, maxRailWidth());
}

function clampRightRailWidth(value) {
  return clampLayoutNumber(value, 212, maxRailWidth());
}

function clampTableTalkHeight(value) {
  return clampRightPanelHeight(value, 160);
}

function clampRightPanelHeight(value, min = 160) {
  const maxHeight = Math.max(min + 60, Math.round(window.innerHeight * 0.62));
  return clampLayoutNumber(value, min, maxHeight);
}

function maxRailWidth() {
  return Math.max(260, Math.min(420, Math.round(window.innerWidth * 0.28)));
}

function clampLayoutNumber(value, min, max) {
  return Math.min(max, Math.max(min, Math.round(Number(value) || min)));
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
  const raw = localStorage.getItem(commandDeckHeightStorageKey);
  if (raw === null || raw === "") {
    return 120;
  }
  const stored = Number(raw);
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

function startProviderChatProgress() {
  stopProviderChatProgress();
  activeProgressTimers = buildCampaignChatProgressSteps().map((step) => window.setTimeout(() => {
    elements.bridgeStatus.textContent = step.bridgeStatus;
    setProviderActivity(step.activityText, step.activityState);
  }, step.delayMs));

  return {
    stop: stopProviderChatProgress,
  };
}

function stopProviderChatProgress() {
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
      ? `ChatGPT DM opened for ${result.settings?.conversationHint ?? "this campaign"}`
      : `ChatGPT DM ready for ${result.settings?.conversationHint ?? "this campaign"}`;
    setProviderActivity(`ChatGPT DM ready: ${result.settings?.conversationHint ?? state.campaign.title}`, "idle");
  } else if (result.loginRequired) {
    elements.bridgeStatus.textContent = "ChatGPT needs login, project selection, or DM chat selection";
    setProviderActivity("ChatGPT needs login or DM chat selection", "error");
  } else {
    elements.bridgeStatus.textContent = "No ChatGPT DM conversation found";
    setProviderActivity("No ChatGPT DM conversation found", "idle");
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
      reject(new Error("LoreKeeper extension did not respond."));
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
        reject(new Error(event.data.error ?? "LoreKeeper extension bridge failed."));
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
  // Play-log rendering is bounded by buildPlayLogProjection, but DOM ownership
  // still lives here because message actions call renderer-local handlers.
  // Future target: message components/actions backed by pure lifecycle policies.
  const playLog = elements.playLog;
  const wasNearBottom = isPlayLogNearBottom(playLog);
  const previousScrollBottom = playLog.scrollHeight - playLog.scrollTop;
  const messages = state.streamingMessage
    ? [...state.playMessages, state.streamingMessage]
    : state.playMessages;
  const visibleMessages = dedupeProviderPartySuggestions(
    messages.filter((message) => !shouldHideAutonomousHostMessage(message)),
  );
  const projection = buildPlayLogProjection(visibleMessages, {
    visibleLimit: state.playLogVisibleLimit,
  });

  playLog.replaceChildren(
    ...(projection.hasEarlierMessages ? [renderLoadEarlierMessages(projection)] : []),
    ...projection.visibleMessages.map((message) => {
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
      const lifecycle = buildMessageLifecycleProjection(message);
      if (lifecycle) {
        const lifecycleBadge = document.createElement("small");
        lifecycleBadge.className = `message-lifecycle ${lifecycle.tone}`;
        lifecycleBadge.textContent = lifecycle.label;
        lifecycleBadge.title = lifecycle.title;
        bubble.append(lifecycleBadge);
      }
      const cleanedMeta = cleanMessageMeta(message.meta);
      if (cleanedMeta && shouldShowDebugMessageMeta()) {
        const meta = document.createElement("small");
        meta.className = "message-meta";
        meta.textContent = `Meta: ${cleanedMeta}`;
        bubble.append(meta);
      }
      const pendingAction = buildPendingInputActionProjection(
        message,
        state.campaign.multiplayer?.pendingTurnInputs ?? [],
      );
      if (pendingAction) {
        const actionRow = document.createElement("div");
        actionRow.className = "message-actions";
        if (pendingAction.kind === "drop") {
          const status = document.createElement("span");
          status.className = "message-action-status";
          status.textContent = pendingAction.status;
          actionRow.append(status);
          if (!clientMode) {
            const dropButton = document.createElement("button");
            dropButton.type = "button";
            dropButton.className = "mini-action secondary-action";
            dropButton.textContent = pendingAction.buttonLabel;
            dropButton.title = pendingAction.title;
            dropButton.addEventListener("click", () => dropPendingRemoteInput(pendingAction.id));
            actionRow.append(dropButton);
          }
        } else {
          const stageButton = document.createElement("button");
          stageButton.type = "button";
          stageButton.className = "mini-action message-submit-action";
          stageButton.textContent = pendingAction.buttonLabel;
          stageButton.title = pendingAction.title;
          stageButton.addEventListener("click", () => resolvePendingInput(pendingAction.id));
          actionRow.append(stageButton);
        }
        bubble.append(actionRow);
      }
      const partyApproval = buildPartyApprovalProjection(message, {
        providerAuthored: isProviderAuthoredPartyMessage(message),
        hidden: shouldHideAutonomousHostMessage(message),
      });
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

function renderLoadEarlierMessages(projection) {
  const wrapper = document.createElement("div");
  wrapper.className = "play-log-load-earlier";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "mini-action";
  const count = Math.min(playLogPageSize, projection.hiddenCount);
  button.textContent = `Show ${count} earlier ${count === 1 ? "message" : "messages"}`;
  button.title = `${projection.hiddenCount} earlier ${projection.hiddenCount === 1 ? "message is" : "messages are"} still available in this campaign.`;
  button.addEventListener("click", () => {
    state.playLogVisibleLimit = projection.nextVisibleLimit;
    renderPlayLog();
  });

  const summary = document.createElement("span");
  summary.textContent = `${projection.hiddenCount} older ${projection.hiddenCount === 1 ? "message" : "messages"} hidden for table speed.`;

  wrapper.append(button, summary);
  return wrapper;
}

function shouldShowDebugMessageMeta() {
  return launchParams.get("debugMeta") === "1" || localStorage.getItem(debugMetaStorageKey) === "1";
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
  const resolveGate = buildTurnSubmitGate({
    turnProjection: turnProjection(),
    repair: activeTurnRepair(),
    readyForOpening: isCampaignReadyForOpening(),
  });
  const projection = buildPartyApprovalControlsProjection(approval, { resolveGate });

  if (projection.actions.length) {
    for (const action of projection.actions) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = action.className;
      button.textContent = action.label;
      button.title = action.title;
      button.disabled = Boolean(action.disabled);
      if (action.kind === "resolve") {
        button.addEventListener("click", () => resolvePartySuggestionNow(message));
      } else {
        button.addEventListener("click", () => setPartySuggestionStatus(message, action.nextStatus));
      }
      actionRow.append(button);
    }
    return actionRow;
  }

  const status = document.createElement("span");
  status.className = "message-action-status";
  status.textContent = projection.statusLabel;
  actionRow.append(status);

  if (projection.canUndo) {
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
  const meta = partySuggestionStatusMeta(status);

  await patchPlayMessage(message.id, {
    meta,
    data: {
      status,
      decidedAt: new Date().toISOString(),
    },
  });
  const activity = partySuggestionActivityForStatus(status);
  setProviderActivity(activity.text, activity.state);
}

async function resolvePartySuggestionNow(message) {
  if (!message?.id || hasActiveGeneration()) {
    setProviderActivity("Wait for the current DM response before resolving this companion beat", "waiting");
    return;
  }
  const gate = buildTurnSubmitGate({
    turnProjection: turnProjection(),
    repair: activeTurnRepair(),
    readyForOpening: isCampaignReadyForOpening(),
  });
  if (gate.blocked) {
    setProviderActivity(gate.activityText, gate.activityState);
    return { providerReceived: false, reason: gate.reason };
  }
  const input = partySuggestionInputFromMessage(message);
  if (!input.text) {
    setProviderActivity("That companion beat has no table text to send", "error");
    return;
  }
  await setPartySuggestionStatus(message, "approved_party_input");
  const runResult = await submitPlayerTurnFromInput("", {
    playerInputs: [input],
    skipPlayerEcho: true,
    skipPartySeed: true,
    preserveInput: true,
  });
  if (runResult?.imported) {
    await setPartySuggestionStatus(message, "submitted_party_input");
  } else {
    await markApprovedPartyInputsStillStaged([input], runResult);
  }
}

async function patchPlayMessage(messageId, patch = {}, options = {}) {
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
      const message = await response.text();
      if (options.tolerateMissing && response.status === 404) {
        pushDiagnosticsEvent("message_lifecycle_patch_missing", {
          messageId,
          patchKeys: Object.keys(patch ?? {}),
          message,
        });
        return;
      }
      throw new Error(message);
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
    return message.title || "LoreKeeper";
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
  // Party cards combine ownership, invite, nudge, and sheet actions. Future
  // target: a PartyRail projection so controller changes stay out of app.js.
  const pendingNewCharacterConnections = pendingNewCharacterJoinConnections(campaign);
  elements.partyCount.textContent = pendingNewCharacterConnections.length
    ? `${campaign.party.length}+${pendingNewCharacterConnections.length}`
    : String(campaign.party.length);
  elements.partyList.replaceChildren(
    ...pendingNewCharacterConnections.map((connection) => pendingJoinRequestElement(connection)),
    ...campaign.party.map((member) => {
      const pendingConnection = pendingJoinConnectionForMember(campaign, member.id);
      const details = [
        `${member.ancestryClass || "unknown role"}${formatHp(member.stats?.hp)}`,
        partyControllerDetail(member),
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
  const view = buildCombatTrackerView(campaign, {
    controlledActorId: state.guestSession?.partyMemberId,
    hideEnemyHp: Boolean(state.guestSession?.partyMemberId || state.guestSnapshot),
    isHostView: !clientMode && !isRemoteTableClient(),
  });
  elements.combatTrackerSection.hidden = !view.inCombat;
  if (!view.inCombat) {
    elements.combatTurnOrder.replaceChildren();
    elements.combatActiveActor.textContent = "No active turn.";
    renderCombatActiveCue(null);
    return;
  }

  elements.combatRound.textContent = view.roundLabel;
  elements.combatActiveActor.textContent = view.activeLabel;
  renderCombatActiveCue(view.activeCue);
  elements.combatTurnOrder.replaceChildren(
    ...view.rows.map((entry) => {
      const item = document.createElement("li");
      item.className = [
        "combat-order-row",
        entry.active ? "active" : "",
        entry.type === "enemy" ? "enemy" : "party",
        entry.controlled ? "controlled" : "",
        entry.defeated ? "defeated" : "",
      ].filter(Boolean).join(" ");
      const rank = document.createElement("span");
      rank.className = "combat-order-rank";
      rank.textContent = String(entry.rank);
      const label = document.createElement("strong");
      label.textContent = entry.name;
      const meta = document.createElement("span");
      meta.className = "combat-order-meta";
      meta.textContent = entry.meta;
      const hp = document.createElement("span");
      hp.className = "combat-order-hp";
      hp.textContent = entry.hpLabel || "";
      item.append(rank, label, meta, hp);
      return item;
    }),
  );
}

function renderCombatActiveCue(cue) {
  if (!elements.combatActiveCue) {
    return;
  }
  elements.combatActiveCue.hidden = !cue;
  elements.combatActiveCue.replaceChildren();
  if (!cue) {
    return;
  }
  elements.combatActiveCue.dataset.controller = cue.controllerKind || "";
  const header = document.createElement("div");
  header.className = "combat-active-cue-header";
  const label = document.createElement("strong");
  label.textContent = cue.controllerLabel || "Active turn";
  const actor = document.createElement("span");
  actor.textContent = cue.actorName || "";
  header.append(label, actor);

  const instruction = document.createElement("p");
  instruction.textContent = cue.instruction || "";
  elements.combatActiveCue.append(header, instruction);

  if (cue.actions?.length) {
    const list = document.createElement("div");
    list.className = "combat-action-chips";
    cue.actions.forEach((action) => {
      const chip = document.createElement("span");
      chip.className = "combat-action-chip";
      chip.textContent = action.label;
      list.append(chip);
    });
    elements.combatActiveCue.append(list);
  }
}

function pendingJoinConnectionForMember(campaign, memberId) {
  return (campaign.multiplayer?.connections ?? []).find((connection) =>
    connection.partyMemberId === memberId && connection.status === "pending"
  );
}

function pendingNewCharacterJoinConnections(campaign) {
  if (clientMode || isRemoteTableClient()) {
    return [];
  }
  return (campaign.multiplayer?.connections ?? []).filter((connection) =>
    connection.status === "pending" &&
    !connection.partyMemberId &&
    Boolean(connection.proposedCharacter?.name || connection.displayName)
  );
}

function pendingJoinRequestElement(connection) {
  const proposal = connection.proposedCharacter ?? {};
  const name = proposal.name || connection.displayName || "Guest";
  const classLine = [proposal.ancestry, proposal.characterClass].filter(Boolean).join(" ");
  const body = [
    `${connection.displayName || "Guest"} wants a seat as ${name}.`,
    classLine || proposal.summary || "",
    proposal.integrationPrompt ? "Has story integration notes." : "",
  ].filter(Boolean).join(" ");
  const tile = recordElement({
    title: `Seat request: ${name}`,
    body,
    badge: "Waiting",
    actions: [
      {
        label: "Seat",
        title: `Seat ${name}`,
        onClick: () => approveGuest(connection.id),
      },
      {
        label: "Decline",
        title: `Decline ${name}`,
        onClick: () => denyGuest(connection.id),
      },
    ],
    onEdit: () => showJoinRequestDetails(connection),
  });
  tile.classList.add("join-request-tile");
  return tile;
}

function joinRequestDetailsText(connection) {
  const proposal = connection.proposedCharacter ?? {};
  const lines = [
    `Player: ${connection.displayName || "Guest"}`,
    `Character: ${proposal.name || connection.displayName || "Unnamed"}`,
    `Class: ${[proposal.ancestry, proposal.characterClass].filter(Boolean).join(" ") || "Not provided"}`,
    proposal.level ? `Level: ${proposal.level}` : "",
    proposal.summary ? `Summary: ${proposal.summary}` : "",
    proposal.backstory ? `Backstory: ${proposal.backstory}` : "",
    proposal.integrationPrompt ? `Player integration notes: ${proposal.integrationPrompt}` : "",
    proposal.sheetNotes ? `Sheet notes: ${proposal.sheetNotes}` : "",
  ].filter(Boolean);
  return lines.join("\n\n");
}

async function showJoinRequestDetails(connection) {
  await confirmInApp({
    title: "Seat Request Details",
    message: joinRequestDetailsText(connection),
    acceptLabel: "Close",
  });
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
  if (kind !== "host") {
    const waitingGuests = waitingGuestsForSeating()
      .filter((guest) => !guest.preferredPartyMemberId || guest.preferredPartyMemberId === member.id)
      .sort((left, right) => Number(right.preferredPartyMemberId === member.id) - Number(left.preferredPartyMemberId === member.id));
    for (const guest of waitingGuests.slice(0, 2)) {
      actions.push({
        label: `Seat ${guest.displayName || "Guest"}`,
        title: waitingGuestSeatTitle(guest, member),
        onClick: () => seatWaitingGuestAtTable(guest.id, member.id),
      });
    }
  }
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
  if (kind === "ai_companion") {
    const nudgeGate = buildAiCompanionNudgeGate({
      isHost: !clientMode && !isRemoteTableClient(),
      readyForOpening: isCampaignReadyForOpening(),
      inCombat: Boolean(state.campaign?.combat?.inCombat),
      isActiveCombatTurn: isActiveAiCompanionCombatTurn(member),
      companionName: member.name || "This companion",
    });
    actions.push({
      label: "Invite",
      title: `Invite a friend to play ${member.name}`,
      onClick: () => createInviteForMember(member),
    });
    actions.push({
      label: "Nudge",
      title: nudgeGate.title,
      className: "nudge-action",
      disabled: nudgeGate.blocked,
      onClick: () => nudgeAiPartyMember(member),
    });
    return actions;
  }
  actions.push({
    label: "Invite",
    title: `Invite a friend to play ${member.name}`,
    onClick: () => createInviteForMember(member),
  });
  return actions;
}

function waitingGuestSeatTitle(guest = {}, member = {}) {
  const proposal = guest.proposedCharacter ?? {};
  const proposalLine = [proposal.name, proposal.ancestry, proposal.characterClass]
    .filter(Boolean)
    .join(" - ");
  const context = proposalLine || proposal.roleIntent
    ? ` Draft: ${proposalLine || proposal.roleIntent}.`
    : "";
  return `Seat ${guest.displayName || "Guest"} as ${member.name || "this character"}.${context}`;
}

function waitingGuestsForSeating() {
  return effectiveWaitingGuests()
    .filter((guest) => guest.status === "waiting");
}

function effectiveMultiplayerState() {
  if (!clientMode && state.multiplayerSnapshot?.localTable) {
    return state.multiplayerSnapshot;
  }
  return state.campaign?.multiplayer ?? {};
}

function effectiveWaitingGuests() {
  const snapshotGuests = state.multiplayerSnapshot?.waitingGuests;
  const guests = Array.isArray(snapshotGuests)
    ? snapshotGuests
    : state.campaign?.multiplayer?.waitingGuests ?? [];
  return guests.filter(isFreshWaitingGuest);
}

function isFreshWaitingGuest(guest) {
  const seenAt = Date.parse(guest?.lastSeenAt || guest?.requestedAt || "");
  if (!Number.isFinite(seenAt)) {
    return false;
  }
  return Date.now() - seenAt <= waitingGuestHeartbeatTimeoutMs;
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
    setProviderActivity(`Saving ${payload.name}...`, "working");
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
    elements.bridgeStatus.textContent = `${payload.name} saved`;
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
    .map((value) => {
      if (value && typeof value === "object") {
        return String(value.name || value.title || value.label || Object.entries(value).map(([key, entry]) => `${key}: ${entry}`).join(", "));
      }
      return String(value);
    })
    .map((value) => value.trim())
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
      "NPCs and contacts the table meets will appear here.",
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
      "Current and discovered locations will appear here.",
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
      "Items, clues, handouts, and assets will appear here.",
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
  const active = campaign.quests
    .filter((quest) => quest.status !== "completed")
    .filter((quest) => !isHiddenStoryThread(quest))
    .slice(0, 8);
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
      "Open quests and unresolved story threads will appear here.",
    ),
  );
}

function renderPlayerNotes(campaign) {
  const campaignId = campaign?.id || "default";
  if (state.playerNotesCampaignId === campaignId) {
    return;
  }
  state.playerNotesCampaignId = campaignId;
  const notes = playerNotesWithLocalFallback(campaign);
  if (elements.playerNotesPeople) {
    elements.playerNotesPeople.value = notes.people || "";
  }
  if (elements.playerNotesPlaces) {
    elements.playerNotesPlaces.value = notes.places || "";
  }
  if (elements.playerNotesThings) {
    elements.playerNotesThings.value = notes.things || "";
  }
  if (elements.playerNotesScratch) {
    elements.playerNotesScratch.value = notes.scratch || "";
  }
  if (notes.source === "localStorage" && hasPlayerNoteText(notes)) {
    savePlayerNotesFromUi({ quiet: true });
  }
}

function playerNoteInputs() {
  return [
    elements.playerNotesPeople,
    elements.playerNotesPlaces,
    elements.playerNotesThings,
    elements.playerNotesScratch,
  ];
}

function savePlayerNotesFromUi({ quiet = false } = {}) {
  if (!state.campaign?.id) {
    return;
  }
  const notes = {
    people: elements.playerNotesPeople?.value || "",
    places: elements.playerNotesPlaces?.value || "",
    things: elements.playerNotesThings?.value || "",
    scratch: elements.playerNotesScratch?.value || "",
    updatedAt: new Date().toISOString(),
  };
  state.campaign = {
    ...state.campaign,
    playerNotes: notes,
  };
  try {
    localStorage.setItem(playerNotesStorageKey(state.campaign.id), JSON.stringify(notes));
  } catch {
    // Keep play moving even if the local migration fallback is unavailable.
  }
  schedulePlayerNotesPersist(notes, { quiet });
}

function schedulePlayerNotesPersist(notes, { quiet = false } = {}) {
  if (isRemoteTableClient() || clientMode) {
    return;
  }
  if (state.playerNotesSaveTimer) {
    window.clearTimeout(state.playerNotesSaveTimer);
  }
  state.playerNotesSaveTimer = window.setTimeout(() => {
    state.playerNotesSaveTimer = null;
    persistPlayerNotes(notes, { quiet });
  }, 600);
}

async function persistPlayerNotes(notes, { quiet = false } = {}) {
  if (!state.campaign?.id) {
    return;
  }
  try {
    const result = await postJson(apiCampaignPlayerNotesUrl, {
      campaignId: state.campaign.id,
      notes,
    });
    setCampaignFromPayload(result, "player_notes_saved");
  } catch (error) {
    if (!quiet) {
      setProviderActivity(error instanceof Error ? `Notes were not saved: ${error.message}` : "Notes were not saved", "error");
    }
  }
}

function playerNotesWithLocalFallback(campaign) {
  const campaignNotes = campaign?.playerNotes && typeof campaign.playerNotes === "object"
    ? campaign.playerNotes
    : {};
  if (hasPlayerNoteText(campaignNotes)) {
    return { ...campaignNotes, source: "campaign" };
  }
  return {
    ...loadPlayerNotes(campaign?.id || "default"),
    source: "localStorage",
  };
}

function hasPlayerNoteText(notes = {}) {
  return Boolean(
    String(notes.people || "").trim()
      || String(notes.places || "").trim()
      || String(notes.things || "").trim()
      || String(notes.scratch || "").trim(),
  );
}

function loadPlayerNotes(campaignId) {
  try {
    return JSON.parse(localStorage.getItem(playerNotesStorageKey(campaignId)) || "{}");
  } catch {
    return {};
  }
}

function playerNotesStorageKey(campaignId) {
  return `${playerNotesStoragePrefix}.${campaignId || "default"}`;
}

function renderTableTalk() {
  if (!elements.tableTalkLog || !elements.tableTalkCount) {
    return;
  }
  const messages = currentTableTalkMessages();
  const previousCount = state.lastTableTalkCount;
  if (previousCount != null && messages.length > previousCount && document.activeElement !== elements.tableTalkInput) {
    state.unreadTableTalkCount += messages.length - previousCount;
  }
  state.lastTableTalkCount = messages.length;
  const tableTalkSection = elements.tableTalkLog.closest(".table-talk-section");
  tableTalkSection?.classList.toggle("has-new-table-talk", state.unreadTableTalkCount > 0);
  elements.tableTalkCount.textContent = state.unreadTableTalkCount > 0
    ? `${messages.length} +${state.unreadTableTalkCount}`
    : String(messages.length);
  elements.tableTalkCount.title = state.unreadTableTalkCount > 0
    ? `${state.unreadTableTalkCount} new side chat ${state.unreadTableTalkCount === 1 ? "message" : "messages"}`
    : `${messages.length} side chat ${messages.length === 1 ? "message" : "messages"}`;
  if (!messages.length) {
    const empty = document.createElement("p");
    empty.className = "table-talk-empty";
    empty.textContent = clientMode || state.guestSession?.hostBaseUrl
      ? "Side chat appears here after you join the host table."
      : "Side chat is quiet.";
    elements.tableTalkLog.replaceChildren(empty);
  } else {
    elements.tableTalkLog.replaceChildren(
      ...messages.slice(-80).map((message) => {
        const wrapper = document.createElement("article");
        wrapper.className = "table-talk-message";

        const header = document.createElement("div");
        header.className = "table-talk-message-header";

        const name = document.createElement("strong");
        name.textContent = message.playerName || (message.role === "host" ? "Host" : "Player");

        const time = document.createElement("time");
        time.dateTime = message.createdAt || "";
        time.textContent = formatMessageTime(message.createdAt);

        const body = document.createElement("p");
        body.textContent = message.text || "";

        header.replaceChildren(name, time);
        wrapper.replaceChildren(header, body);
        return wrapper;
      }),
    );
    elements.tableTalkLog.scrollTop = elements.tableTalkLog.scrollHeight;
  }

  if (elements.tableTalkInput) {
    const waitingGuest = Boolean((clientMode || state.guestSession?.hostBaseUrl) && !state.guestSession?.connectionId);
    elements.tableTalkInput.disabled = waitingGuest;
    elements.tableTalkInput.placeholder = waitingGuest ? "Join a hosted table first..." : "Side chat...";
  }
  if (elements.tableTalkSend) {
    elements.tableTalkSend.disabled = Boolean(elements.tableTalkInput?.disabled);
  }
}

function clearTableTalkUnread() {
  state.unreadTableTalkCount = 0;
  state.lastTableTalkCount = currentTableTalkMessages().length;
  elements.tableTalkLog?.closest(".table-talk-section")?.classList.remove("has-new-table-talk");
  if (elements.tableTalkCount) {
    elements.tableTalkCount.textContent = String(state.lastTableTalkCount);
  }
}

function currentTableTalkMessages() {
  return projectCurrentTableTalkMessages({
    guestSnapshot: state.guestSnapshot,
    multiplayerSnapshot: state.multiplayerSnapshot,
    campaign: state.campaign,
  });
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
  const repair = activeTurnRepair();
  renderHostResponseReview(elements.hostResponseReview, buildHostResponseReviewProjection({
    repair,
    reviewBatch: state.reviewBatch,
  }));
  applyManualResponseFallbackProjection(elements, buildManualResponseFallbackProjection({
    repair,
    reviewBatch: state.reviewBatch,
    hasDraftText: Boolean(elements.responseImport?.value.trim()),
    copiedResponseAvailable: currentProviderSettings().preferredProvider === "bridge" && state.bridge?.mode === "manual",
  }));
  renderReviewPanel({
    elements,
    projection: buildReviewPanelProjection({
      reviewBatch: state.reviewBatch,
      campaign: state.campaign,
    }),
    recordElement,
    emptyOrRecords,
  });
}

function inferAncestryFromSheetText(value) {
  const match = String(value ?? "").match(/\b(human|elf|dwarf|halfling|gnome|orc|tiefling|dragonborn|half-elf|half-orc)\b/i);
  return match?.[1] ?? "";
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
      image.src = withLaunchToken(`/local-asset?path=${encodeURIComponent(asset.path)}`);
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
  copy.textContent = body || "No details recorded yet.";
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

function withLaunchToken(rawUrl) {
  if (!apiToken) {
    return rawUrl;
  }
  const url = new URL(rawUrl, window.location.href);
  url.searchParams.set("lkToken", apiToken);
  return url.pathname + url.search;
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
  copy.textContent = body || "No notes recorded yet.";

  wrapper.append(heading, copy);
  if (actions.length) {
    const actionRow = document.createElement("div");
    actionRow.className = "record-actions";
    for (const action of actions) {
      const button = document.createElement("button");
      button.className = ["mini-action", action.className].filter(Boolean).join(" ");
      button.type = "button";
      button.textContent = action.label;
      button.title = action.title || action.label;
      button.disabled = Boolean(action.disabled);
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (action.disabled) {
          return;
        }
        action.onClick();
      });
      actionRow.append(button);
    }
    wrapper.append(actionRow);
  }
  return wrapper;
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
      if (block.audienceLabel) {
        const audience = document.createElement("span");
        audience.className = "choice-audience";
        audience.textContent = block.audienceLabel;
        panel.append(audience);
      }

      const list = document.createElement("ol");
      const blockVotes = currentChoiceVotes(block);
      const voteCounts = choiceVoteCounts(block, blockVotes);
      const guestVote = currentGuestVoteForChoice(block);
      block.items.forEach((itemText, index) => {
        const item = document.createElement("li");
        const button = document.createElement("button");
        button.type = "button";
        button.className = "choice-option";
        const label = choiceLabelForIndex(index);
        const optionId = choiceOptionId(block, index);
        button.classList.toggle("choice-option-voted", guestVote?.optionId === optionId);
        const text = document.createElement("span");
        text.className = "choice-option-text";
        text.textContent = itemText;
        const votes = document.createElement("span");
        votes.className = "choice-vote-count";
        votes.textContent = String(voteCounts.get(optionId) || 0);
        votes.title = `${voteCounts.get(optionId) || 0} ${voteCounts.get(optionId) === 1 ? "vote" : "votes"}`;
        button.replaceChildren(text, votes);
        button.title = isRemoteTableClient() && isPartyVoteChoiceBlock(block) ? `Vote ${label}` : `Choose ${label}`;
        button.addEventListener("click", () => chooseVisibleOption(block, index));
        item.append(button);
        list.append(item);
      });
      panel.append(list);

      const voteSummaryText = choiceVoteSummaryText(block, blockVotes);
      if (voteSummaryText) {
        const voteSummary = document.createElement("small");
        voteSummary.className = [
          "choice-vote-summary",
          choiceVoteState(block, blockVotes).tied ? "choice-vote-tied" : "choice-vote-leading",
        ].join(" ");
        voteSummary.textContent = voteSummaryText;
        panel.append(voteSummary);
      }
      const leadingVote = leadingChoiceVoteEntry(block);
      if (leadingVote) {
        const voteAction = document.createElement("button");
        voteAction.type = "button";
        voteAction.className = "mini-action choice-vote-action";
        voteAction.textContent = `Draft leading choice ${leadingVote.label}`;
        voteAction.title = "Draft the table's leading vote; send it when the host is ready.";
        voteAction.addEventListener("click", () => chooseVisibleOption(block, leadingVote.index));
        panel.append(voteAction);
      }

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
    ? normalizeProviderChoiceFormattingForPlay(text)
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

function mergeStructuredChoiceBlock(blocks, structuredChoiceBlock) {
  if (!structuredChoiceBlock?.items?.length) {
    return blocks;
  }
  const withoutParsedChoices = blocks.filter((block) => block.type !== "choices");
  return [...withoutParsedChoices, structuredChoiceBlock];
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
