import { activeConsequencesForScene } from "./consequence-engine.js";

export const sceneTypes = Object.freeze({
  RP: "rp",
  SOCIAL: "social",
  EXPLORATION: "exploration",
  COMBAT: "combat",
  TRAVEL: "travel",
  DOWNTIME: "downtime",
});

const allowedSceneTypes = new Set(Object.values(sceneTypes));

export function normalizeSceneRecord(input = {}, campaign = {}, options = {}) {
  const now = options.now ?? new Date().toISOString();
  const participants = uniqueStrings([
    ...(input.participantIds ?? input.participants ?? []),
    ...(input.partyMemberIds ?? []),
    ...(input.peopleIds ?? []),
    ...(input.presentPeopleIds ?? []),
    ...(input.presentPartyMemberIds ?? []),
  ]);
  return {
    id: input.id || `scene-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: allowedSceneTypes.has(input.type) ? input.type : deriveSceneType(input, campaign),
    title: input.title || input.name || "Current scene",
    locationId: input.locationId ?? input.currentPlaceId ?? campaign.scene?.currentPlaceId ?? null,
    participantIds: participants,
    partyMemberIds: uniqueStrings(input.partyMemberIds ?? input.presentPartyMemberIds ?? campaign.scene?.presentPartyMemberIds ?? []),
    peopleIds: uniqueStrings(input.peopleIds ?? input.presentPeopleIds ?? campaign.scene?.presentPeopleIds ?? []),
    threadIds: uniqueStrings(input.threadIds ?? input.questIds ?? input.activeQuestIds ?? campaign.scene?.activeQuestIds ?? []),
    consequenceIds: uniqueStrings(input.consequenceIds ?? input.activeConsequenceIds ?? campaign.scene?.activeConsequenceIds ?? []),
    goals: normalizeTextList(input.goals),
    tensions: normalizeTextList(input.tensions),
    unresolvedQuestions: normalizeTextList(input.unresolvedQuestions ?? input.questions),
    whyHere: input.whyHere || input.reason || "",
    immediateSituation: input.immediateSituation ?? input.situation ?? campaign.scene?.immediateSituation ?? "",
    status: input.status || "active",
    startedAt: input.startedAt ?? now,
    endedAt: input.endedAt ?? null,
    updatedAt: input.updatedAt ?? now,
  };
}

export function createScene(campaign, input, options = {}) {
  const scene = normalizeSceneRecord(input, campaign, options);
  return {
    ...campaign,
    scenes: upsertById(campaign.scenes ?? [], scene),
  };
}

export function transitionScene(campaign, input, options = {}) {
  const now = options.now ?? new Date().toISOString();
  const previousSceneId = campaign.scene?.activeSceneId;
  const endedScenes = (campaign.scenes ?? []).map((scene) => {
    if (scene.id !== previousSceneId || scene.status === "resolved") {
      return scene;
    }
    return { ...scene, status: "resolved", endedAt: now, updatedAt: now };
  });
  const scene = normalizeSceneRecord(input, { ...campaign, scenes: endedScenes }, { ...options, now });

  return {
    ...campaign,
    scenes: upsertById(endedScenes, scene),
    scene: {
      ...(campaign.scene ?? {}),
      activeSceneId: scene.id,
      status: scene.status,
      currentPlaceId: scene.locationId,
      presentPeopleIds: scene.peopleIds,
      presentPartyMemberIds: scene.partyMemberIds,
      activeQuestIds: scene.threadIds,
      activeConsequenceIds: scene.consequenceIds,
      tensions: scene.tensions,
      unresolvedQuestions: scene.unresolvedQuestions,
      immediateSituation: scene.immediateSituation,
    },
  };
}

export function updateCurrentScene(campaign, patch, options = {}) {
  const current = currentScene(campaign);
  if (!current) {
    return transitionScene(campaign, patch, options);
  }
  const now = options.now ?? new Date().toISOString();
  const updated = normalizeSceneRecord({ ...current, ...patch, id: current.id, updatedAt: now }, campaign, { ...options, now });
  return {
    ...campaign,
    scenes: upsertById(campaign.scenes ?? [], updated),
    scene: {
      ...(campaign.scene ?? {}),
      currentPlaceId: updated.locationId,
      presentPeopleIds: updated.peopleIds,
      presentPartyMemberIds: updated.partyMemberIds,
      activeQuestIds: updated.threadIds,
      tensions: updated.tensions,
      unresolvedQuestions: updated.unresolvedQuestions,
      activeConsequenceIds: updated.consequenceIds,
      immediateSituation: updated.immediateSituation,
    },
  };
}

export function currentScene(campaign) {
  const activeSceneId = campaign?.scene?.activeSceneId;
  const explicit = activeSceneId ? (campaign.scenes ?? []).find((scene) => scene.id === activeSceneId) : null;
  if (explicit) {
    return explicit;
  }
  if ((campaign?.scenes ?? []).length) {
    const active = campaign.scenes.find((scene) => scene.status === "active");
    if (active) return active;
  }
  if (!campaign?.scene) {
    return null;
  }
  return normalizeSceneRecord({
    id: campaign.scene.activeSceneId ?? "scene-current",
    title: campaign.scene.immediateSituation ? "Current scene" : "Unframed scene",
    locationId: campaign.scene.currentPlaceId,
    presentPeopleIds: campaign.scene.presentPeopleIds,
    presentPartyMemberIds: campaign.scene.presentPartyMemberIds,
    activeQuestIds: campaign.scene.activeQuestIds,
    activeConsequenceIds: campaign.scene.activeConsequenceIds,
    tensions: campaign.scene.tensions,
    unresolvedQuestions: campaign.scene.unresolvedQuestions,
    immediateSituation: campaign.scene.immediateSituation,
    status: campaign.scene.status,
  }, campaign);
}

export function buildSceneRetrieval(campaign, options = {}) {
  const scene = currentScene(campaign);
  const participantIds = new Set([
    ...(scene?.participantIds ?? []),
    ...(scene?.partyMemberIds ?? []),
    ...(scene?.peopleIds ?? []),
  ]);
  const activeConsequences = activeConsequencesForScene(campaign, scene, { limit: options.consequenceLimit ?? 6 });
  const consequenceThreadIds = activeConsequences.flatMap((consequence) => consequence.threadIds ?? []);
  const threadIds = new Set([...(scene?.threadIds ?? []), ...consequenceThreadIds]);

  return {
    scene,
    participants: [...participantIds].map((id) => lookupEntity(campaign, id)).filter(Boolean),
    activeConsequences,
    relevantRelationships: relevantRelationships(campaign, participantIds, activeConsequences, options.relationshipLimit ?? 8),
    activeThreads: (campaign?.quests ?? [])
      .filter((quest) => quest.status !== "completed")
      .filter((quest) => threadIds.has(quest.id) || !threadIds.size)
      .slice(0, options.threadLimit ?? 6),
    relevantRecentEvents: relevantRecentEvents(campaign, participantIds, options.eventLimit ?? 5),
  };
}

function relevantRelationships(campaign, participantIds, consequences, limit) {
  const consequenceRelationshipIds = new Set(consequences.flatMap((consequence) => consequence.relationshipIds ?? []));
  return (campaign?.relationships ?? [])
    .filter((relationship) => {
      if (consequenceRelationshipIds.has(relationship.id)) return true;
      return participantIds.has(relationship.sourceId) || participantIds.has(relationship.targetId);
    })
    .slice(0, limit);
}

function relevantRecentEvents(campaign, participantIds, limit) {
  return (campaign?.timeline ?? [])
    .filter((event) => (event.relatedIds ?? []).some((id) => participantIds.has(id)))
    .slice(-limit);
}

function deriveSceneType(input, campaign) {
  if (campaign?.combat?.inCombat) return sceneTypes.COMBAT;
  if (input.status === "downtime") return sceneTypes.DOWNTIME;
  if (input.type && allowedSceneTypes.has(input.type)) return input.type;
  return sceneTypes.RP;
}

function lookupEntity(campaign, id) {
  return [
    ...(campaign?.party ?? []),
    ...(campaign?.people ?? []),
    ...(campaign?.places ?? []),
    ...(campaign?.factions ?? []),
  ].find((entity) => entity.id === id);
}

function upsertById(records, record) {
  const index = records.findIndex((item) => item.id === record.id);
  if (index === -1) {
    return [...records, record];
  }
  return records.map((item, itemIndex) => (itemIndex === index ? record : item));
}

function normalizeTextList(value) {
  if (!value) return [];
  const values = Array.isArray(value) ? value : [value];
  return uniqueStrings(values.map((entry) => String(entry)));
}

function uniqueStrings(values) {
  return [...new Set((values ?? []).filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim()))];
}
