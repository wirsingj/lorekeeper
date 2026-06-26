// Combat prompt repair policy.
// The renderer may execute the repair, but the decision about whether a DM
// response handed initiative to the wrong visible party actor belongs here.
import { normalizeChangeDomain } from "./change-domain-controller.js";

export function createImplicitCombatActorPromptChange({
  campaign = null,
  tableMessages = [],
  proposedChanges = [],
  turnResponse = null,
} = {}) {
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

export function latestDmNarration(tableMessages = []) {
  return [...tableMessages]
    .reverse()
    .find((message) => message.role === "dm" && message.body?.trim())?.body || "";
}

function promptedCombatActorIdFromTurnResponse(turnResponse = null, campaign = null) {
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

function promptedCombatActorIdFromMessages(tableMessages = [], campaign = null) {
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

function promptedCombatActorIdFromMessageData(data = {}, campaign = null) {
  return (
    promptedCombatActorIdFromTurnResponse(data.turnResponse, campaign) ||
    promptedCombatActorIdFromTurnResponse({ choices: data.choices }, campaign)
  );
}

function promptedCombatActorIdFromText(text = "", campaign = null) {
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

function normalizePromptedActorId(actorId, campaign = null) {
  const id = String(actorId ?? "").trim();
  if (!id) {
    return "";
  }
  if ((campaign?.party ?? []).some((member) => member.id === id)) {
    return id;
  }
  return partyMemberIdByName(campaign, id);
}

function partyMemberIdByName(campaign = null, value = "") {
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

function combatActorType(campaign, id) {
  if ((campaign?.party ?? []).some((member) => member.id === id)) {
    return "party";
  }
  if ((campaign?.combat?.enemies ?? []).some((enemy) => enemy.id === id)) {
    return "enemy";
  }
  return "unknown";
}

function labelById(campaign, id) {
  return (
    (campaign?.party ?? []).find((item) => item.id === id)?.name ||
    (campaign?.people ?? []).find((item) => item.id === id)?.name ||
    (campaign?.places ?? []).find((item) => item.id === id)?.name ||
    (campaign?.items ?? []).find((item) => item.id === id)?.name ||
    (campaign?.quests ?? []).find((item) => item.id === id)?.title ||
    (campaign?.combat?.enemies ?? []).find((item) => item.id === id)?.name ||
    id
  );
}

function normalizeNameKey(value) {
  return String(value ?? "").trim().toLowerCase();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
