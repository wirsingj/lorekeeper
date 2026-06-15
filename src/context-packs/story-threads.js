const STORY_HORIZONS = ["long", "mid", "short"];

export function isHiddenStoryThread(record = {}) {
  return (
    record?.visibility === "dm_only" &&
    (record.threadType === "story_arc" || record.kind === "story_arc" || record.type === "story_arc")
  );
}

export function buildHiddenStoryThreads(campaign = {}) {
  const explicit = (campaign.quests ?? [])
    .filter(isHiddenStoryThread)
    .filter((thread) => thread.status !== "completed")
    .map(normalizeStoryThread)
    .filter(Boolean);
  if (explicit.length) {
    return sortStoryThreads(explicit).slice(0, 6);
  }
  return fallbackStoryThreads(campaign);
}

export function storyThreadPromptLines(campaign = {}) {
  const threads = buildHiddenStoryThreads(campaign);
  if (!threads.length) {
    return ["- None yet. Create compact dm_only quest records for long, mid, and short story horizons when the next turn gives enough direction."];
  }
  return threads.map((thread) => {
    const questions = thread.openQuestions.length ? ` Open questions: ${thread.openQuestions.join(" ")}` : "";
    const nextBeat = thread.nextBeat ? ` Next beat: ${thread.nextBeat}` : "";
    return `- ${thread.horizon}: ${thread.title}. Stakes: ${thread.stakes}.${questions}${nextBeat}`;
  });
}

export function compactHiddenStoryThreads(campaign = {}) {
  return buildHiddenStoryThreads(campaign).map((thread) => ({
    horizon: thread.horizon,
    title: thread.title,
    stakes: thread.stakes,
    openQuestions: thread.openQuestions.slice(0, 3),
    nextBeat: thread.nextBeat,
    instruction: "DM-only planning context. Do not reveal directly; use it to make scenes purposeful.",
  }));
}

function normalizeStoryThread(thread = {}) {
  const title = String(thread.title || thread.name || "").trim();
  if (!title) {
    return null;
  }
  return {
    id: thread.id || null,
    horizon: normalizeHorizon(thread.horizon || thread.timeHorizon || thread.scope),
    title,
    status: thread.status || "active",
    stakes: String(thread.stakes || thread.summary || thread.description || "Unresolved campaign direction.").trim(),
    openQuestions: normalizeList(thread.openQuestions || thread.open_questions),
    nextBeat: String(thread.nextBeat || thread.next_beat || thread.currentBeat || "").trim(),
  };
}

function fallbackStoryThreads(campaign = {}) {
  const title = campaign.title || "this campaign";
  const summary = String(campaign.summary || "").trim();
  const place = campaign.scene?.immediateSituation || campaign.scene?.situation || "the current scene";
  return [
    {
      horizon: "long",
      title: `The larger truth behind ${title}`,
      status: "active",
      stakes: summary
        ? `Turn the campaign premise into a deeper mystery, antagonist pressure, or world-changing revelation: ${summary}`
        : "Give the campaign a larger mystery, antagonist pressure, or world-changing revelation that can surface gradually.",
      openQuestions: ["What power, secret, or faction is really moving events?"],
      nextBeat: "Seed one subtle clue or consequence only when it naturally fits.",
    },
    {
      horizon: "mid",
      title: "The next few sessions' pressure",
      status: "active",
      stakes: "Connect current NPC motives, locations, and consequences into a problem the party can understand and pursue.",
      openQuestions: ["Who wants something soon, and what happens if the party ignores it?"],
      nextBeat: "Make the next location, NPC, or complication point toward a coherent objective.",
    },
    {
      horizon: "short",
      title: "The current table beat",
      status: "active",
      stakes: `Keep ${place} moving with concrete stakes, readable NPC intent, and player agency.`,
      openQuestions: ["What changes right now because of the players' latest choice?"],
      nextBeat: "Resolve the immediate action before introducing new branches.",
    },
  ];
}

function sortStoryThreads(threads) {
  const order = new Map(STORY_HORIZONS.map((horizon, index) => [horizon, index]));
  return [...threads].sort((a, b) => (order.get(a.horizon) ?? 99) - (order.get(b.horizon) ?? 99));
}

function normalizeHorizon(value = "") {
  const normalized = String(value).toLowerCase().trim();
  if (["long", "long_term", "long-term", "campaign"].includes(normalized)) return "long";
  if (["mid", "medium", "medium_term", "mid_term", "middle", "session_arc"].includes(normalized)) return "mid";
  if (["short", "short_term", "scene", "now"].includes(normalized)) return "short";
  return "mid";
}

function normalizeList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  return String(value || "")
    .split(/[,;\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}
