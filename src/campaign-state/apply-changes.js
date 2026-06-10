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
    campaign: touchCampaign(working),
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

  return applyArrayChange(campaign[domain], change, domain, operation);
}

function applyArrayChange(records, change, domain, operation) {
  const targetId = change.targetId;

  if (operation === "add") {
    const record = {
      id: targetId ?? `${domain}-${Date.now()}`,
      ...change.data,
    };
    addHumanNote(record, change);
    records.push(record);
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
      records.push({
        id: targetId,
        title: change.summary,
        notes: [change.summary],
        ...change.data,
      });
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

  records[index] = {
    ...records[index],
    ...change.data,
  };
  addHumanNote(records[index], change);
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

function normalizeDomain(domain) {
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

