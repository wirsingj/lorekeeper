// Scene import policy stays pure so provider-response imports cannot quietly
// become renderer-owned canon decisions. This fallback only keeps the active
// scene's immediate situation fresh when the model omitted a structured scene
// update.
import { normalizeChangeDomain } from "./change-domain-controller.js";
import { compactSceneSituation } from "./table-text-controller.js";

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
