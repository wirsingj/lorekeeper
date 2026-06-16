export function applyFactionMemory(campaign, input = {}, options = {}) {
  const now = options.now ?? new Date().toISOString();
  const factions = (campaign.factions ?? []).map((faction) => normalizeFactionMemoryRecord(faction, { now }));
  const id = stringOrEmpty(input.id ?? input.factionId) || memoryId("faction", input.name ?? input.title);
  const index = factions.findIndex((faction) =>
    faction.id === id ||
    normalizeName(faction.name || faction.title) === normalizeName(input.name || input.title)
  );
  const existing = index === -1 ? { id, name: input.name || input.title || id } : factions[index];
  const updated = normalizeFactionMemoryRecord({
    ...existing,
    ...input,
    id: existing.id || id,
    memory: uniqueStrings([...normalizeList(existing.memory), ...memoryNotes(input)]),
    beliefs: uniqueStrings([...normalizeList(existing.beliefs), ...normalizeList(input.beliefs)]),
    wants: uniqueStrings([...normalizeList(existing.wants), ...normalizeList(input.wants)]),
    fears: uniqueStrings([...normalizeList(existing.fears), ...normalizeList(input.fears)]),
    blame: uniqueStrings([...normalizeList(existing.blame), ...normalizeList(input.blame)]),
    goalIds: uniqueStrings([
      ...(existing.goalIds ?? []),
      ...(input.goalIds ?? []),
      ...(input.linkedGoalIds ?? []),
      input.linkedGoal,
      input.linkedGoalId,
    ]),
    relatedIds: uniqueStrings([
      ...(existing.relatedIds ?? []),
      ...(input.relatedIds ?? []),
      ...(input.relatedEntityIds ?? []),
      ...(input.peopleIds ?? []),
      ...(input.placeIds ?? []),
      ...(input.relationshipIds ?? []),
    ]),
    updatedAt: now,
  }, { now });
  return {
    campaign: {
      ...campaign,
      factions: upsertAt(factions, updated, index),
    },
    faction: updated,
  };
}

export function applyLocationMemory(campaign, input = {}, options = {}) {
  const now = options.now ?? new Date().toISOString();
  const places = (campaign.places ?? []).map((place) => normalizeLocationMemoryRecord(place, { now }));
  const id = stringOrEmpty(input.id ?? input.placeId ?? input.locationId) || memoryId("place", input.name ?? input.title);
  const index = places.findIndex((place) =>
    place.id === id ||
    normalizeName(place.name || place.title) === normalizeName(input.name || input.title)
  );
  const existing = index === -1 ? { id, name: input.name || input.title || id } : places[index];
  const updated = normalizeLocationMemoryRecord({
    ...existing,
    ...input,
    id: existing.id || id,
    memory: uniqueStrings([...normalizeList(existing.memory), ...memoryNotes(input)]),
    scars: uniqueStrings([...normalizeList(existing.scars), ...normalizeList(input.scars ?? input.damage)]),
    history: uniqueStrings([...normalizeList(existing.history), ...normalizeList(input.history)]),
    discoveries: uniqueStrings([...normalizeList(existing.discoveries), ...normalizeList(input.discoveries)]),
    goalIds: uniqueStrings([
      ...(existing.goalIds ?? []),
      ...(input.goalIds ?? []),
      ...(input.linkedGoalIds ?? []),
      input.linkedGoal,
      input.linkedGoalId,
    ]),
    relatedIds: uniqueStrings([
      ...(existing.relatedIds ?? []),
      ...(input.relatedIds ?? []),
      ...(input.relatedEntityIds ?? []),
      ...(input.peopleIds ?? []),
      ...(input.factionIds ?? []),
      ...(input.relationshipIds ?? []),
    ]),
    updatedAt: now,
  }, { now });
  return {
    campaign: {
      ...campaign,
      places: upsertAt(places, updated, index),
    },
    place: updated,
  };
}

export function normalizeFactionMemoryRecord(input = {}, options = {}) {
  const now = options.now ?? new Date().toISOString();
  const name = input.name || input.title || input.id || "Unnamed faction";
  return {
    ...input,
    id: input.id || memoryId("faction", name),
    name,
    type: input.type || "faction",
    summary: input.summary || input.description || normalizeList(input.memory ?? input.notes)[0] || "",
    stance: input.stance || input.disposition || "",
    memory: normalizeList(input.memory ?? input.memories ?? input.notes ?? input.summary),
    beliefs: normalizeList(input.beliefs),
    wants: normalizeList(input.wants ?? input.goals),
    fears: normalizeList(input.fears),
    blame: normalizeList(input.blame),
    notes: normalizeList(input.notes ?? input.memory ?? input.summary),
    goalIds: uniqueStrings([...(input.goalIds ?? []), ...(input.linkedGoalIds ?? []), input.linkedGoal, input.linkedGoalId]),
    relatedIds: uniqueStrings([...(input.relatedIds ?? []), ...(input.relatedEntityIds ?? [])]),
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
  };
}

export function normalizeLocationMemoryRecord(input = {}, options = {}) {
  const now = options.now ?? new Date().toISOString();
  const name = input.name || input.title || input.id || "Unnamed place";
  return {
    ...input,
    id: input.id || memoryId("place", name),
    name,
    type: input.type || "location",
    region: input.region || "",
    summary: input.summary || input.description || normalizeList(input.memory ?? input.notes)[0] || "",
    memory: normalizeList(input.memory ?? input.memories ?? input.notes ?? input.summary),
    scars: normalizeList(input.scars ?? input.damage),
    history: normalizeList(input.history),
    discoveries: normalizeList(input.discoveries),
    notes: normalizeList(input.notes ?? input.memory ?? input.summary),
    connectedPlaceIds: normalizeList(input.connectedPlaceIds || input.connected_place_ids),
    goalIds: uniqueStrings([...(input.goalIds ?? []), ...(input.linkedGoalIds ?? []), input.linkedGoal, input.linkedGoalId]),
    relatedIds: uniqueStrings([...(input.relatedIds ?? []), ...(input.relatedEntityIds ?? [])]),
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
  };
}

function memoryNotes(input = {}) {
  return normalizeList(input.memory ?? input.memories ?? input.note ?? input.summary ?? input.description);
}

function upsertAt(records, record, index) {
  return index === -1
    ? [...records, record]
    : records.map((item, itemIndex) => (itemIndex === index ? record : item));
}

function memoryId(prefix, value) {
  return `${prefix}-${slugify(value || "memory")}`;
}

function normalizeList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item ?? "").trim()).filter(Boolean);
  }
  if (value && typeof value === "object") {
    return Object.values(value).flatMap(normalizeList);
  }
  return String(value ?? "")
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function uniqueStrings(values) {
  return [...new Set((values ?? []).filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim()))];
}

function stringOrEmpty(value) {
  return String(value ?? "").trim();
}

function normalizeName(value) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "memory";
}
