export function extractLorekeeperUpdates(responseText) {
  const payload = findLorekeeperJsonPayload(responseText);
  if (!payload) {
    return {
      proposedChanges: [],
      error: "No LoreKeeper update JSON block found.",
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
    const partialChanges = parsePartialProposedChanges(payload.json);
    if (partialChanges.length > 0) {
      return {
        proposedChanges: partialChanges.flatMap(normalizeChange),
        error: `Recovered ${partialChanges.length} complete update${partialChanges.length === 1 ? "" : "s"} from incomplete LoreKeeper JSON.`,
      };
    }

    return {
      proposedChanges: [],
      error: error instanceof Error ? error.message : "Could not parse LoreKeeper update JSON.",
    };
  }
}

export function stripLorekeeperUpdates(responseText) {
  const payload = findLorekeeperJsonPayload(responseText);
  if (!payload) {
    return responseText.trim();
  }

  const before = responseText.slice(0, payload.start).replace(
    /(?:^|\n|\s)(?:JSON|LoreKeeper Updates|Lorekeeper Updates|lorekeeper_updates)\s*[:\-]?\s*$/i,
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
    if (end === -1 && text.slice(start).includes("proposedChanges")) {
      return {
        json: text.slice(start).trim(),
        start,
        end: text.length,
      };
    }

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

function parsePartialProposedChanges(json) {
  const keyIndex = json.indexOf('"proposedChanges"');
  if (keyIndex === -1) {
    return [];
  }

  const arrayStart = json.indexOf("[", keyIndex);
  if (arrayStart === -1) {
    return [];
  }

  const changes = [];
  for (let start = json.indexOf("{", arrayStart); start !== -1; start = json.indexOf("{", start + 1)) {
    const end = findBalancedObjectEnd(json, start);
    if (end === -1) {
      break;
    }

    try {
      changes.push(JSON.parse(json.slice(start, end + 1)));
      start = end;
    } catch {
      // Skip malformed objects and keep looking for the next complete one.
    }
  }

  return changes;
}

function normalizeChange(change) {
  const expanded = expandGroupedChange(change);
  if (expanded) {
    return expanded.map(normalizeChange);
  }

  const domain = normalizeChangeDomain(change);
  const data = inferChangeRecordName(domain, change, { ...(change.data ?? {}) });
  return {
    operation: change.operation ?? "note",
    domain,
    targetId: change.targetId ?? null,
    summary: change.summary ?? "Unlabeled proposed update.",
    data,
    confidence: change.confidence ?? "unknown",
    reason: change.reason ?? "",
  };
}

function inferChangeRecordName(domain, change, data) {
  if (data.name || data.title || !isNamedRecordDomain(domain)) {
    return data;
  }

  const inferredName = inferRecordDisplayName(change, data);
  if (!inferredName) {
    return data;
  }

  if (domain === "quests" || domain === "lore") {
    data.title = inferredName;
  } else {
    data.name = inferredName;
  }

  return data;
}

function isNamedRecordDomain(domain) {
  return ["party", "people", "places", "items", "inventory", "quests", "lore", "factions", "maps"].includes(domain);
}

function inferRecordDisplayName(change, data) {
  const targetName = humanizeId(change.targetId);
  if (targetName) {
    return targetName;
  }

  const summary = String(change.summary ?? "").trim();
  if (!summary) {
    return "";
  }

  const countedPeople = summary.match(/^\s*((?:one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+[^,.]{3,42}?)(?:\s+(?:entered|arrived|appeared|approached|attacked|searched|joined|met|waited)\b|[,.]|$)/i);
  if (countedPeople?.[1] && (data.count || /people|party/i.test(change.domain ?? ""))) {
    return titleCase(countedPeople[1]);
  }

  const createdRecord = summary.match(/\b(?:created|introduced|added|revealed|identified)\s+(?:the\s+)?([^,.]{2,48}?)(?:\s+(?:as|to|in|for)\b|[,.]|$)/i);
  if (createdRecord?.[1]) {
    return titleCase(createdRecord[1].replace(/^(party member|npc|person|place|item|thread)\s+/i, ""));
  }

  return compactTitle(summary);
}

function humanizeId(value) {
  const raw = String(value ?? "").trim();
  if (!raw || raw === "null" || raw === "undefined") {
    return "";
  }

  return titleCase(raw.replace(/[_-]+/g, " "));
}

function compactTitle(value) {
  const firstSentence = String(value).split(/[.!?]/)[0]?.trim() || String(value).trim();
  const title = firstSentence.length > 54 ? `${firstSentence.slice(0, 51).trim()}...` : firstSentence;
  return titleCase(title);
}

function titleCase(value) {
  const minorWords = new Set(["a", "an", "and", "as", "at", "for", "from", "in", "of", "on", "or", "the", "to", "with"]);
  return String(value)
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (index > 0 && minorWords.has(lower)) {
        return lower;
      }
      return lower.replace(/^\w/, (char) => char.toUpperCase());
    })
    .join(" ");
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

function normalizeChangeDomain(change) {
  const domain = change.domain ?? "lore";
  if ((domain === "people" || domain === "person" || domain === "characters") && looksLikePartyMember(change)) {
    return "party";
  }

  return domain;
}

function looksLikePartyMember(change) {
  const data = change.data ?? {};
  const haystack = [
    change.summary,
    data.playerRole,
    data.role,
    data.type,
    data.relationshipToEvelynn,
    ...(Array.isArray(data.traits) ? data.traits : []),
    ...(Array.isArray(data.specialties) ? data.specialties : []),
  ].filter(Boolean).join(" ").toLowerCase();

  return /\bparty member\b|\bcompanion\b|\btrusted partner\b|\bplayer character\b|\bpc\b/.test(haystack);
}
