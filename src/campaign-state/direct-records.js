import { touchCampaign } from "./schema.js";

const domainLabels = {
  party: "party member",
  people: "person",
  places: "place",
  quests: "quest",
  lore: "lore note",
  items: "thing",
  assets: "asset",
};

export function addCampaignRecord(campaign, input) {
  const domain = normalizeDomain(input.domain);
  const now = new Date().toISOString();
  const record = createRecord(domain, input, now);
  const working = structuredClone(campaign);

  if (!Array.isArray(working[domain])) {
    throw new Error(`Unsupported direct-edit domain: ${input.domain}`);
  }

  working[domain].push(record);
  applySceneHints(working, domain, record);

  return {
    campaign: touchCampaign(working),
    record,
    providerSyncNote: buildProviderSyncNote(domain, record),
  };
}

function createRecord(domain, input, now) {
  const name = requireName(input);
  const notes = splitNotes(input.notes || input.summary);

  if (domain === "party") {
    return {
      id: input.id || uniqueId("party", name),
      name,
      type: "player_character",
      ancestryClass: input.role || "adventurer",
      stats: {
        hp: null,
        armorClass: null,
        abilities: {},
      },
      abilities: [],
      notes,
      createdAt: now,
      updatedAt: now,
    };
  }

  if (domain === "people") {
    return {
      id: input.id || uniqueId("person", name),
      name,
      type: input.type || "npc",
      role: input.role || "",
      summary: input.summary || notes[0] || "",
      notes,
      relatedIds: [],
      createdAt: now,
      updatedAt: now,
    };
  }

  if (domain === "places") {
    return {
      id: input.id || uniqueId("place", name),
      name,
      type: input.type || "location",
      region: input.region || "",
      summary: input.summary || notes[0] || "",
      notes,
      connectedPlaceIds: [],
      createdAt: now,
      updatedAt: now,
    };
  }

  if (domain === "quests") {
    return {
      id: input.id || uniqueId("quest", name),
      title: name,
      status: input.status || "active",
      stakes: input.summary || notes[0] || "Unresolved campaign thread.",
      openQuestions: [],
      relatedIds: [],
      createdAt: now,
      updatedAt: now,
    };
  }

  if (domain === "lore") {
    return {
      id: input.id || uniqueId("lore", name),
      title: name,
      canon: input.canon ?? true,
      notes,
      tags: splitTags(input.tags),
      createdAt: now,
      updatedAt: now,
    };
  }

  if (domain === "items") {
    return {
      id: input.id || uniqueId("item", name),
      name,
      type: input.type || input.role || "thing",
      summary: input.summary || notes[0] || "",
      notes,
      createdAt: now,
      updatedAt: now,
    };
  }

  if (domain === "assets") {
    return {
      id: input.id || uniqueId("asset", name),
      name,
      kind: input.kind || "image",
      path: input.path || "",
      mediaType: input.mediaType || "",
      notes,
      createdAt: now,
      updatedAt: now,
    };
  }

  throw new Error(`Unsupported direct-edit domain: ${domain}`);
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

function buildProviderSyncNote(domain, record) {
  const label = domainLabels[domain] || domain;
  const title = record.name || record.title;
  const summary = record.summary || record.stakes || record.notes?.[0] || record.path || "No notes supplied.";
  return `(Lorekeeper canon update: Added ${label} "${title}". ${summary} Treat this as established campaign canon.)`;
}

function normalizeDomain(domain) {
  if (domain === "person" || domain === "npc") {
    return "people";
  }

  if (domain === "place") {
    return "places";
  }

  if (domain === "quest" || domain === "thread") {
    return "quests";
  }

  if (domain === "lore_note") {
    return "lore";
  }

  if (domain === "item" || domain === "thing" || domain === "things" || domain === "artifact") {
    return "items";
  }

  if (domain === "asset" || domain === "source_image") {
    return "assets";
  }

  return domain;
}

function requireName(input) {
  const name = String(input.name || input.title || "").trim();
  if (!name) {
    throw new Error("Name is required.");
  }

  return name;
}

function splitNotes(value) {
  return String(value || "")
    .split(/\n+/)
    .map((note) => note.trim())
    .filter(Boolean);
}

function splitTags(value) {
  return String(value || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function uniqueId(prefix, name) {
  return `${prefix}-${slugify(name)}-${Date.now().toString(36)}`;
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
