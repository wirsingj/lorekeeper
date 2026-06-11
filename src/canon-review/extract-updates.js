export function extractLorekeeperUpdates(responseText) {
  const payload = findLorekeeperJsonPayload(responseText);
  if (!payload) {
    return {
      proposedChanges: [],
      error: "No Lorekeeper update JSON block found.",
    };
  }

  try {
    const parsed = JSON.parse(payload.json);
    const proposedChanges = Array.isArray(parsed.proposedChanges) ? parsed.proposedChanges : [];
    return {
      proposedChanges: proposedChanges.flatMap(normalizeChange),
      error: null,
    };
  } catch (error) {
    return {
      proposedChanges: [],
      error: error instanceof Error ? error.message : "Could not parse Lorekeeper update JSON.",
    };
  }
}

export function stripLorekeeperUpdates(responseText) {
  const payload = findLorekeeperJsonPayload(responseText);
  if (!payload) {
    return responseText.trim();
  }

  const before = responseText.slice(0, payload.start).replace(
    /(?:^|\n|\s)(?:JSON|Lorekeeper Updates|lorekeeper_updates)\s*[:\-]?\s*$/i,
    "",
  );
  const after = responseText.slice(payload.end);
  return `${before}${after}`.trim();
}

function findLorekeeperJsonPayload(text) {
  return findLorekeeperJsonBlock(text) ?? findAnyJsonBlock(text) ?? findInlineJsonObject(text);
}

function findLorekeeperJsonBlock(text) {
  const patterns = [
    /```json\s+lorekeeper_updates\s*([\s\S]*?)```/i,
    /```lorekeeper_updates\s*([\s\S]*?)```/i,
    /```json\s*([\s\S]*?"proposedChanges"[\s\S]*?)```/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return {
        json: match[1].trim(),
        start: match.index,
        end: match.index + match[0].length,
      };
    }
  }

  return null;
}

function findAnyJsonBlock(text) {
  const pattern = /```(?:json)?\s*([\s\S]*?)```/gi;
  let match;

  while ((match = pattern.exec(text))) {
    if (match[1]?.includes("proposedChanges")) {
      return {
        json: match[1].trim(),
        start: match.index,
        end: match.index + match[0].length,
      };
    }
  }

  return null;
}

function findInlineJsonObject(text) {
  for (let start = text.indexOf("{"); start !== -1; start = text.indexOf("{", start + 1)) {
    const end = findBalancedObjectEnd(text, start);
    if (end === -1) {
      continue;
    }

    const candidate = text.slice(start, end + 1);
    if (!candidate.includes("proposedChanges")) {
      continue;
    }

    try {
      const parsed = JSON.parse(candidate);
      if (Array.isArray(parsed.proposedChanges)) {
        return {
          json: candidate,
          start,
          end: end + 1,
        };
      }
    } catch {
      // Keep scanning. The provider may include prose braces before the actual update object.
    }
  }

  return null;
}

function findBalancedObjectEnd(text, start) {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function normalizeChange(change) {
  const expanded = expandGroupedChange(change);
  if (expanded) {
    return expanded.map(normalizeChange);
  }

  return {
    operation: change.operation ?? "note",
    domain: change.domain ?? "lore",
    targetId: change.targetId ?? null,
    summary: change.summary ?? "Unlabeled proposed update.",
    data: change.data ?? {},
    confidence: change.confidence ?? "unknown",
    reason: change.reason ?? "",
  };
}

function expandGroupedChange(change) {
  const data = change.data ?? {};
  const groups = [
    ["party", data.members || data.party || data.characters],
    ["people", data.people || data.npcs || data.characters],
    ["places", data.places || data.locations],
    ["items", data.items || data.things || data.artifacts],
    ["inventory", data.inventory],
    ["quests", data.quests || data.threads],
  ];

  for (const [domain, records] of groups) {
    if (Array.isArray(records) && records.length > 0) {
      return records.map((record, index) => ({
        operation: change.operation ?? "add",
        domain,
        targetId: record.id ?? null,
        summary: record.summary ?? record.name ?? record.title ?? `${change.summary ?? "Proposed record"} ${index + 1}`,
        data: record,
        confidence: change.confidence ?? "unknown",
        reason: change.reason ?? "",
      }));
    }
  }

  return null;
}
