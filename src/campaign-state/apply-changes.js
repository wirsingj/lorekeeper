import { touchCampaign } from "./schema.js";
import { advanceCombatTurn, ensureCombatTurnOrder, repairCombatTurnOwner } from "../rules/combat-turns.js";
import { applyRelationshipTransition, normalizeRelationshipRecord } from "../engine/relationship-engine.js";
import { applyFactionMemory, applyLocationMemory, normalizeFactionMemoryRecord, normalizeLocationMemoryRecord } from "../engine/world-memory-engine.js";

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
    return mergeCombatChange(campaign, change, operation);
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
  const targetId = change.targetId || inferTargetId(campaign, records, change, domain, operation);
  const changeData = inferRevealedRecordData(change, domain, targetId);
  if (domain === "relationships" && isRelationshipTransitionChange(change, changeData, targetId)) {
    return applyRelationshipChange(campaign, records, change, changeData, targetId, operation);
  }
  if ((domain === "factions" || domain === "places") && operation !== "remove" && isDurableMemoryChange(changeData)) {
    return applyDurableMemoryChange(campaign, change, changeData, targetId, domain);
  }

  if (operation === "add") {
    const existingIndex = targetId ? records.findIndex((record) => record.id === targetId) : -1;
    if (existingIndex !== -1) {
      records[existingIndex] = normalizeRecordForDomain(domain, {
        ...mergeRecordPatch(records[existingIndex], changeData),
        id: records[existingIndex].id,
      });
      addHumanNote(records[existingIndex], change);
      applySceneHints(campaign, domain, records[existingIndex]);
      return { applied: true };
    }

    const record = normalizeRecordForDomain(domain, {
      id: targetId || changeData?.id || uniqueId(domain, changeData?.name || changeData?.title || change.summary),
      ...changeData,
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
    ...mergeRecordPatch(records[index], changeData),
  });
  addHumanNote(records[index], change);
  applySceneHints(campaign, domain, records[index]);
  return { applied: true };
}

function applyRelationshipChange(campaign, records, change, changeData, targetId, operation) {
  if (operation === "remove") {
    const removeId = targetId || changeData.id || changeData.relationshipId;
    const index = records.findIndex((record) => record.id === removeId);
    if (index === -1) {
      return { applied: false, reason: `No record found for ${removeId}.` };
    }
    records.splice(index, 1);
    return { applied: true };
  }

  const transition = applyRelationshipTransition(campaign, {
    ...changeData,
    id: targetId || changeData.id || changeData.relationshipId,
    summary: change.summary,
    reason: change.reason,
  });
  campaign.relationships = transition.campaign.relationships;
  applySceneHints(campaign, "relationships", transition.relationship);
  return { applied: true };
}

function isRelationshipTransitionChange(change, data = {}, targetId = "") {
  return Boolean(
    targetId ||
    data.id ||
    data.relationshipId ||
    (data.sourceId && data.targetId) ||
    data.state ||
    data.toState ||
    data.nextState ||
    data.disposition ||
    data.shift ||
    data.delta ||
    data.transition
  );
}

function applyDurableMemoryChange(campaign, change, changeData, targetId, domain) {
  const input = {
    ...changeData,
    id: targetId || changeData.id || changeData.factionId || changeData.placeId || changeData.locationId,
    summary: change.summary,
    description: change.reason || changeData.description,
  };
  if (domain === "factions") {
    const result = applyFactionMemory(campaign, input);
    campaign.factions = result.campaign.factions;
    applySceneHints(campaign, "factions", result.faction);
    return { applied: true };
  }
  const result = applyLocationMemory(campaign, input);
  campaign.places = result.campaign.places;
  applySceneHints(campaign, "places", result.place);
  return { applied: true };
}

function isDurableMemoryChange(data = {}) {
  return Boolean(
    data.memory ||
    data.memories ||
    data.beliefs ||
    data.wants ||
    data.fears ||
    data.blame ||
    data.scars ||
    data.damage ||
    data.history ||
    data.discoveries ||
    data.linkedGoal ||
    data.linkedGoalId ||
    data.goalIds ||
    data.relatedIds ||
    data.relatedEntityIds
  );
}

function mergeRecordPatch(record, patch) {
  const merged = {
    ...record,
    ...patch,
  };

  if (patch.stats !== undefined && isPlainObject(record.stats) && isPlainObject(patch.stats)) {
    merged.stats = mergeNestedObjects(record.stats, patch.stats);
  }

  if (patch.resources !== undefined && isPlainObject(record.resources) && isPlainObject(patch.resources)) {
    merged.resources = mergeNestedObjects(record.resources, patch.resources);
  }

  if (patch.notes !== undefined) {
    merged.notes = [
      ...normalizeNotes(record.notes),
      ...normalizeNotes(patch.notes),
    ];
  }

  if (patch.name || patch.trueName || patch.true_name || patch.revealedName || patch.revealed_name) {
    merged.notes = normalizeNotes(merged.notes).filter(
      (note) => !/true name currently unknown|update this party member when .*real name is revealed/i.test(note),
    );
  }

  return merged;
}

function inferRevealedRecordData(change, domain, targetId) {
  const data = { ...(change.data ?? {}) };
  if (change.visibility && data.visibility === undefined) {
    data.visibility = change.visibility;
  }
  if (domain !== "party" || !targetId || data.name || data.title) {
    return data;
  }

  const revealedName = data.trueName || data.true_name || data.revealedName || data.revealed_name || extractRevealedName([
    change.summary,
    change.reason,
    data.summary,
    data.description,
    ...(Array.isArray(data.notes) ? data.notes : []),
  ].filter(Boolean).join(" "));

  if (revealedName) {
    data.name = revealedName;
    data.notes = [
      ...(Array.isArray(data.notes) ? data.notes : normalizeNotes(data.notes)),
      `True name revealed: ${revealedName}.`,
    ];
  }

  return data;
}

function extractRevealedName(text) {
  const patterns = [
    /\b(?:your|his|her|their|the character(?:'s)?|player(?:'s)?)\s+(?:true\s+|real\s+)?name\s+(?:is|was|=)\s+["“]?([A-Z][A-Za-z' -]{1,40})["”]?/i,
    /\b(?:called|known as|named)\s+["“]?([A-Z][A-Za-z' -]{1,40})["”]?/i,
    /\btrue name\s*:\s*["“]?([A-Z][A-Za-z' -]{1,40})["”]?/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    const name = match?.[1]?.trim().replace(/[.!,;:]+$/, "");
    if (name) {
      return name;
    }
  }

  return "";
}

function inferTargetId(campaign, records, change, domain, operation) {
  if (operation === "remove") {
    return null;
  }

  const data = change.data ?? {};
  const requestedName = normalizeName(data.name || data.title);
  if (requestedName) {
    const exact = records.find((record) => normalizeName(record.name || record.title) === requestedName);
    if (exact) {
      return exact.id;
    }
  }

  if (domain !== "party") {
    return null;
  }

  const haystack = [
    change.summary,
    change.reason,
    data.name,
    data.title,
    data.trueName,
    data.alias,
    data.role,
    data.playerRole,
    data.description,
    data.summary,
    ...(Array.isArray(data.notes) ? data.notes : []),
  ].filter(Boolean).join(" ").toLowerCase();

  const placeholder = records.find((record) => {
    const text = [
      record.id,
      record.name,
      record.ancestryClass,
      record.playerRole,
      ...(record.notes ?? []),
    ].filter(Boolean).join(" ").toLowerCase();

    return /\b(player character|true name|unknown|amnesiac|memory|exiled king|former king|king)\b/.test(text);
  });

  if (placeholder && /\b(name|called|known as|revealed|memory|king|player character|true name)\b/.test(haystack)) {
    return placeholder.id;
  }

  return null;
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

function mergeCombatChange(campaign, change, operation) {
  if (operation === "remove") {
    return {
      applied: false,
      reason: "Cannot remove singleton campaign combat state.",
    };
  }

  const data = change.data ?? {};
  campaign.combat = normalizeCombatPatch(campaign.combat ?? {}, data);
  applyCombatActorUpdates(campaign, normalizeList(data.actorUpdates ?? data.partyUpdates));
  applyCombatEnemyUpdates(campaign.combat, normalizeList(data.enemyUpdates));
  appendCombatLogs(campaign, data);
  reconcileDefeatedCombatants(campaign, change.summary);
  if (campaign.combat?.inCombat) {
    let orderedCampaign;
    if (data.promptedActorId) {
      orderedCampaign = repairCombatTurnOwner(campaign, {
        promptedActorId: data.promptedActorId,
        onlyFromNonParty: data.onlyFromNonParty !== false,
        summary: change.summary,
      });
    } else if (data.advanceTurn || data.turnResolved) {
      orderedCampaign = advanceCombatTurn(campaign, {
        fromActorId: data.resolvedActorId ?? data.actorId ?? data.characterId ?? data.currentTurnId ?? campaign.combat.currentTurnId,
        summary: change.summary,
      });
    } else {
      orderedCampaign = ensureCombatTurnOrder(campaign, { reroll: data.rerollInitiative === true });
    }
    campaign.combat = orderedCampaign.combat;
    reconcileDefeatedCombatants(campaign, change.summary);
  }
  addHumanNote(campaign.combat, change);
  return { applied: true };
}

function appendCombatLogs(campaign, data = {}) {
  const combatActions = normalizeList(data.combatActionLog ?? data.combatActions);
  if (combatActions.length) {
    campaign.combatActionLog = appendUniqueRecords(campaign.combatActionLog, combatActions).slice(-500);
  }

  const dice = normalizeList(data.diceLog ?? data.rolls);
  if (dice.length) {
    campaign.diceLog = appendUniqueRecords(campaign.diceLog, dice).slice(-1000);
  }

  const effects = normalizeList(data.stateEffectLog ?? data.effects);
  if (effects.length) {
    campaign.stateEffectLog = appendUniqueRecords(campaign.stateEffectLog, effects).slice(-1000);
  }
}

function appendUniqueRecords(existing = [], additions = []) {
  const seen = new Set(normalizeList(existing).map((item) => item?.id).filter(Boolean));
  const next = normalizeList(existing).slice();
  for (const item of additions) {
    if (!item || typeof item !== "object") {
      continue;
    }
    if (item.id && seen.has(item.id)) {
      continue;
    }
    next.push(item);
    if (item.id) {
      seen.add(item.id);
    }
  }
  return next;
}

function normalizeCombatPatch(existing = {}, data = {}) {
  const excluded = new Set([
    "actorUpdates",
    "partyUpdates",
    "enemyUpdates",
    "promptedActorId",
    "onlyFromNonParty",
    "combatActionLog",
    "combatActions",
    "diceLog",
    "rolls",
    "stateEffectLog",
    "effects",
  ]);
  const patch = Object.fromEntries(Object.entries(data).filter(([key]) => !excluded.has(key)));
  const merged = mergeNestedObjects(existing, patch);

  return {
    ...merged,
    inCombat: data.inCombat !== undefined ? Boolean(data.inCombat) : Boolean(existing.inCombat),
    round: data.round !== undefined ? numberOrNull(data.round) : existing.round ?? null,
    initiative: data.initiative !== undefined ? normalizeList(data.initiative).map(recordId).filter(Boolean) : normalizeList(existing.initiative),
    turnOrder: data.turnOrder !== undefined ? normalizeList(data.turnOrder) : normalizeList(existing.turnOrder),
    currentTurnId: data.currentTurnId ?? data.activeActorId ?? existing.currentTurnId ?? null,
    enemies: data.enemies !== undefined ? normalizeCombatants(data.enemies) : normalizeCombatants(existing.enemies),
    conditions: data.conditions !== undefined ? normalizeList(data.conditions) : normalizeList(existing.conditions),
    turnEconomy: normalizeTurnEconomyMap(merged.turnEconomy ?? {}),
    stakes: data.stakes ?? existing.stakes ?? "",
    lastAction: data.lastAction ?? data.chosenAction ?? existing.lastAction ?? null,
    lastOutcome: data.lastOutcome ?? data.outcome ?? existing.lastOutcome ?? null,
    notes: normalizeNotes(merged.notes),
  };
}

function applyCombatActorUpdates(campaign, updates) {
  if (!updates.length) {
    return;
  }

  for (const update of updates) {
    if (!update || typeof update !== "object") {
      continue;
    }
    const actorId = update.actorId ?? update.partyMemberId ?? update.characterId ?? update.id;
    if (!actorId) {
      continue;
    }
    const index = campaign.party.findIndex((member) => member.id === actorId);
    if (index === -1) {
      continue;
    }
    const member = campaign.party[index];
    const patch = {};
    if (update.hp !== undefined || update.hpDelta !== undefined || update.damage !== undefined || update.healing !== undefined) {
      patch.stats = {
        ...(member.stats ?? {}),
        hp: normalizeHpUpdate(member.stats?.hp ?? member.hp ?? member.hitPoints, update),
      };
    }
    if (update.resources !== undefined || update.spellSlots !== undefined || update.uses !== undefined || update.resourceDeltas !== undefined) {
      patch.resources = normalizeResourceUpdate(member.resources ?? member.stats?.resources ?? {}, update);
      patch.stats = {
        ...(patch.stats ?? member.stats ?? {}),
        resources: patch.resources,
        spellSlots: patch.resources.spellSlots ?? member.stats?.spellSlots ?? null,
      };
    }
    if (update.conditions !== undefined) {
      patch.conditions = normalizeList(update.conditions);
      patch.stats = {
        ...(patch.stats ?? member.stats ?? {}),
        conditions: patch.conditions,
      };
    }
    if (update.addConditions !== undefined || update.removeConditions !== undefined) {
      patch.conditions = mergeConditions(member.conditions ?? member.stats?.conditions, update);
      patch.stats = {
        ...(patch.stats ?? member.stats ?? {}),
        conditions: patch.conditions,
      };
    }
    if (Object.keys(patch).length) {
      campaign.party[index] = normalizeRecordForDomain("party", {
        ...mergeRecordPatch(member, patch),
        id: member.id,
      });
    }

    if (update.turnEconomy !== undefined) {
      campaign.combat.turnEconomy = {
        ...(campaign.combat.turnEconomy ?? {}),
        [actorId]: normalizeTurnEconomyEntry({
          ...(campaign.combat.turnEconomy?.[actorId] ?? {}),
          ...(update.turnEconomy ?? {}),
        }),
      };
    }
  }
}

function applyCombatEnemyUpdates(combat, updates) {
  if (!updates.length) {
    return;
  }
  const enemies = normalizeCombatants(combat.enemies);
  for (const update of updates) {
    if (!update || typeof update !== "object") {
      continue;
    }
    const enemyId = update.enemyId ?? update.id ?? uniqueId("enemy", update.name ?? "enemy");
    const index = enemies.findIndex((enemy) => enemy.id === enemyId || normalizeName(enemy.name) === normalizeName(update.name));
    const existing = index === -1 ? { id: enemyId, name: update.name || enemyId } : enemies[index];
    const next = {
      ...existing,
      ...update,
      id: existing.id ?? enemyId,
      hp: update.hp !== undefined || update.hpDelta !== undefined || update.damage !== undefined || update.healing !== undefined
        ? normalizeHpUpdate(existing.hp, update)
        : existing.hp,
      conditions: update.conditions !== undefined || update.addConditions !== undefined || update.removeConditions !== undefined
        ? mergeConditions(update.conditions !== undefined ? update.conditions : existing.conditions, update)
        : normalizeList(existing.conditions),
    };
    if (index === -1) {
      enemies.push(next);
    } else {
      enemies[index] = next;
    }
  }
  combat.enemies = enemies;
}

function reconcileDefeatedCombatants(campaign, summary = "") {
  const combat = campaign.combat;
  if (!combat?.inCombat) {
    return;
  }

  const enemies = normalizeCombatants(combat.enemies);
  const knownEnemyIds = new Set(enemies.map((enemy) => enemy.id).filter(Boolean));
  const livingEnemyIds = new Set(enemies.filter((enemy) => !isDefeatedCombatant(enemy)).map((enemy) => enemy.id));
  const allKnownEnemiesDefeated = enemies.length > 0 && livingEnemyIds.size === 0;

  if (allKnownEnemiesDefeated) {
    campaign.combat = {
      ...combat,
      inCombat: false,
      currentTurnId: null,
      initiative: [],
      turnOrder: [],
      turnEconomy: {},
      turnResolved: false,
      advanceTurn: false,
      lastOutcome: summary || combat.lastOutcome || "Combat ended: all known enemies defeated.",
    };
    return;
  }

  if (!knownEnemyIds.size || !Array.isArray(combat.turnOrder)) {
    return;
  }

  combat.turnOrder = combat.turnOrder.filter((entry) => {
    const id = entry.id || entry.actorId;
    return !knownEnemyIds.has(id) || livingEnemyIds.has(id);
  });
  combat.initiative = combat.turnOrder.map((entry) => entry.id || entry.actorId).filter(Boolean);
  if (combat.currentTurnId && !combat.initiative.includes(combat.currentTurnId)) {
    combat.currentTurnId = combat.initiative[0] ?? null;
  }
}

function isDefeatedCombatant(combatant = {}) {
  const conditions = normalizeList(combatant.conditions).map((condition) => String(condition).toLowerCase());
  if (conditions.some((condition) => ["dead", "defeated", "destroyed", "unconscious"].includes(condition))) {
    return true;
  }
  const hp = normalizeHpValue(combatant.hp ?? combatant.hitPoints);
  return hp.current !== null && hp.current <= 0;
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
  if (domain === "places" && (!campaign.scene.currentPlaceId || campaign.scene.currentPlaceId === "place-starting-location")) {
    campaign.scene.currentPlaceId = record.id;
  }

  if (domain === "party" && !campaign.scene.presentPartyMemberIds.includes(record.id)) {
    campaign.scene.presentPartyMemberIds.push(record.id);
  }

  if (domain === "people" && !campaign.scene.presentPeopleIds.includes(record.id)) {
    campaign.scene.presentPeopleIds.push(record.id);
  }

  if (domain === "quests" && !campaign.scene.activeQuestIds.includes(record.id)) {
    if (record.visibility === "dm_only" || record.threadType === "story_arc") {
      return;
    }
    campaign.scene.activeQuestIds.push(record.id);
  }
}

function normalizeRecordForDomain(domain, record) {
  const now = new Date().toISOString();

  if (domain === "party") {
    const name = record.name || record.title || "Unnamed party member";
    const level = record.level ?? record.stats?.level ?? record.characterLevel ?? null;
    const proficiencyBonus = record.proficiencyBonus ?? record.proficiency_bonus ?? record.stats?.proficiencyBonus ?? null;
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
      level,
      experience: record.experience ?? record.xp ?? null,
      proficiencyBonus,
      background: record.background || record.backstory || "",
      stats: normalizeStats(record.stats ?? record),
      speedFt: record.speedFt ?? record.speed ?? record.stats?.speedFt ?? record.stats?.speed ?? null,
      resources: normalizeResources(record.resources ?? record.stats?.resources ?? record),
      attacks: normalizeList(record.attacks ?? record.weapons ?? record.equipment?.weapons),
      conditions: normalizeList(record.conditions ?? record.stats?.conditions),
      skills: normalizeList(record.skills ?? record.proficiencies ?? record.specialties ?? record.stats?.skills),
      abilities: normalizeList(record.abilities ?? record.features ?? record.traits),
      spells: normalizeList(record.spells ?? record.stats?.spells),
      inventory: normalizeList(record.inventory ?? record.equipment ?? record.items),
      controllerKind: record.controllerKind ?? null,
      controllerId: record.controllerId ?? null,
      fallbackControllerKind: record.fallbackControllerKind ?? null,
      inviteIntent: record.inviteIntent ?? null,
      integrationPrompt: record.integrationPrompt ?? "",
      hostIntegrationPrompt: record.hostIntegrationPrompt ?? "",
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
    return normalizeLocationMemoryRecord(record, { now });
  }

  if (domain === "quests") {
    const title = record.title || record.name || "Unresolved thread";
    return {
      id: record.id || uniqueId("quest", title),
      title,
      status: record.status || "active",
      visibility: record.visibility || record.data?.visibility || "player_visible",
      threadType: record.threadType || record.thread_type || record.kind || record.type || "quest",
      horizon: record.horizon || record.timeHorizon || record.time_horizon || "",
      stakes: record.stakes || record.summary || record.description || "Unresolved campaign thread.",
      openQuestions: normalizeList(record.openQuestions || record.open_questions),
      nextBeat: record.nextBeat || record.next_beat || record.currentBeat || "",
      notes: normalizeNotes(record.notes),
      relatedIds: normalizeList(record.relatedIds || record.related_ids),
      createdAt: record.createdAt || now,
      updatedAt: now,
    };
  }

  if (domain === "relationships") {
    return normalizeRelationshipRecord(record, { now });
  }

  if (domain === "factions") {
    return normalizeFactionMemoryRecord(record, { now });
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
    abilityScores: record.abilityScores ?? record.ability_scores ?? record.abilitiesScores ?? record.abilities ?? {},
    spellSlots: record.spellSlots ?? record.spell_slots ?? record.resources?.spellSlots ?? null,
    resources: record.resources ?? null,
    speedFt: record.speedFt ?? record.speed ?? null,
    conditions: normalizeList(record.conditions),
    spells: normalizeList(record.spells),
  };
}

function normalizeCombatants(value) {
  return normalizeList(value).flatMap((combatant) => normalizeCombatantGroup(combatant));
}

function normalizeCombatantGroup(combatant) {
  if (combatant && typeof combatant === "object") {
    const baseName = combatant.name || combatant.title || combatant.id || "Combatant";
    const count = combatantCount(combatant);
    const base = {
      ...combatant,
      id: combatant.id ?? uniqueId("enemy", baseName),
      name: baseName,
      hp: combatant.hp ?? null,
      conditions: normalizeList(combatant.conditions),
    };
    if (count <= 1) {
      return [base];
    }
    const baseId = base.id;
    const baseSingularName = singularCombatantName(base.name);
    return Array.from({ length: count }, (_, index) => ({
      ...base,
      id: `${baseId}-${index + 1}`,
      groupId: base.groupId ?? baseId,
      name: `${baseSingularName} ${index + 1}`,
      count: undefined,
      quantity: undefined,
      number: undefined,
    }));
  }

  const parsed = parseCombatantText(combatant);
  if (parsed.count <= 1) {
    return [{
      id: uniqueId("enemy", parsed.name),
      name: parsed.name,
      hp: null,
      conditions: [],
    }];
  }
  const baseId = uniqueId("enemy", parsed.name);
  const singular = singularCombatantName(parsed.name);
  return Array.from({ length: parsed.count }, (_, index) => ({
    id: `${baseId}-${index + 1}`,
    groupId: baseId,
    name: `${singular} ${index + 1}`,
    hp: null,
    conditions: [],
  }));
}

function combatantCount(combatant = {}) {
  const explicit = Number(combatant.count ?? combatant.quantity ?? combatant.number ?? combatant.qty);
  if (Number.isFinite(explicit) && explicit > 1) {
    return Math.min(30, Math.round(explicit));
  }
  return parseCombatantText(combatant.name || combatant.title || "").count;
}

function parseCombatantText(value = "") {
  const text = String(value ?? "").trim() || "Combatant";
  const numeric = text.match(/^(\d{1,2})\s+(.+)$/);
  if (numeric) {
    return { count: Math.min(30, Number(numeric[1])), name: numeric[2].trim() || "Combatant" };
  }
  const word = text.match(/^(two|three|four|five|six|seven|eight|nine|ten|a few|several)\s+(.+)$/i);
  if (word) {
    return { count: numberWordToCount(word[1]), name: word[2].trim() || "Combatant" };
  }
  return { count: 1, name: text };
}

function numberWordToCount(value = "") {
  const normalized = String(value).toLowerCase();
  return {
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    "a few": 3,
    several: 4,
  }[normalized] ?? 1;
}

function singularCombatantName(value = "") {
  const text = String(value || "Combatant").trim();
  if (/ies$/i.test(text)) return text.replace(/ies$/i, "y");
  if (/s$/i.test(text) && !/ss$/i.test(text)) return text.slice(0, -1);
  return text;
}

function normalizeTurnEconomyMap(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value)
      .map(([actorId, entry]) => [actorId, normalizeTurnEconomyEntry(entry)])
      .filter(([actorId]) => actorId),
  );
}

function normalizeTurnEconomyEntry(entry = {}) {
  const source = entry && typeof entry === "object" ? entry : {};
  return {
    action: normalizeAvailability(source.action, "available"),
    bonusAction: normalizeAvailability(source.bonusAction ?? source.bonus_action, "available"),
    reaction: normalizeAvailability(source.reaction, "available"),
    movementRemainingFt: numberOrNull(source.movementRemainingFt ?? source.movement) ?? 0,
    freeObjectInteraction: normalizeAvailability(source.freeObjectInteraction ?? source.objectInteraction, "available"),
  };
}

function normalizeAvailability(value, fallback) {
  const text = String(value ?? fallback).toLowerCase();
  if (["spent", "used", "unavailable", "none", "0", "false"].includes(text)) {
    return "spent";
  }
  if (["available", "ready", "unused", "1", "true"].includes(text)) {
    return "available";
  }
  return fallback;
}

function normalizeHpUpdate(existingHp, update = {}) {
  if (update.hp !== undefined) {
    return normalizeHpValue(update.hp);
  }
  const hp = normalizeHpValue(existingHp);
  const current = hp.current ?? hp.max ?? 0;
  const max = hp.max ?? current;
  const damage = Number(update.damage ?? 0) || 0;
  const healing = Number(update.healing ?? 0) || 0;
  const hpDelta = Number(update.hpDelta ?? 0) || 0;
  return {
    current: Math.max(0, Math.min(max, current + hpDelta - damage + healing)),
    max,
    temporary: hp.temporary ?? 0,
  };
}

function normalizeHpValue(value) {
  if (value && typeof value === "object") {
    return {
      current: numberOrNull(value.current ?? value.value),
      max: numberOrNull(value.max ?? value.maximum),
      temporary: Number(value.temporary ?? value.temp ?? 0) || 0,
    };
  }
  if (typeof value === "string") {
    const match = value.match(/(\d+)\s*\/\s*(\d+)/);
    if (match) {
      return { current: Number(match[1]), max: Number(match[2]), temporary: 0 };
    }
  }
  const number = numberOrNull(value);
  return { current: number, max: number, temporary: 0 };
}

function normalizeResourceUpdate(existingResources, update = {}) {
  const resources = mergeNestedObjects(
    existingResources && typeof existingResources === "object" ? existingResources : {},
    update.resources && typeof update.resources === "object" ? update.resources : {},
  );
  if (update.spellSlots && typeof update.spellSlots === "object") {
    resources.spellSlots = mergeNestedObjects(resources.spellSlots ?? {}, update.spellSlots);
  }
  if (update.uses && typeof update.uses === "object") {
    resources.uses = mergeNestedObjects(resources.uses ?? {}, update.uses);
  }
  if (update.resourceDeltas && typeof update.resourceDeltas === "object") {
    applyResourceDeltas(resources, update.resourceDeltas);
  }
  return resources;
}

function applyResourceDeltas(resources, deltas) {
  for (const [path, delta] of Object.entries(deltas)) {
    const parts = String(path).split(".").filter(Boolean);
    if (!parts.length) {
      continue;
    }
    let target = resources;
    for (const part of parts.slice(0, -1)) {
      target[part] = target[part] && typeof target[part] === "object" ? target[part] : {};
      target = target[part];
    }
    const key = parts.at(-1);
    target[key] = (Number(target[key]) || 0) + (Number(delta) || 0);
  }
}

function mergeConditions(existing, update = {}) {
  let conditions = update.conditions !== undefined ? normalizeList(update.conditions) : normalizeList(existing);
  for (const condition of normalizeList(update.addConditions)) {
    if (!conditions.includes(condition)) {
      conditions.push(condition);
    }
  }
  const remove = new Set(normalizeList(update.removeConditions).map((condition) => String(condition).toLowerCase()));
  if (remove.size) {
    conditions = conditions.filter((condition) => !remove.has(String(condition).toLowerCase()));
  }
  return conditions;
}

function normalizeResources(record) {
  if (!record || typeof record !== "object") {
    return {};
  }
  const resources = record.resources && typeof record.resources === "object" ? structuredClone(record.resources) : {};
  const spellSlots = record.spellSlots ?? record.spell_slots ?? record.stats?.spellSlots;
  if (spellSlots && typeof spellSlots === "object" && !resources.spellSlots) {
    resources.spellSlots = spellSlots;
  }
  const uses = record.uses ?? record.stats?.uses;
  if (uses && typeof uses === "object" && !resources.uses) {
    resources.uses = uses;
  }
  return resources;
}

function normalizeList(value) {
  if (Array.isArray(value)) {
    return value.filter((item) => item !== null && item !== undefined && String(item).trim() !== "");
  }

  if (value && typeof value === "object") {
    return Object.entries(value)
      .map(([key, entry]) => (entry && typeof entry === "object" ? { name: key, ...entry } : `${key}: ${entry}`))
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/[,;\n]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function mergeNestedObjects(base, patch) {
  const merged = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (isPlainObject(value) && isPlainObject(base?.[key])) {
      merged[key] = mergeNestedObjects(base[key], value);
    } else {
      merged[key] = value;
    }
  }
  return merged;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeNotes(value) {
  return normalizeList(value);
}

function normalizeName(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function recordId(value) {
  if (value && typeof value === "object") {
    return value.id ?? value.actorId ?? value.partyMemberId ?? value.name ?? "";
  }
  return String(value ?? "");
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
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
