import { touchCampaign } from "./schema.js";

const arrayDomains = new Set([
  "people",
  "party",
  "factions",
  "places",
  "maps",
  "items",
  "inventory",
  "lore",
  "timeline",
  "quests",
  "relationships",
]);

export function applyCanonicalChanges(campaign, changes) {
  const working = structuredClone(campaign);
  const result = applyChangesToWorkingCampaign(working, changes);

  return {
    campaign: touchCampaign(working),
    applied: result.applied,
    skipped: result.skipped,
  };
}

export function previewCanonicalChanges(campaign, changes) {
  const working = structuredClone(campaign);
  const result = applyChangesToWorkingCampaign(working, changes);

  return {
    campaign: working,
    applied: result.applied,
    skipped: result.skipped,
  };
}

function applyChangesToWorkingCampaign(working, changes) {
  const applied = [];
  const skipped = [];

  for (const change of changes) {
    const result = applyOneChange(working, change);
    if (result.applied) {
      applied.push({
        changeId: change.id,
        summary: change.summary,
        domain: change.domain,
        operation: change.operation,
      });
    } else {
      skipped.push({
        changeId: change.id,
        summary: change.summary,
        reason: result.reason,
      });
    }
  }

  return {
    applied,
    skipped,
  };
}

function applyOneChange(campaign, change) {
  const domain = normalizeDomain(change.domain);
  const operation = change.operation ?? "note";

  if (domain === "scene") {
    return mergeObjectChange(campaign.scene, change, operation);
  }

  if (domain === "combat") {
    return mergeObjectChange(campaign.combat, change, operation);
  }

  if (domain === "style") {
    return mergeObjectChange(campaign.style, change, operation);
  }

  if (domain === "rules_profile") {
    return mergeObjectChange(campaign.rulesProfile, change, operation);
  }

  if (!arrayDomains.has(domain) || !Array.isArray(campaign[domain])) {
    return {
      applied: false,
      reason: `Unsupported domain: ${change.domain}`,
    };
  }

  return applyArrayChange(campaign, campaign[domain], change, domain, operation);
}

function applyArrayChange(campaign, records, change, domain, operation) {
  const targetId = change.targetId;

  if (operation === "add") {
    const record = normalizeRecordForDomain(domain, {
      id: targetId || change.data?.id || uniqueId(domain, change.data?.name || change.data?.title || change.summary),
      ...change.data,
    });
    addHumanNote(record, change);
    records.push(record);
    applySceneHints(campaign, domain, record);
    return { applied: true };
  }

  if (!targetId) {
    return {
      applied: false,
      reason: "Missing targetId for non-add change.",
    };
  }

  const index = records.findIndex((record) => record.id === targetId);
  if (index === -1) {
    if (operation === "note") {
      const record = normalizeRecordForDomain(domain, {
        id: targetId,
        title: change.summary,
        notes: [change.summary],
        ...change.data,
      });
      records.push(record);
      applySceneHints(campaign, domain, record);
      return { applied: true };
    }

    return {
      applied: false,
      reason: `No record found for ${targetId}.`,
    };
  }

  if (operation === "remove") {
    records.splice(index, 1);
    return { applied: true };
  }

  records[index] = normalizeRecordForDomain(domain, {
    ...records[index],
    ...change.data,
  });
  addHumanNote(records[index], change);
  applySceneHints(campaign, domain, records[index]);
  return { applied: true };
}

function mergeObjectChange(target, change, operation) {
  if (operation === "remove") {
    return {
      applied: false,
      reason: "Cannot remove singleton campaign state objects.",
    };
  }

  Object.assign(target, change.data ?? {});
  addHumanNote(target, change);
  return { applied: true };
}

function addHumanNote(record, change) {
  if (!change.summary) {
    return;
  }

  if (Array.isArray(record.notes)) {
    if (!record.notes.includes(change.summary)) {
      record.notes.push(change.summary);
    }
    return;
  }

  if (typeof record.notes === "string") {
    record.notes = record.notes ? `${record.notes}\n${change.summary}` : change.summary;
    return;
  }

  record.notes = [change.summary];
}

function applySceneHints(campaign, domain, record) {
  if (domain === "places" && !campaign.scene.currentPlaceId) {
    campaign.scene.currentPlaceId = record.id;
  }

  if (domain === "party" && !campaign.scene.presentPartyMemberIds.includes(record.id)) {
    campaign.scene.presentPartyMemberIds.push(record.id);
  }

  if (domain === "people" && !campaign.scene.presentPeopleIds.includes(record.id)) {
    campaign.scene.presentPeopleIds.push(record.id);
  }

  if (domain === "quests" && !campaign.scene.activeQuestIds.includes(record.id)) {
    campaign.scene.activeQuestIds.push(record.id);
  }
}

function normalizeRecordForDomain(domain, record) {
  const now = new Date().toISOString();

  if (domain === "party") {
    const name = record.name || record.title || "Unnamed party member";
    return {
      id: record.id || uniqueId("party", name),
      name,
      type: record.type || "player_character",
      playerRole: record.playerRole || record.role || "party member",
      ancestryClass:
        record.ancestryClass ||
        record.ancestry_class ||
        [record.ancestry, record.class].filter(Boolean).join(" ") ||
        record.role ||
        "thief",
      stats: normalizeStats(record.stats ?? record),
      abilities: normalizeList(record.abilities || record.features || record.skills),
      notes: normalizeNotes(record.notes || record.summary || record.description),
      createdAt: record.createdAt || now,
      updatedAt: now,
    };
  }

  if (domain === "people") {
    const name = record.name || record.title || "Unnamed person";
    return {
      id: record.id || uniqueId("person", name),
      name,
      type: record.type || "npc",
      role: record.role || record.occupation || "",
      summary: record.summary || record.description || normalizeNotes(record.notes)[0] || "",
      notes: normalizeNotes(record.notes || record.summary || record.description),
      relatedIds: normalizeList(record.relatedIds || record.related_ids),
      locationId: record.locationId || record.location_id || null,
      createdAt: record.createdAt || now,
      updatedAt: now,
    };
  }

  if (domain === "places") {
    const name = record.name || record.title || "Unnamed place";
    return {
      id: record.id || uniqueId("place", name),
      name,
      type: record.type || "location",
      region: record.region || "",
      summary: record.summary || record.description || normalizeNotes(record.notes)[0] || "",
      notes: normalizeNotes(record.notes || record.summary || record.description),
      connectedPlaceIds: normalizeList(record.connectedPlaceIds || record.connected_place_ids),
      createdAt: record.createdAt || now,
      updatedAt: now,
    };
  }

  if (domain === "quests") {
    const title = record.title || record.name || "Unresolved thread";
    return {
      id: record.id || uniqueId("quest", title),
      title,
      status: record.status || "active",
      stakes: record.stakes || record.summary || record.description || "Unresolved campaign thread.",
      openQuestions: normalizeList(record.openQuestions || record.open_questions),
      relatedIds: normalizeList(record.relatedIds || record.related_ids),
      createdAt: record.createdAt || now,
      updatedAt: now,
    };
  }

  if (domain === "lore") {
    const title = record.title || record.name || "Lore note";
    return {
      id: record.id || uniqueId("lore", title),
      title,
      canon: record.canon ?? true,
      notes: normalizeNotes(record.notes || record.summary || record.description),
      tags: normalizeList(record.tags),
      createdAt: record.createdAt || now,
      updatedAt: now,
    };
  }

  if (domain === "items") {
    const name = record.name || record.title || "Unnamed item";
    return {
      id: record.id || uniqueId("item", name),
      name,
      type: record.type || "item",
      summary: record.summary || record.description || normalizeNotes(record.notes)[0] || "",
      notes: normalizeNotes(record.notes || record.summary || record.description),
      createdAt: record.createdAt || now,
      updatedAt: now,
    };
  }

  if (domain === "inventory") {
    const itemId = record.itemId || record.item_id || record.id || uniqueId("inventory", record.name || record.title);
    return {
      id: record.id || itemId,
      itemId,
      name: record.name || record.title || itemId,
      quantity: record.quantity ?? 1,
      carriedBy: record.carriedBy || record.carried_by || "party",
      notes: normalizeNotes(record.notes || record.summary || record.description),
      createdAt: record.createdAt || now,
      updatedAt: now,
    };
  }

  return {
    ...record,
    id: record.id || uniqueId(domain, record.name || record.title || "record"),
    notes: normalizeNotes(record.notes || record.summary || record.description),
    createdAt: record.createdAt || now,
    updatedAt: now,
  };
}

function normalizeStats(record) {
  return {
    hp: record.hp ?? record.hitPoints ?? record.hit_points ?? null,
    armorClass: record.armorClass ?? record.armor_class ?? record.ac ?? null,
    abilities: record.abilityScores ?? record.ability_scores ?? record.abilitiesScores ?? {},
    spells: normalizeList(record.spells),
  };
}

function normalizeList(value) {
  if (Array.isArray(value)) {
    return value.filter((item) => item !== null && item !== undefined && String(item).trim() !== "");
  }

  if (typeof value === "string") {
    return value
      .split(/[,;\n]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function normalizeNotes(value) {
  return normalizeList(value);
}

function uniqueId(prefix, value) {
  return `${prefix}-${slugify(value || "record")}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function slugify(value) {
  return String(value)
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizeDomain(domain) {
  if (domain === "party_member" || domain === "player_character") {
    return "party";
  }

  if (domain === "person" || domain === "npc" || domain === "characters") {
    return "people";
  }

  if (domain === "place" || domain === "location" || domain === "region") {
    return "places";
  }

  if (domain === "quest" || domain === "thread" || domain === "threads") {
    return "quests";
  }

  if (domain === "lore_note" || domain === "canon") {
    return "lore";
  }

  if (domain === "item" || domain === "thing" || domain === "things" || domain === "artifact") {
    return "items";
  }

  if (domain === "relationships") {
    return "relationships";
  }

  if (domain === "relationship") {
    return "relationships";
  }

  if (domain === "rules" || domain === "rulesProfile") {
    return "rules_profile";
  }

  return domain;
}
