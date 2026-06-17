// Scene import policy stays pure so provider-response imports cannot quietly
// become renderer-owned canon decisions. This fallback only keeps the active
// scene's immediate situation fresh when the model omitted a structured scene
// update.
export function createImplicitSceneProgressChange({
  tableMessages = [],
  proposedChanges = [],
  now = () => new Date().toISOString(),
} = {}) {
  if (proposedChanges.some((change) => normalizeChangeDomain(change.domain) === "scene")) {
    return null;
  }

  const latestDmText = [...tableMessages]
    .reverse()
    .find((message) => message.role === "dm" && message.body?.trim())?.body;
  const immediateSituation = compactSceneSituation(latestDmText);
  if (!immediateSituation) {
    return null;
  }

  return {
    operation: "update",
    domain: "scene",
    targetId: null,
    importance: "minor",
    visibility: "player_visible",
    summary: "Scene advanced from latest DM narration.",
    data: {
      status: "in_progress",
      immediateSituation,
      lastBeatAt: now(),
    },
    confidence: "high",
    reason: "Keeps SQLite scene state aligned with the imported DM beat so later turns do not repeat stale prompts.",
  };
}

function compactSceneSituation(text = "") {
  const cleaned = String(text)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line && !isChoiceLikeLine(line) && !/^what (?:does|do|would|will|should|can)\b/i.test(line))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) {
    return "";
  }
  return cleaned.length > 520 ? `${cleaned.slice(0, 519).trimEnd()}...` : cleaned;
}

function isChoiceLikeLine(line) {
  return /^\s*(?:[-*]\s*)?(?:[A-Ha-h]|\d{1,2})\s*[\).:-]\s+/.test(String(line ?? ""));
}

function normalizeChangeDomain(domain) {
  if (domain === "party_member" || domain === "player_character") {
    return "party";
  }
  return domain;
}
