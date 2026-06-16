import { buildHiddenStoryThreads } from "../context-packs/story-threads.js";

const horizons = Object.freeze(["long", "mid", "short"]);
const horizonAliases = Object.freeze({
  long: "long",
  long_term: "long",
  "long-term": "long",
  campaign: "long",
  world: "long",
  mid: "mid",
  medium: "mid",
  medium_term: "mid",
  mid_term: "mid",
  "medium-term": "mid",
  chapter: "mid",
  region: "mid",
  short: "short",
  short_term: "short",
  "short-term": "short",
  scene: "short",
  immediate: "short",
  now: "short",
});

// LivingWorldEngine turns existing canon into "world memory" projections.
// It does not create canon by itself; it makes consequences, relationships,
// location scars, faction memory, and DM goal horizons easy to retrieve.
export function buildGoalHorizon(campaign = {}, options = {}) {
  const scene = options.scene ?? currentSceneLike(campaign);
  const focusIds = new Set(uniqueStrings([
    scene.id,
    scene.activeSceneId,
    scene.locationId ?? scene.currentPlaceId,
    ...(scene.threadIds ?? scene.activeQuestIds ?? []),
    ...(scene.participantIds ?? []),
    ...(scene.partyMemberIds ?? scene.presentPartyMemberIds ?? []),
    ...(scene.peopleIds ?? scene.presentPeopleIds ?? []),
  ]));
  const explicitGoals = normalizeGoalContainer(campaign.goalHorizon ?? campaign.goals ?? {});
  const hiddenGoals = buildHiddenStoryThreads(campaign).map(goalFromStoryThread);
  const questGoals = (campaign.quests ?? [])
    .filter((quest) => quest?.status !== "completed")
    .filter((quest) => !isHiddenStoryRecord(quest))
    .map(goalFromQuest)
    .filter(Boolean);
  const sceneGoals = normalizeList(scene.goals ?? scene.sceneGoals)
    .map((goal, index) => ({
      id: `scene-goal-${index + 1}`,
      title: goal,
      status: "active",
      horizon: "short",
      stakes: scene.immediateSituation || "",
      source: "scene",
      linkedIds: uniqueStrings([
        scene.id,
        scene.locationId ?? scene.currentPlaceId,
        ...(scene.threadIds ?? scene.activeQuestIds ?? []),
        ...(scene.participantIds ?? []),
        ...(scene.partyMemberIds ?? scene.presentPartyMemberIds ?? []),
        ...(scene.peopleIds ?? scene.presentPeopleIds ?? []),
      ]),
    }));

  const allGoals = [
    ...explicitGoals,
    ...questGoals,
    ...hiddenGoals,
    ...sceneGoals,
  ].filter((goal) => goal.status !== "completed");

  const grouped = {
    longTerm: [],
    mediumTerm: [],
    shortTerm: [],
  };
  for (const goal of dedupeGoals(allGoals)) {
    const key = horizonKey(goal.horizon);
    grouped[key].push(goal);
  }
  for (const key of Object.keys(grouped)) {
    grouped[key] = grouped[key].sort((left, right) => goalFocusScore(right, focusIds) - goalFocusScore(left, focusIds));
  }

  return {
    longTerm: grouped.longTerm.slice(0, options.longLimit ?? 4),
    mediumTerm: grouped.mediumTerm.slice(0, options.mediumLimit ?? 5),
    shortTerm: grouped.shortTerm.slice(0, options.shortLimit ?? 5),
  };
}

export function goalIdsFromHorizon(goalHorizon = {}) {
  return uniqueStrings([
    ...(goalHorizon.longTerm ?? []).flatMap(goalIdentityValues),
    ...(goalHorizon.mediumTerm ?? []).flatMap(goalIdentityValues),
    ...(goalHorizon.shortTerm ?? []).flatMap(goalIdentityValues),
  ]);
}

export function buildLivingWorldMemory(campaign = {}, options = {}) {
  const scene = options.scene ?? campaign.scene ?? {};
  const goalHorizon = options.goalHorizon ?? buildGoalHorizon(campaign, { scene });
  const goalIds = new Set(goalIdsFromHorizon(goalHorizon));
  const focusIds = new Set(uniqueStrings([
    ...(options.focusIds ?? []),
    scene.id,
    scene.activeSceneId,
    scene.locationId ?? scene.currentPlaceId,
    ...(scene.participantIds ?? []),
    ...(scene.partyMemberIds ?? scene.presentPartyMemberIds ?? []),
    ...(scene.peopleIds ?? scene.presentPeopleIds ?? []),
    ...(scene.threadIds ?? scene.activeQuestIds ?? []),
    ...goalIds,
  ]));

  const consequences = scoreAndLimit(
    campaign.consequences ?? [],
    (consequence) => scoreConsequence(consequence, focusIds, goalIds),
    options.consequenceLimit ?? 8,
  );
  const relationships = scoreAndLimit(
    campaign.relationships ?? [],
    (relationship) => scoreLinkedRecord(relationship, focusIds, goalIds),
    options.relationshipLimit ?? 8,
  );
  const people = scoreAndLimit(
    campaign.people ?? [],
    (person) => scoreLinkedRecord(person, focusIds, goalIds) + scoreRecordMemory(person),
    options.peopleLimit ?? 8,
  );
  const factions = scoreAndLimit(
    campaign.factions ?? [],
    (faction) => scoreLinkedRecord(faction, focusIds, goalIds) + scoreRecordMemory(faction),
    options.factionLimit ?? 5,
  );
  const places = scoreAndLimit(
    campaign.places ?? [],
    (place) => scoreLinkedRecord(place, focusIds, goalIds) + scoreRecordMemory(place),
    options.placeLimit ?? 5,
  );

  return {
    goalHorizon,
    goalIds: [...goalIds],
    consequences,
    relationships,
    people,
    factions,
    places,
    score: livingWorldScore({ consequences, relationships, people, factions, places, goalHorizon }),
    retrievalPriority: [
      "current scene",
      "active short-term goals",
      "relevant consequences",
      "relevant relationships",
      "active medium-term goals",
      "active threads",
      "long-term goals",
      "recent history",
    ],
  };
}

export function livingWorldScore(memory = {}) {
  const goalCount = [
    ...(memory.goalHorizon?.longTerm ?? []),
    ...(memory.goalHorizon?.mediumTerm ?? []),
    ...(memory.goalHorizon?.shortTerm ?? []),
  ].length;
  const memoryCount =
    (memory.consequences?.length ?? 0) +
    (memory.relationships?.length ?? 0) +
    (memory.people?.length ?? 0) +
    (memory.factions?.length ?? 0) +
    (memory.places?.length ?? 0);
  const raw = goalCount * 12 + memoryCount * 8;
  return {
    value: Math.max(0, Math.min(100, raw)),
    goalCount,
    memoryCount,
    verdict: raw >= 60
      ? "world_memory_present"
      : raw >= 28
        ? "world_memory_thin"
        : "world_memory_missing",
    question: "If the same NPC, faction, or place appears again later, would they react differently because of history?",
  };
}

function goalFromStoryThread(thread = {}) {
  return {
    id: thread.id || `story-${slugify(thread.title)}`,
    title: thread.title,
    status: thread.status || "active",
    horizon: normalizeHorizon(thread.horizon),
    stakes: thread.stakes || "",
    openQuestions: thread.openQuestions ?? [],
    nextBeat: thread.nextBeat || "",
    source: "hidden_story",
    visibility: "dm_only",
    linkedIds: uniqueStrings([thread.id, ...(thread.linkedIds ?? []), ...(thread.relatedIds ?? [])]),
  };
}

function goalFromQuest(quest = {}) {
  const title = String(quest.title || quest.name || "").trim();
  if (!title) {
    return null;
  }
  return {
    id: quest.id || `quest-${slugify(title)}`,
    title,
    status: quest.status || "active",
    horizon: normalizeHorizon(quest.horizon || quest.timeHorizon || quest.goalHorizon || quest.data?.horizon || inferQuestHorizon(quest)),
    stakes: quest.stakes || quest.summary || quest.description || "",
    openQuestions: normalizeList(quest.openQuestions || quest.open_questions),
    nextBeat: quest.nextBeat || quest.next_beat || "",
    source: "quest",
    visibility: quest.visibility || "player_visible",
    linkedIds: uniqueStrings([
      quest.id,
      ...(quest.linkedIds ?? []),
      ...(quest.relatedIds ?? []),
      ...(quest.participantIds ?? []),
      ...(quest.factionIds ?? []),
      ...(quest.placeIds ?? []),
    ]),
  };
}

function normalizeGoalContainer(container = {}) {
  if (Array.isArray(container)) {
    return container.map(normalizeGoalRecord).filter(Boolean);
  }
  return [
    ...(container.longTerm ?? container.long ?? []).map((goal) => normalizeGoalRecord(goal, "long")),
    ...(container.mediumTerm ?? container.midTerm ?? container.medium ?? container.mid ?? []).map((goal) => normalizeGoalRecord(goal, "mid")),
    ...(container.shortTerm ?? container.short ?? []).map((goal) => normalizeGoalRecord(goal, "short")),
  ].filter(Boolean);
}

function normalizeGoalRecord(input, fallbackHorizon = "mid") {
  if (typeof input === "string") {
    return {
      id: `goal-${slugify(input)}`,
      title: input,
      status: "active",
      horizon: fallbackHorizon,
      stakes: "",
      source: "explicit",
      linkedIds: [],
    };
  }
  if (!input || typeof input !== "object") {
    return null;
  }
  const title = String(input.title || input.name || input.summary || "").trim();
  if (!title) {
    return null;
  }
  return {
    id: input.id || `goal-${slugify(title)}`,
    title,
    status: input.status || "active",
    horizon: normalizeHorizon(input.horizon || input.timeHorizon || fallbackHorizon),
    stakes: input.stakes || input.description || "",
    openQuestions: normalizeList(input.openQuestions || input.open_questions),
    nextBeat: input.nextBeat || input.next_beat || "",
    source: input.source || "explicit",
    visibility: input.visibility || "dm_only",
    linkedIds: uniqueStrings([...(input.linkedIds ?? []), ...(input.relatedIds ?? []), input.linkedGoalId]),
  };
}

function scoreConsequence(consequence = {}, focusIds = new Set(), goalIds = new Set()) {
  if (consequence.state === "resolved") {
    return 0;
  }
  const importance = { low: 1, medium: 2, high: 4, critical: 6 }[consequence.importance] ?? 2;
  return importance +
    scoreIds(recordLinkIds(consequence), focusIds, goalIds) +
    (goalLinked(consequence, goalIds) ? 8 : 0);
}

function scoreLinkedRecord(record = {}, focusIds = new Set(), goalIds = new Set()) {
  return scoreIds(recordLinkIds(record), focusIds, goalIds) + (goalLinked(record, goalIds) ? 6 : 0);
}

function scoreRecordMemory(record = {}) {
  return [
    record.memory,
    record.memories,
    record.reputation,
    record.history,
    record.scars,
    record.notes,
    record.summary,
  ].some(hasMeaningfulText) ? 2 : 0;
}

function scoreIds(ids = [], focusIds = new Set(), goalIds = new Set()) {
  return uniqueStrings(ids).reduce((score, id) => {
    if (focusIds.has(id)) return score + 5;
    if (goalIds.has(id)) return score + 4;
    return score;
  }, 0);
}

function goalLinked(record = {}, goalIds = new Set()) {
  return recordLinkIds(record).some((id) => goalIds.has(id));
}

function recordLinkIds(record = {}) {
  return uniqueStrings([
    record.id,
    record.sourceId,
    record.targetId,
    record.locationId,
    record.currentPlaceId,
    record.linkedGoal,
    record.linkedGoalId,
    ...(record.goalIds ?? []),
    ...(record.linkedGoalIds ?? []),
    ...(record.threadIds ?? []),
    ...(record.questIds ?? []),
    ...(record.relatedIds ?? []),
    ...(record.relatedEntityIds ?? []),
    ...(record.participantIds ?? []),
    ...(record.factionIds ?? []),
    ...(record.placeIds ?? []),
  ]);
}

function scoreAndLimit(records, scoreFn, limit) {
  return records
    .map((record, index) => ({ record, index, score: scoreFn(record) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map((entry) => ({ ...entry.record, livingWorldScore: entry.score }))
    .slice(0, limit);
}

function dedupeGoals(goals = []) {
  const seen = new Set();
  const result = [];
  for (const goal of goals) {
    const key = goal.id || goal.title.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(goal);
  }
  return result;
}

function goalIdentityValues(goal = {}) {
  return uniqueStrings([goal.id, goal.title, ...(goal.linkedIds ?? [])]);
}

function goalFocusScore(goal = {}, focusIds = new Set()) {
  return goalIdentityValues(goal).reduce((score, id) => score + (focusIds.has(id) ? 1 : 0), 0);
}

function horizonKey(horizon) {
  const normalized = normalizeHorizon(horizon);
  if (normalized === "long") return "longTerm";
  if (normalized === "short") return "shortTerm";
  return "mediumTerm";
}

function normalizeHorizon(value = "") {
  const normalized = String(value || "").toLowerCase().trim();
  return horizonAliases[normalized] || "mid";
}

function inferQuestHorizon(quest = {}) {
  if (quest.visibility === "dm_only" || isHiddenStoryRecord(quest)) {
    return quest.data?.horizon || quest.horizon || "mid";
  }
  const text = `${quest.title || ""} ${quest.stakes || ""} ${quest.summary || ""}`.toLowerCase();
  if (/\b(campaign|world|king|lich|ancient|prophecy|major threat|final|return)\b/.test(text)) {
    return "long";
  }
  if (/\b(scene|now|convince|ask|escape|cross|enter|current)\b/.test(text)) {
    return "short";
  }
  return "mid";
}

function isHiddenStoryRecord(record = {}) {
  return (
    record?.visibility === "dm_only" &&
    (record.threadType === "story_arc" ||
      record.kind === "story_arc" ||
      record.type === "story_arc" ||
      record.data?.threadType === "story_arc")
  );
}

function hasMeaningfulText(value) {
  if (Array.isArray(value)) {
    return value.some(hasMeaningfulText);
  }
  if (value && typeof value === "object") {
    return Object.values(value).some(hasMeaningfulText);
  }
  return String(value ?? "").trim().length > 0;
}

function normalizeList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  return String(value || "")
    .split(/[,;\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function uniqueStrings(values) {
  return [...new Set((values ?? []).filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim()))];
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "goal";
}

function currentSceneLike(campaign = {}) {
  const activeSceneId = campaign.scene?.activeSceneId;
  const explicit = activeSceneId
    ? (campaign.scenes ?? []).find((scene) => scene.id === activeSceneId)
    : null;
  if (explicit) {
    return explicit;
  }
  return campaign.scene ?? {};
}
