export const allowedUpdateOperations = Object.freeze(["add", "update", "remove", "note"]);

export const allowedUpdateDomains = Object.freeze([
  "party",
  "people",
  "factions",
  "places",
  "items",
  "inventory",
  "lore",
  "timeline",
  "quests",
  "relationships",
  "scene",
  "combat",
  "style",
  "rules_profile",
]);

export function validateProposedChange(change) {
  const errors = [];

  if (!allowedUpdateOperations.includes(change.operation)) {
    errors.push(`Invalid operation: ${change.operation || "missing"}.`);
  }

  if (!allowedUpdateDomains.includes(change.domain)) {
    errors.push(`Invalid domain: ${change.domain || "missing"}.`);
  }

  if (change.operation !== "add" && change.operation !== "note" && !change.targetId && !isSingletonDomain(change.domain)) {
    errors.push("targetId is required for update/remove operations on collection domains.");
  }

  if (!change.summary || typeof change.summary !== "string") {
    errors.push("summary is required.");
  }

  if (!change.data || typeof change.data !== "object" || Array.isArray(change.data)) {
    errors.push("data must be an object.");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function isSingletonDomain(domain) {
  return ["scene", "combat", "style", "rules_profile"].includes(domain);
}
