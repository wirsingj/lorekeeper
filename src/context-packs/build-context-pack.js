import { contextPackKinds, normalizeCampaign } from "../campaign-state/schema.js";
import { findById, labelEntity } from "../campaign-state/formatters.js";
import { buildSceneIntentPack, buildSceneRetrieval } from "../engine/scene-engine.js";
import { buildRulesLedger } from "../rules/dnd5e-lite-ledger.js";

const DEFAULT_PACK_KINDS = [
  contextPackKinds.SCENE,
  contextPackKinds.CONSEQUENCES,
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

const HISTORY_MESSAGE_LIMIT = 4;
const HISTORY_DM_CHAR_LIMIT = 700;
const HISTORY_PLAYER_CHAR_LIMIT = 320;
const SHORT_ENTRY_LIMIT = 220;
const MEDIUM_ENTRY_LIMIT = 360;

export function buildContextPack(campaign, options = {}) {
  campaign = normalizeCampaign(campaign ?? {});
  const kinds = options.kinds ?? DEFAULT_PACK_KINDS;

  return {
    campaignId: campaign.id,
    campaignTitle: campaign.title,
    generatedAt: new Date().toISOString(),
    purpose: options.purpose ?? "next_campaign_turn",
    rulesLedger: buildRulesLedger(campaign, {
      mode: options.includeCombatDetail || campaign.combat?.inCombat ? "combat" : "scene",
    }),
    sections: kinds
      .map((kind) => buildSection(kind, campaign, options))
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

function buildSection(kind, campaign, options) {
  switch (kind) {
    case contextPackKinds.SCENE:
      return buildSceneSection(campaign);
    case contextPackKinds.CONSEQUENCES:
      return buildConsequencesSection(campaign);
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
      return buildRulesProfileSection(campaign, options);
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
  const messages = (campaign.sessionLog?.messages ?? []).slice(-HISTORY_MESSAGE_LIMIT);

  return {
    kind: contextPackKinds.HISTORY,
    title: "Recent Play History",
    entries: messages
      .map((message) => {
        const speaker = message.title || (message.role === "player" ? "Player" : "DM");
        const limit = message.role === "player" ? HISTORY_PLAYER_CHAR_LIMIT : HISTORY_DM_CHAR_LIMIT;
        const body = compactText(message.body ?? message.text ?? message.content, limit);
        return body ? `${speaker}: ${body}` : null;
      })
      .filter(Boolean),
  };
}

function buildSceneSection(campaign) {
  const retrieval = buildSceneRetrieval(campaign);
  const intentPack = buildSceneIntentPack(campaign, { sceneRetrieval: retrieval });
  const escalation = intentPack.escalationPolicy;
  const activeScene = retrieval.scene;
  const place = findById(campaign.places, campaign.scene.currentPlaceId);
  const presentPeople = (campaign.scene.presentPeopleIds ?? []).map((id) => labelEntity(campaign, id));
  const sceneLocation = campaign.scene.location || campaign.scene.place || campaign.scene.currentLocation;
  const location = sceneLocation || (place ? `${place.name} - ${place.summary}` : "Unknown");
  const situation = activeScene?.immediateSituation || campaign.scene.situation || campaign.scene.immediateSituation || "Not set.";

  return {
    kind: contextPackKinds.SCENE,
    title: "Current Scene",
    entries: [
      `Scene: ${activeScene?.title ?? "Current scene"} (${activeScene?.type ?? campaign.scene.status})`,
      activeScene?.whyHere ? `Why here: ${compactText(activeScene.whyHere, SHORT_ENTRY_LIMIT)}` : null,
      `Status: ${campaign.scene.status}`,
      `Location: ${compactText(location, SHORT_ENTRY_LIMIT)}`,
      `Immediate situation: ${compactText(situation, MEDIUM_ENTRY_LIMIT)}`,
      ...(activeScene?.goals ?? []).slice(0, 3).map((goal) => `Scene goal: ${compactText(goal, SHORT_ENTRY_LIMIT)}`),
      ...(activeScene?.tensions ?? []).slice(0, 4).map((tension) => `Tension: ${compactText(tension, SHORT_ENTRY_LIMIT)}`),
      ...(activeScene?.unresolvedQuestions ?? []).slice(0, 4).map((question) => `Unresolved: ${compactText(question, SHORT_ENTRY_LIMIT)}`),
      escalation ? `Escalation policy: ${escalation.level} - ${compactText(escalation.guidance, MEDIUM_ENTRY_LIMIT)}` : null,
      ...(escalation?.avoid ?? []).slice(0, 3).map((avoid) => `Avoid: ${compactText(avoid, SHORT_ENTRY_LIMIT)}`),
      `Present NPCs: ${presentPeople.length > 0 ? presentPeople.join(", ") : "None recorded."}`,
      ...(campaign.scene.localNotes ?? []).slice(0, 3).map((note) => `Scene note: ${compactText(note, SHORT_ENTRY_LIMIT)}`),
    ].filter(Boolean),
  };
}

function buildConsequencesSection(campaign) {
  const retrieval = buildSceneRetrieval(campaign);
  return {
    kind: contextPackKinds.CONSEQUENCES,
    title: "Active Consequences",
    entries: retrieval.activeConsequences.map((consequence) =>
      compactText(
        `${consequence.title} (${consequence.importance}/${consequence.scope}): ${consequence.description}`,
        MEDIUM_ENTRY_LIMIT,
      ),
    ),
  };
}

function buildPartySection(campaign) {
  const presentIds = new Set(campaign.scene.presentPartyMemberIds ?? []);
  const party = campaign.party.filter((member) => presentIds.size === 0 || presentIds.has(member.id));

  return {
    kind: contextPackKinds.PARTY,
    title: "Active Party",
    entries: party.map((member) => {
      const hp = formatCompactHp(member.stats?.hp ?? member.hp ?? member.hitPoints);
      const level = member.level ?? member.stats?.level ?? member.characterLevel;
      const stats = formatAbilityScores(member.abilityScores ?? member.stats?.abilityScores ?? member.stats?.abilities);
      const skills = formatCompactList(member.skills ?? member.specialties ?? member.proficiencies ?? member.stats?.skills, 5);
      const abilities = formatCompactList(member.abilities ?? member.features ?? member.traits, 5);
      const spells = formatCompactList(member.spells ?? member.stats?.spells, 5);
      const notes = formatCompactList(member.notes, 2);
      const controller = formatControllerDetail(member);
      const details = [
        member.ancestryClass || member.role || member.class || "party member",
        controller,
        level ? `level ${level}` : null,
        hp,
        stats ? `stats: ${stats}` : null,
        skills ? `checks: ${skills}` : null,
        abilities ? `abilities: ${abilities}` : null,
        spells ? `spells: ${spells}` : null,
        notes ? `notes: ${notes}` : null,
      ].filter(Boolean);
      return compactText(`${member.name}: ${details.join("; ")}`, MEDIUM_ENTRY_LIMIT);
    }),
  };
}

function formatControllerDetail(member) {
  const kind = member.controllerKind || (member.type === "player_character" ? "host" : "ai_companion");
  if (kind === "host") {
    return "controller: host/player; do not speak or choose actions for this character unless delegated";
  }
  if (kind === "remote_player") {
    return "controller: remote player; they may be physically present, but do not narrate their speech, thoughts, scanning, reactions, or purposeful actions unless that player submitted input";
  }
  if (kind === "unassigned") {
    return "controller: unassigned; ask before using as an active player voice";
  }
  return "controller: AI companion; may make brief low-stakes RP contributions when nudged or idle, but no major party decisions and combat turns still wait for host/controller input";
}

function buildNearbySection(campaign) {
  const nearbyPlaces = (campaign.scene.nearbyPlaceIds ?? [])
    .map((id) => findById(campaign.places, id))
    .filter(Boolean);
  const nearbyPeople = campaign.people.filter(
    (person) =>
      person.locationId === campaign.scene.currentPlaceId ||
      (campaign.scene.presentPeopleIds ?? []).includes(person.id),
  );

  return {
    kind: contextPackKinds.NEARBY,
    title: "Nearby People And Places",
    entries: [
      ...nearbyPeople.slice(0, 6).map((person) =>
        compactText(`${person.name}: ${person.role}. ${formatCompactList(person.notes, 4)}`, SHORT_ENTRY_LIMIT),
      ),
      ...nearbyPlaces.slice(0, 6).map((place) => compactText(`${place.name}: ${place.summary}`, SHORT_ENTRY_LIMIT)),
    ],
  };
}

function buildInventorySection(campaign) {
  return {
    kind: contextPackKinds.INVENTORY,
    title: "Current Inventory",
    entries: campaign.inventory.slice(0, 12).map((entry) => {
      const holder = labelEntity(campaign, entry.holderId);
      const item = findById(campaign.items, entry.itemId);
      return compactText(
        `${holder} carries ${entry.quantity} x ${item?.name ?? entry.itemId}. ${entry.notes ?? ""} ${(item?.notes ?? []).join(" ")}`.trim(),
        SHORT_ENTRY_LIMIT,
      );
    }),
  };
}

function buildThreadsSection(campaign) {
  const active = campaign.quests.filter((quest) => quest.status !== "completed");

  return {
    kind: contextPackKinds.THREADS,
    title: "Active Quests And Unresolved Threads",
    entries: active.slice(0, 6).map((quest) => {
      const questions = quest.openQuestions?.length ? ` Questions: ${quest.openQuestions.slice(0, 3).join(" ")}` : "";
      return compactText(`${quest.title} (${quest.status}). Stakes: ${quest.stakes}.${questions}`, MEDIUM_ENTRY_LIMIT);
    }),
  };
}

function buildCombatSection(campaign) {
  const combat = campaign.combat;
  const ledger = buildRulesLedger(campaign, { mode: combat.inCombat ? "combat" : "scene" });
  const entries = [
    `In combat: ${combat.inCombat ? "yes" : "no"}`,
    `Turn format: ${compactText(combat.turnFormat, SHORT_ENTRY_LIMIT)}`,
    ...ledger.actors.slice(0, 6).map((actor) => {
      const hp = actor.sheet.hp.current !== null && actor.sheet.hp.max !== null
        ? `HP ${actor.sheet.hp.current}/${actor.sheet.hp.max}`
        : "HP unknown";
      const options = actor.legalOptions.slice(0, 5).map((option) => `${option.letter}) ${option.label}`).join("; ");
      return compactText(
        `${actor.name}: ${hp}; action ${actor.turnEconomy.action}; bonus ${actor.turnEconomy.bonusAction}; move ${actor.turnEconomy.movementRemainingFt} ft; legal options: ${options}`,
        MEDIUM_ENTRY_LIMIT,
      );
    }),
  ];

  if (combat.inCombat) {
    entries.push(...combat.preferences.slice(0, 4).map((preference) => `Preference: ${compactText(preference, SHORT_ENTRY_LIMIT)}`));
    entries.push(`Round: ${combat.round ?? "unknown"}`);
    entries.push(`Current turn: ${labelEntity(campaign, combat.currentTurnId) || "unknown"}`);
    entries.push(`Initiative: ${combat.initiative.map((id) => labelEntity(campaign, id)).join(", ") || "unknown"}`);
    if (Array.isArray(combat.turnOrder) && combat.turnOrder.length) {
      entries.push(`Turn order: ${combat.turnOrder.map((entry) => `${entry.name || labelEntity(campaign, entry.id)} (${entry.initiativeScore ?? "?"})`).join(" > ")}`);
    }
    entries.push(`Enemies: ${combat.enemies.map((enemy) => `${enemy.name} (${enemy.hp ?? "HP unknown"})`).join(", ")}`);
    entries.push(`Conditions: ${combat.conditions.join(", ") || "none recorded"}`);
  } else {
    entries.push("Outside combat or immediate danger, narrate consequences and keep the scene moving; do not present routine option panels.");
  }

  return {
    kind: contextPackKinds.COMBAT,
    title: "Combat State",
    entries,
  };
}

function buildRulesProfileSection(campaign, options = {}) {
  const profile = campaign.rulesProfile;
  if (!profile) {
    return null;
  }
  const includeCombatDetail = campaign.combat?.inCombat || options.includeCombatDetail;
  const compactCombatFormat =
    "Combat result format: actor + HP when known; chosen action; visible roll/check/save math; damage/healing math; HP/resource update; vivid narration. Options only when asking the active actor what they do.";

  return {
    kind: contextPackKinds.RULES,
    title: "Rules Profile And Mechanical Guard Rails",
    entries: [
      `${profile.name}: ${profile.purpose}`,
      `Core stats: ${profile.coreStats.join(", ")}`,
      `Default check: ${profile.diceConventions.defaultCheck}`,
      compactCombatFormat,
      "Structured options are suggestions, not restrictions, and should appear only for combat, immediate danger, or explicit option requests.",
      ...(includeCombatDetail ? profile.combatLoop.slice(0, 4).map((step) => `Combat loop: ${compactText(step, SHORT_ENTRY_LIMIT)}`) : []),
      ...profile.providerGuardRails.slice(0, 3).map((rule) => `Guard rail: ${compactText(rule, SHORT_ENTRY_LIMIT)}`),
    ],
  };
}

function buildRelationshipSection(campaign) {
  const retrieval = buildSceneRetrieval(campaign);
  const relationships = retrieval.relevantRelationships.length
    ? retrieval.relevantRelationships
    : campaign.relationships.slice(0, 8);
  return {
    kind: contextPackKinds.RELATIONSHIPS,
    title: "Relationship Notes",
    entries: relationships.slice(0, 8).map(
      (relationship) =>
        compactText(
          `${labelEntity(campaign, relationship.sourceId)} -> ${labelEntity(campaign, relationship.targetId)} (${relationship.type}): ${formatCompactList(relationship.notes, 4)}`,
          SHORT_ENTRY_LIMIT,
        ),
    ),
  };
}

function buildLoreSection(campaign) {
  const activeIds = new Set([
    campaign.scene.currentPlaceId,
    ...(campaign.scene.presentPeopleIds ?? []),
    ...(campaign.scene.presentPartyMemberIds ?? []),
    ...(campaign.scene.activeQuestIds ?? []),
  ]);

  const taggedLore = campaign.lore.filter((note) =>
    (note.tags ?? []).some((tag) => campaign.summary.toLowerCase().includes(String(tag).toLowerCase())),
  );
  const explicitLore = campaign.lore.filter((note) => (note.relatedIds ?? []).some((id) => activeIds.has(id)));
  const lore = uniqueById([...explicitLore, ...taggedLore, ...campaign.lore.slice(0, 4)]);

  return {
    kind: contextPackKinds.LORE,
    title: "Relevant Lore",
    entries: lore.slice(0, 5).map((note) => compactText(`${note.title}: ${formatCompactList(note.notes, 4)}`, MEDIUM_ENTRY_LIMIT)),
  };
}

function buildStyleSection(campaign) {
  const style = campaign.style ?? {};
  const narrationRules = Array.isArray(style.narrationRules) ? style.narrationRules : [];
  const formattingRules = Array.isArray(style.formattingRules) ? style.formattingRules : [];
  return {
    kind: contextPackKinds.STYLE,
    title: "Campaign Style And Formatting Rules",
    entries: [
      `Tone: ${style.tone ?? "tabletop fantasy"}`,
      `Pacing: ${style.pacing ?? "narration first; choices when useful"}`,
      ...narrationRules.slice(0, 2).map((rule) => `Narration: ${compactText(rule, SHORT_ENTRY_LIMIT)}`),
      ...formattingRules.slice(0, 2).map((rule) => `Format: ${compactText(rule, SHORT_ENTRY_LIMIT)}`),
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

function compactText(value, limit = SHORT_ENTRY_LIMIT) {
  const stripped = stripUpdatePayloads(String(value ?? ""));
  const compact = stripped.replace(/\s+/g, " ").trim();
  if (compact.length <= limit) {
    return compact;
  }

  return `${compact.slice(0, Math.max(0, limit - 3)).trimEnd()}...`;
}

function stripUpdatePayloads(value) {
  const fenced = value.replace(/```(?:json\s+)?lorekeeper_updates[\s\S]*?```/gi, "");
  const jsonMarker = fenced.search(/\bJSON\s*\{\s*"proposedChanges"/i);
  if (jsonMarker !== -1) {
    return fenced.slice(0, jsonMarker);
  }

  const inlineMarker = fenced.search(/\{\s*"proposedChanges"\s*:/i);
  if (inlineMarker !== -1) {
    return fenced.slice(0, inlineMarker);
  }

  return fenced;
}

function formatCompactList(value, limit = 4) {
  if (!value) {
    return "";
  }

  if (Array.isArray(value)) {
    return value.slice(0, limit).map((entry) => compactText(entry, 80)).filter(Boolean).join(", ");
  }

  if (typeof value === "object") {
    return Object.entries(value)
      .slice(0, limit)
      .map(([key, entry]) => `${key} ${entry}`)
      .join(", ");
  }

  return compactText(value, 120);
}

function formatAbilityScores(value) {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    return "";
  }

  const aliases = {
    STR: ["STR", "str", "strength"],
    DEX: ["DEX", "dex", "dexterity"],
    CON: ["CON", "con", "constitution"],
    INT: ["INT", "int", "intelligence"],
    WIS: ["WIS", "wis", "wisdom"],
    CHA: ["CHA", "cha", "charisma"],
  };

  return Object.entries(aliases)
    .map(([label, keys]) => {
      const score = keys.map((key) => value[key]).find((entry) => entry !== undefined && entry !== null);
      if (score === undefined) {
        return null;
      }
      const numeric = Number(score);
      const modifier = Number.isFinite(numeric) ? Math.floor((numeric - 10) / 2) : null;
      const formattedModifier = modifier === null ? "" : ` ${modifier >= 0 ? "+" : ""}${modifier}`;
      return `${label} ${score}${formattedModifier}`;
    })
    .filter(Boolean)
    .join(", ");
}

function formatCompactHp(hp) {
  if (!hp) {
    return "HP unknown";
  }

  if (typeof hp === "string" || typeof hp === "number") {
    return `HP ${hp}`;
  }

  if (hp.current !== undefined && hp.max !== undefined) {
    return `HP ${hp.current}/${hp.max}`;
  }

  return "HP unknown";
}
