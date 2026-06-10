import { buildContextPack } from "../src/context-packs/build-context-pack.js";
import { findById } from "../src/campaign-state/formatters.js";
import { normalizeCampaign } from "../src/campaign-state/schema.js";
import { createSampleCampaign } from "../src/campaign-state/sample-campaign.js";
import { createStarterCampaign } from "../src/campaign-state/starter-campaign.js";
import { createReviewBatch, decideChange, getCommittableChanges } from "../src/canon-review/proposals.js";
import { extractLorekeeperUpdates } from "../src/canon-review/extract-updates.js";
import { createPlayerTurn } from "../src/play-loop/session-turn.js";

const bundleUrl = "/data/imports/veil-of-the-towers.bundle.json";
const state = {
  campaign: null,
  contextPack: null,
  currentTurn: null,
  reviewBatch: null,
  prompt: "",
  playMessages: [],
  sourceMode: "loading",
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

elements.copyProviderPrompt.addEventListener("click", async () => {
  await navigator.clipboard.writeText(state.prompt);
  elements.bridgeStatus.textContent = "Provider prompt copied";
});

elements.newCampaign.addEventListener("click", () => {
  state.campaign = createStarterCampaign({
    title: "New Campaign Binder",
    premise: "A new D&D 5e-lite campaign ready to grow through play.",
  });
  state.sourceMode = "new";
  state.reviewBatch = null;
  state.responseImport.value = "";
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

  state.playMessages.push({
    role: "system",
    title: "Canon Review",
    body: `${approved.length} approved change${approved.length === 1 ? "" : "s"} staged for the SQLite commit path.`,
  });
  elements.bridgeStatus.textContent = `${approved.length} approved change${approved.length === 1 ? "" : "s"} staged`;
  render();
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
  state.playMessages.push({
    role: "player",
    title: "Player Action",
    body: playerMessage,
  });
  state.playMessages.push({
    role: "system",
    title: "Lorekeeper",
    body: "Built a focused context pack and provider-ready prompt. Copy it to the selected provider bridge, then import the response.",
  });
  elements.playerInput.value = "";
  render();
  await navigator.clipboard.writeText(state.prompt);
  elements.bridgeStatus.textContent = "Turn built and prompt copied";
});

await boot();

async function boot() {
  await loadCampaign();
  seedPlayLog();
  render();
}

async function loadCampaign() {
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

function seedPlayLog() {
  const campaign = state.campaign;
  const currentPlace = findById(campaign.places, campaign.scene.currentPlaceId);
  state.playMessages = [
    {
      role: "system",
      title: "Scene Loaded",
      body: `${campaign.title} is open at ${currentPlace?.name ?? "the current scene"}. Lorekeeper owns the binder, input, and canon review; the provider is the sidecar engine.`,
    },
    {
      role: "provider",
      title: "Mirrored Play Screen",
      body: campaign.scene.immediateSituation,
    },
  ];
}

function render() {
  const campaign = state.campaign;
  const currentPlace = findById(campaign.places, campaign.scene.currentPlaceId);

  elements.title.textContent = campaign.title;
  elements.sceneLocation.textContent = currentPlace?.name ?? "Current scene";
  elements.providerStatus.textContent = "Provider: ChatGPT sidecar/manual";
  elements.saveStatus.textContent = `Binder: ${state.sourceMode} / SQLite target`;

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
    role: "provider",
    title: "Provider Response",
    body: stripLorekeeperUpdateBlock(responseText),
  });

  const extraction = extractLorekeeperUpdates(responseText);
  state.reviewBatch = createReviewBatch({
    campaignId: state.campaign.id,
    source: "manual_import",
    rawResponse: responseText,
    proposedChanges: extraction.proposedChanges,
  });

  if (extraction.error) {
    state.playMessages.push({
      role: "system",
      title: "Import Note",
      body: extraction.error,
    });
  }

  state.responseImport.value = "";
  elements.bridgeStatus.textContent =
    extraction.proposedChanges.length > 0
      ? `${extraction.proposedChanges.length} proposed change${extraction.proposedChanges.length === 1 ? "" : "s"} found`
      : "Response imported with no proposed changes";
  render();
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
