import { contextPackKinds } from "../campaign-state/schema.js";
import { findById, labelEntity } from "../campaign-state/formatters.js";

const DEFAULT_PACK_KINDS = [
  contextPackKinds.SCENE,
  contextPackKinds.HISTORY,
  contextPackKinds.PARTY,
  contextPackKinds.NEARBY,
  contextPackKinds.INVENTORY,
  contextPackKinds.THREADS,
  contextPackKinds.COMBAT,
  contextPackKinds.RULES,
  contextPackKinds.RELATIONSHIPS,
  contextPackKinds.LORE,
  contextPackKinds.STYLE,
];

export function buildContextPack(campaign, options = {}) {
  const kinds = options.kinds ?? DEFAULT_PACK_KINDS;

  return {
    campaignId: campaign.id,
    campaignTitle: campaign.title,
    generatedAt: new Date().toISOString(),
    purpose: options.purpose ?? "next_campaign_turn",
    sections: kinds
      .map((kind) => buildSection(kind, campaign))
      .filter((section) => section && section.entries.length > 0),
  };
}

export function renderContextPackMarkdown(contextPack) {
  const lines = [
    `# Context Pack: ${contextPack.campaignTitle}`,
    "",
    `Purpose: ${contextPack.purpose}`,
    "",
  ];

  for (const section of contextPack.sections) {
    lines.push(`## ${section.title}`);
    for (const entry of section.entries) {
      lines.push(`- ${entry}`);
    }
    lines.push("");
  }

  return lines.join("\n").trim();
}

function buildSection(kind, campaign) {
  switch (kind) {
    case contextPackKinds.SCENE:
      return buildSceneSection(campaign);
    case contextPackKinds.HISTORY:
      return buildHistorySection(campaign);
    case contextPackKinds.PARTY:
      return buildPartySection(campaign);
    case contextPackKinds.NEARBY:
      return buildNearbySection(campaign);
    case contextPackKinds.INVENTORY:
      return buildInventorySection(campaign);
    case contextPackKinds.THREADS:
      return buildThreadsSection(campaign);
    case contextPackKinds.COMBAT:
      return buildCombatSection(campaign);
    case contextPackKinds.RULES:
      return buildRulesProfileSection(campaign);
    case contextPackKinds.RELATIONSHIPS:
      return buildRelationshipSection(campaign);
    case contextPackKinds.LORE:
      return buildLoreSection(campaign);
    case contextPackKinds.STYLE:
      return buildStyleSection(campaign);
    default:
      return null;
  }
}

function buildHistorySection(campaign) {
  const messages = (campaign.sessionLog?.messages ?? []).slice(-8);

  return {
    kind: contextPackKinds.HISTORY,
    title: "Recent Play History",
    entries: messages.map((message) => {
      const speaker = message.title || (message.role === "player" ? "Player" : "DM");
      return `${speaker}: ${message.body}`;
    }),
  };
}

function buildSceneSection(campaign) {
  const place = findById(campaign.places, campaign.scene.currentPlaceId);
  const presentPeople = campaign.scene.presentPeopleIds.map((id) => labelEntity(campaign, id));

  return {
    kind: contextPackKinds.SCENE,
    title: "Current Scene",
    entries: [
      `Status: ${campaign.scene.status}`,
      `Location: ${place ? `${place.name} - ${place.summary}` : "Unknown"}`,
      `Immediate situation: ${campaign.scene.immediateSituation || "Not set."}`,
      `Present NPCs: ${presentPeople.length > 0 ? presentPeople.join(", ") : "None recorded."}`,
      ...campaign.scene.localNotes.map((note) => `Scene note: ${note}`),
    ],
  };
}

function buildPartySection(campaign) {
  const presentIds = new Set(campaign.scene.presentPartyMemberIds);
  const party = campaign.party.filter((member) => presentIds.size === 0 || presentIds.has(member.id));

  return {
    kind: contextPackKinds.PARTY,
    title: "Active Party",
    entries: party.map((member) => {
      const hp = member.stats?.hp ? `HP ${member.stats.hp.current}/${member.stats.hp.max}` : "HP unknown";
      const abilities = member.stats?.abilities?.length ? member.stats.abilities.join(", ") : "abilities unknown";
      const spells = member.stats?.spells?.length ? ` Spells: ${member.stats.spells.join(", ")}.` : "";
      return `${member.name} (${member.ancestryClass}, ${hp}). Abilities: ${abilities}.${spells} Notes: ${(member.notes ?? []).join(" ")}`;
    }),
  };
}

function buildNearbySection(campaign) {
  const nearbyPlaces = campaign.scene.nearbyPlaceIds
    .map((id) => findById(campaign.places, id))
    .filter(Boolean);
  const nearbyPeople = campaign.people.filter(
    (person) =>
      person.locationId === campaign.scene.currentPlaceId ||
      campaign.scene.presentPeopleIds.includes(person.id),
  );

  return {
    kind: contextPackKinds.NEARBY,
    title: "Nearby People And Places",
    entries: [
      ...nearbyPeople.map((person) => `${person.name}: ${person.role}. ${(person.notes ?? []).join(" ")}`),
      ...nearbyPlaces.map((place) => `${place.name}: ${place.summary}`),
    ],
  };
}

function buildInventorySection(campaign) {
  return {
    kind: contextPackKinds.INVENTORY,
    title: "Current Inventory",
    entries: campaign.inventory.map((entry) => {
      const holder = labelEntity(campaign, entry.holderId);
      const item = findById(campaign.items, entry.itemId);
      return `${holder} carries ${entry.quantity} x ${item?.name ?? entry.itemId}. ${entry.notes ?? ""} ${(item?.notes ?? []).join(" ")}`.trim();
    }),
  };
}

function buildThreadsSection(campaign) {
  const active = campaign.quests.filter((quest) => quest.status !== "completed");

  return {
    kind: contextPackKinds.THREADS,
    title: "Active Quests And Unresolved Threads",
    entries: active.map((quest) => {
      const questions = quest.openQuestions?.length ? ` Open questions: ${quest.openQuestions.join(" ")}` : "";
      return `${quest.title} (${quest.status}). Stakes: ${quest.stakes}.${questions}`;
    }),
  };
}

function buildCombatSection(campaign) {
  const combat = campaign.combat;
  const entries = [
    `In combat: ${combat.inCombat ? "yes" : "no"}`,
    `Turn format: ${combat.turnFormat}`,
    ...combat.preferences.map((preference) => `Preference: ${preference}`),
  ];

  if (combat.inCombat) {
    entries.push(`Round: ${combat.round ?? "unknown"}`);
    entries.push(`Initiative: ${combat.initiative.map((id) => labelEntity(campaign, id)).join(", ") || "unknown"}`);
    entries.push(`Enemies: ${combat.enemies.map((enemy) => `${enemy.name} (${enemy.hp ?? "HP unknown"})`).join(", ")}`);
    entries.push(`Conditions: ${combat.conditions.join(", ") || "none recorded"}`);
  }

  return {
    kind: contextPackKinds.COMBAT,
    title: "Combat State",
    entries,
  };
}

function buildRulesProfileSection(campaign) {
  const profile = campaign.rulesProfile;
  if (!profile) {
    return null;
  }

  return {
    kind: contextPackKinds.RULES,
    title: "Rules Profile And Mechanical Guard Rails",
    entries: [
      `${profile.name}: ${profile.purpose}`,
      `Core stats: ${profile.coreStats.join(", ")}`,
      `Default check: ${profile.diceConventions.defaultCheck}`,
      ...profile.combatLoop.map((step) => `Combat loop: ${step}`),
      ...profile.providerGuardRails.map((rule) => `Provider guard rail: ${rule}`),
    ],
  };
}

function buildRelationshipSection(campaign) {
  return {
    kind: contextPackKinds.RELATIONSHIPS,
    title: "Relationship Notes",
    entries: campaign.relationships.map(
      (relationship) =>
        `${labelEntity(campaign, relationship.sourceId)} -> ${labelEntity(campaign, relationship.targetId)} (${relationship.type}): ${relationship.notes}`,
    ),
  };
}

function buildLoreSection(campaign) {
  const activeIds = new Set([
    campaign.scene.currentPlaceId,
    ...campaign.scene.presentPeopleIds,
    ...campaign.scene.presentPartyMemberIds,
    ...campaign.scene.activeQuestIds,
  ]);

  const taggedLore = campaign.lore.filter((note) =>
    (note.tags ?? []).some((tag) => campaign.summary.toLowerCase().includes(String(tag).toLowerCase())),
  );
  const explicitLore = campaign.lore.filter((note) => (note.relatedIds ?? []).some((id) => activeIds.has(id)));
  const lore = uniqueById([...explicitLore, ...taggedLore, ...campaign.lore.slice(0, 4)]);

  return {
    kind: contextPackKinds.LORE,
    title: "Relevant Lore",
    entries: lore.map((note) => `${note.title}: ${(note.notes ?? []).join(" ")}`),
  };
}

function buildStyleSection(campaign) {
  return {
    kind: contextPackKinds.STYLE,
    title: "Campaign Style And Formatting Rules",
    entries: [
      `Tone: ${campaign.style.tone}`,
      `Pacing: ${campaign.style.pacing}`,
      ...campaign.style.narrationRules.map((rule) => `Narration rule: ${rule}`),
      ...campaign.style.formattingRules.map((rule) => `Formatting rule: ${rule}`),
    ],
  };
}

function uniqueById(records) {
  const seen = new Set();
  return records.filter((record) => {
    if (!record?.id || seen.has(record.id)) {
      return false;
    }
    seen.add(record.id);
    return true;
  });
}
