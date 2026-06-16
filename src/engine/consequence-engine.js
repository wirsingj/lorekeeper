const consequenceScopes = new Set(["scene", "person", "party", "place", "faction", "quest", "world"]);
const consequenceStates = new Set(["active", "resolved", "dormant"]);
const importanceLevels = new Set(["low", "medium", "high", "critical"]);

export function normalizeConsequence(input = {}, options = {}) {
  const now = options.now ?? new Date().toISOString();
  const scope = consequenceScopes.has(input.scope) ? input.scope : "scene";
  const state = consequenceStates.has(input.state) ? input.state : input.active === false ? "resolved" : "active";
  return {
    id: input.id || `consequence-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: input.title || input.summary || "Untitled consequence",
    description: asText(input.description || input.notes || input.summary || ""),
    scope,
    state,
    importance: importanceLevels.has(input.importance) ? input.importance : "medium",
    sourceSceneId: input.sourceSceneId ?? input.sceneId ?? null,
    relatedSceneIds: uniqueStrings([input.sceneId, input.sourceSceneId, ...(input.relatedSceneIds ?? [])]),
    participantIds: uniqueStrings(input.participantIds ?? input.participants ?? []),
    relatedEntityIds: uniqueStrings(input.relatedEntityIds ?? input.relatedIds ?? []),
    relationshipIds: uniqueStrings(input.relationshipIds ?? []),
    threadIds: uniqueStrings(input.threadIds ?? input.questIds ?? []),
    goalIds: uniqueStrings([
      input.linkedGoal,
      input.linkedGoalId,
      ...(input.goalIds ?? []),
      ...(input.linkedGoalIds ?? []),
    ]),
    tags: uniqueStrings(input.tags ?? []),
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
    resolvedAt: input.resolvedAt ?? (state === "resolved" ? now : null),
    resolution: input.resolution ?? "",
  };
}

export function addConsequence(campaign, input, options = {}) {
  const consequence = normalizeConsequence(input, options);
  const consequences = upsertById(campaign.consequences ?? [], consequence);
  const currentSceneId = campaign.scene?.activeSceneId ?? null;
  const appliesToCurrentScene = consequence.state === "active" && (
    !consequence.sourceSceneId ||
    consequence.sourceSceneId === currentSceneId ||
    consequence.relatedSceneIds.includes(currentSceneId)
  );
  const activeConsequenceIds = appliesToCurrentScene
    ? uniqueStrings([...(campaign.scene?.activeConsequenceIds ?? []), consequence.id])
    : campaign.scene?.activeConsequenceIds ?? [];
  const scenes = (campaign.scenes ?? []).map((scene) => {
    if (consequence.state !== "active") return scene;
    const appliesToScene = consequence.sourceSceneId === scene.id || consequence.relatedSceneIds.includes(scene.id);
    if (!appliesToScene) return scene;
    return {
      ...scene,
      consequenceIds: uniqueStrings([...(scene.consequenceIds ?? []), consequence.id]),
      updatedAt: consequence.updatedAt,
    };
  });

  return {
    ...campaign,
    consequences,
    scenes,
    scene: {
      ...(campaign.scene ?? {}),
      activeConsequenceIds,
    },
  };
}

export function resolveConsequence(campaign, consequenceId, options = {}) {
  const now = options.now ?? new Date().toISOString();
  const consequences = (campaign.consequences ?? []).map((consequence) => {
    if (consequence.id !== consequenceId) {
      return consequence;
    }
    return {
      ...consequence,
      state: "resolved",
      resolution: options.resolution ?? consequence.resolution ?? "",
      resolvedAt: now,
      updatedAt: now,
    };
  });

  return {
    ...campaign,
    consequences,
    scenes: (campaign.scenes ?? []).map((scene) => ({
      ...scene,
      consequenceIds: (scene.consequenceIds ?? []).filter((id) => id !== consequenceId),
    })),
    scene: {
      ...(campaign.scene ?? {}),
      activeConsequenceIds: (campaign.scene?.activeConsequenceIds ?? []).filter((id) => id !== consequenceId),
    },
  };
}

export function activeConsequencesForScene(campaign, sceneOrId = campaign?.scene?.activeSceneId, options = {}) {
  const sceneId = typeof sceneOrId === "string" ? sceneOrId : sceneOrId?.id;
  const participantIds = new Set([
    ...(sceneOrId?.participantIds ?? []),
    ...(sceneOrId?.partyMemberIds ?? []),
    ...(sceneOrId?.peopleIds ?? []),
    ...(sceneOrId?.presentPeopleIds ?? []),
    ...(sceneOrId?.presentPartyMemberIds ?? []),
    ...(campaign?.scene?.presentPeopleIds ?? []),
    ...(campaign?.scene?.presentPartyMemberIds ?? []),
  ]);
  const currentPlaceId = sceneOrId?.locationId ?? campaign?.scene?.currentPlaceId ?? null;
  const activeIds = new Set(campaign?.scene?.activeConsequenceIds ?? []);
  const goalIds = new Set(options.goalIds ?? []);
  const limit = options.limit ?? 6;

  return (campaign?.consequences ?? [])
    .filter((consequence) => consequence.state !== "resolved")
    .filter((consequence) => {
      if (activeIds.has(consequence.id)) return true;
      if (sceneId && (consequence.sourceSceneId === sceneId || consequence.relatedSceneIds?.includes(sceneId))) return true;
      if (currentPlaceId && consequence.relatedEntityIds?.includes(currentPlaceId)) return true;
      if ((consequence.goalIds ?? []).some((id) => goalIds.has(id))) return true;
      if ((consequence.threadIds ?? []).some((id) => goalIds.has(id))) return true;
      return (consequence.participantIds ?? []).some((id) => participantIds.has(id));
    })
    .sort((left, right) => importanceRank(right.importance) - importanceRank(left.importance))
    .slice(0, limit);
}

function importanceRank(importance) {
  return { low: 1, medium: 2, high: 3, critical: 4 }[importance] ?? 2;
}

function upsertById(records, record) {
  const index = records.findIndex((item) => item.id === record.id);
  if (index === -1) {
    return [...records, record];
  }
  return records.map((item, itemIndex) => (itemIndex === index ? record : item));
}

function uniqueStrings(values) {
  return [...new Set((values ?? []).filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim()))];
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
