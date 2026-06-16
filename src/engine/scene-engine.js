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
  const focusIds = sceneFocusIds(scene, activeConsequences, threadIds);

  return {
    scene,
    participants: [...participantIds].map((id) => lookupEntity(campaign, id)).filter(Boolean),
    activeConsequences,
    relevantRelationships: relevantRelationships(campaign, focusIds, activeConsequences, options.relationshipLimit ?? 8),
    activeThreads: (campaign?.quests ?? [])
      .filter((quest) => quest.status !== "completed")
      .filter((quest) => threadIds.has(quest.id) || !threadIds.size)
      .slice(0, options.threadLimit ?? 6),
    relevantRecentEvents: relevantRecentEvents(campaign, focusIds, options.eventLimit ?? 5),
  };
}

function sceneFocusIds(scene, activeConsequences = [], threadIds = new Set()) {
  return new Set([
    ...(scene?.participantIds ?? []),
    ...(scene?.partyMemberIds ?? []),
    ...(scene?.peopleIds ?? []),
    ...(scene?.locationId ? [scene.locationId] : []),
    ...threadIds,
    ...activeConsequences.flatMap((consequence) => [
      ...(consequence.participantIds ?? []),
      ...(consequence.relatedEntityIds ?? []),
      ...(consequence.threadIds ?? []),
    ]),
  ]);
}

export function buildSceneIntentPack(campaign, options = {}) {
  const retrieval = options.sceneRetrieval ?? buildSceneRetrieval(campaign, options);
  const scene = retrieval.scene;
  const escalationPolicy = deriveEscalationPolicy(campaign, retrieval, options);

  return {
    scene: scene ? {
      id: scene.id,
      title: scene.title,
      type: scene.type,
      status: scene.status,
      locationId: scene.locationId,
      whyHere: scene.whyHere,
      immediateSituation: scene.immediateSituation,
      goals: scene.goals ?? [],
      tensions: scene.tensions ?? [],
      unresolvedQuestions: scene.unresolvedQuestions ?? [],
      participantIds: scene.participantIds ?? [],
    } : null,
    consequences: retrieval.activeConsequences.map((consequence) => ({
      id: consequence.id,
      title: consequence.title,
      scope: consequence.scope,
      importance: consequence.importance,
      description: consequence.description,
      participantIds: consequence.participantIds ?? [],
      threadIds: consequence.threadIds ?? [],
    })),
    relationships: retrieval.relevantRelationships.map((relationship) => ({
      id: relationship.id ?? null,
      sourceId: relationship.sourceId,
      targetId: relationship.targetId,
      type: relationship.type,
      notes: asText(relationship.notes),
    })),
    threads: retrieval.activeThreads.map((thread) => ({
      id: thread.id,
      title: thread.title,
      status: thread.status,
      stakes: thread.stakes ?? "",
    })),
    recentEvents: retrieval.relevantRecentEvents.map((event) => ({
      id: event.id ?? null,
      title: event.title ?? event.summary ?? "Recent event",
      summary: event.summary ?? event.text ?? "",
      relatedIds: event.relatedIds ?? [],
    })),
    escalationPolicy,
    providerScope: {
      providerOwns: ["narration", "dialogue", "atmosphere", "NPC reactions", "suggestions"],
      appOwns: ["facts", "scene state", "consequences", "relationships", "combat", "dice", "HP", "resources"],
    },
  };
}

export function deriveEscalationPolicy(campaign, retrieval = buildSceneRetrieval(campaign), options = {}) {
  if (options.escalationPolicy) {
    return normalizeEscalationPolicy(options.escalationPolicy);
  }
  if (campaign?.combat?.inCombat || retrieval.scene?.type === sceneTypes.COMBAT) {
    return {
      level: "hard",
      reason: "Combat is already active.",
      guidance: "Resolve the current combatants and battlefield consequences. Do not introduce unrelated enemies or new crises.",
      preferredBeats: ["active combatant action", "visible mechanical result", "battlefield consequence"],
      avoid: ["unrelated reinforcements", "new random threat", "skipping the active actor"],
    };
  }

  const consequences = retrieval.activeConsequences ?? [];
  const hasCritical = consequences.some((consequence) => consequence.importance === "critical");
  const hasHigh = consequences.some((consequence) => consequence.importance === "high");
  const hasTension = Boolean(retrieval.scene?.tensions?.length);

  if (hasCritical) {
    return {
      level: "moderate",
      reason: "A critical active consequence is tied to this scene.",
      guidance: "Escalate only through the listed consequence or tension. Let established people react before inventing new danger.",
      preferredBeats: ["consequence pressure", "NPC reaction", "relationship shift"],
      avoid: ["unrelated combat", "new faction without setup", "random encounter"],
    };
  }

  if (hasHigh || hasTension) {
    return {
      level: "soft",
      reason: hasHigh ? "A high-importance consequence is active." : "The scene has active tension.",
      guidance: "Show social pressure, memory, rumor, suspicion, or a grounded next beat. Let the scene breathe unless the player pushes harder.",
      preferredBeats: ["NPC/world reaction", "consequence follow-through", "meaningful but non-forced choice"],
      avoid: ["sudden unrelated threat", "immediate combat by default", "generic fantasy filler"],
    };
  }

  return {
    level: "none",
    reason: "No app-owned escalation pressure is active.",
    guidance: "Continue the scene through atmosphere, character response, relationship, and consequence. Do not add a new threat unless the player creates one.",
    preferredBeats: ["sense of place", "NPC reaction", "continuity"],
    avoid: ["random bandits", "sudden monsters", "new crisis without setup"],
  };
}

function relevantRelationships(campaign, participantIds, consequences, limit) {
  const consequenceRelationshipIds = new Set(consequences.flatMap((consequence) => consequence.relationshipIds ?? []));
  return (campaign?.relationships ?? [])
    .map((relationship, index) => ({ relationship, index }))
    .filter(({ relationship }) => {
      if (consequenceRelationshipIds.has(relationship.id)) return true;
      return participantIds.has(relationship.sourceId) || participantIds.has(relationship.targetId);
    })
    .sort((left, right) =>
      relationshipFocusScore(right.relationship, participantIds, consequenceRelationshipIds) -
        relationshipFocusScore(left.relationship, participantIds, consequenceRelationshipIds) ||
      left.index - right.index
    )
    .map(({ relationship }) => relationship)
    .slice(0, limit);
}

function relevantRecentEvents(campaign, participantIds, limit) {
  return (campaign?.timeline ?? [])
    .map((event, index) => ({ event, index }))
    .filter(({ event }) => (event.relatedIds ?? []).some((id) => participantIds.has(id)))
    .sort((left, right) =>
      eventFocusScore(right.event, participantIds) - eventFocusScore(left.event, participantIds) ||
      right.index - left.index
    )
    .map(({ event }) => event)
    .slice(0, limit);
}

function relationshipFocusScore(relationship, focusIds, consequenceRelationshipIds) {
  return (
    (consequenceRelationshipIds.has(relationship.id) ? 5 : 0) +
    countFocusMatches([relationship.sourceId, relationship.targetId], focusIds)
  );
}

function eventFocusScore(event, focusIds) {
  return countFocusMatches(event.relatedIds ?? [], focusIds);
}

function countFocusMatches(ids = [], focusIds = new Set()) {
  return ids.reduce((score, id) => score + (focusIds.has(id) ? 1 : 0), 0);
}

function normalizeEscalationPolicy(policy = {}) {
  const level = ["none", "soft", "moderate", "hard"].includes(policy.level) ? policy.level : "none";
  return {
    level,
    reason: String(policy.reason ?? ""),
    guidance: String(policy.guidance ?? ""),
    preferredBeats: uniqueStrings(policy.preferredBeats ?? policy.allowed ?? []),
    avoid: uniqueStrings(policy.avoid ?? []),
  };
}

function asText(value) {
  if (Array.isArray(value)) {
    return value.filter(Boolean).map((entry) => String(entry).trim()).filter(Boolean).join(" ");
  }
  if (value && typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value ?? "");
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
