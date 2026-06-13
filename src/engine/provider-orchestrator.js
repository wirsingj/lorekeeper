const providerTasks = new Set([
  "generate_scene_beat",
  "narrate_resolved_action",
  "choose_npc_intent",
  "suggest_ai_companion_action",
  "summarize_recent_play",
  "propose_lore_updates",
  "repair_bad_json",
]);

export function buildProviderTaskRequest({ task, campaign, turn, context = {}, actionRecord = null }) {
  if (!providerTasks.has(task)) {
    throw new Error(`Unsupported provider task: ${task}`);
  }
  return {
    task,
    turnId: turn?.turnId ?? null,
    mode: turn?.mode ?? deriveMode(campaign),
    readonlyContext: {
      scene: summarizeScene(campaign),
      activeActor: summarizeActor(campaign, turn?.actorId ?? campaign?.combat?.currentTurnId),
      recentMessages: (campaign?.sessionLog?.messages ?? []).slice(-8).map((message) => ({
        role: message.role,
        speaker: message.speaker ?? message.speakerName ?? null,
        text: String(message.text ?? message.content ?? "").slice(0, 1200),
      })),
      combat: summarizeCombat(campaign),
      ...context,
    },
    actionRecord,
    outputContract: outputContractForTask(task),
    mutationPolicy: "Provider may propose changes only. Canonical state changes are app-owned and validated.",
  };
}

export function acceptProviderResponseForTurn(turnState, response) {
  if (!response || response.turnId !== turnState.turnId) {
    return { accepted: false, reason: "stale_provider_response" };
  }
  return {
    accepted: true,
    narration: response.narration ?? "",
    suggestions: Array.isArray(response.suggestions) ? response.suggestions : [],
    proposedChanges: Array.isArray(response.proposedChanges) ? response.proposedChanges : [],
  };
}

function deriveMode(campaign) {
  return campaign?.combat?.inCombat ? "combat" : campaign?.scene?.status === "downtime" ? "downtime" : "rp";
}

function summarizeScene(campaign) {
  return {
    status: campaign?.scene?.status ?? null,
    currentPlaceId: campaign?.scene?.currentPlaceId ?? null,
    immediateSituation: campaign?.scene?.immediateSituation ?? "",
  };
}

function summarizeActor(campaign, actorId) {
  if (!actorId) return null;
  const actor = [...(campaign?.party ?? []), ...(campaign?.people ?? []), ...(campaign?.combat?.enemies ?? [])].find((item) => item.id === actorId);
  if (!actor) return { id: actorId };
  return {
    id: actor.id,
    name: actor.name ?? actor.title ?? actor.id,
    role: actor.role ?? actor.type ?? null,
    controllerKind: actor.controllerKind ?? null,
    summary: String(actor.summary ?? actor.description ?? "").slice(0, 800),
  };
}

function summarizeCombat(campaign) {
  if (!campaign?.combat?.inCombat) return { inCombat: false };
  return {
    inCombat: true,
    round: campaign.combat.round,
    currentTurnId: campaign.combat.currentTurnId,
    turnOrder: (campaign.combat.turnOrder ?? []).map((entry) => ({ id: entry.id, name: entry.name, type: entry.type })),
  };
}

function outputContractForTask(task) {
  if (task === "choose_npc_intent" || task === "suggest_ai_companion_action") {
    return { intent: "string", actionType: "string", targetIds: "string[]", rationale: "string" };
  }
  if (task === "narrate_resolved_action") {
    return { narration: "string", suggestions: "optional string[]", proposedChanges: "optional reviewed-only array" };
  }
  return { narration: "string", suggestions: "optional string[]", proposedChanges: "optional reviewed-only array" };
}
