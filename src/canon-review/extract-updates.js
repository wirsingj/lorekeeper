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
