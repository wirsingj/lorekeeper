export function extractLorekeeperUpdates(responseText) {
  const block = findLorekeeperJsonBlock(responseText) ?? findAnyJsonBlock(responseText);
  if (!block) {
    return {
      proposedChanges: [],
      error: "No Lorekeeper update JSON block found.",
    };
  }

  try {
    const parsed = JSON.parse(block);
    const proposedChanges = Array.isArray(parsed.proposedChanges) ? parsed.proposedChanges : [];
    return {
      proposedChanges: proposedChanges.map(normalizeChange),
      error: null,
    };
  } catch (error) {
    return {
      proposedChanges: [],
      error: error instanceof Error ? error.message : "Could not parse Lorekeeper update JSON.",
    };
  }
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
      return match[1].trim();
    }
  }

  return null;
}

function findAnyJsonBlock(text) {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (match?.[1]?.includes("proposedChanges")) {
    return match[1].trim();
  }

  const objectStart = text.indexOf("{");
  const objectEnd = text.lastIndexOf("}");
  if (objectStart !== -1 && objectEnd > objectStart) {
    const candidate = text.slice(objectStart, objectEnd + 1);
    if (candidate.includes("proposedChanges")) {
      return candidate;
    }
  }

  return null;
}

function normalizeChange(change) {
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

