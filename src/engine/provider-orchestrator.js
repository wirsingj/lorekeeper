import { buildSceneIntentPack, buildSceneRetrieval } from "./scene-engine.js";

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
  const sceneRetrieval = buildSceneRetrieval(campaign ?? {});
  const sceneIntent = buildSceneIntentPack(campaign ?? {}, { sceneRetrieval });
  return {
    task,
    turnId: turn?.turnId ?? null,
    mode: turn?.mode ?? deriveMode(campaign),
    readonlyContext: {
      scene: summarizeScene(campaign, sceneRetrieval),
      sceneIntent,
      escalationPolicy: sceneIntent.escalationPolicy,
      activeConsequences: sceneRetrieval.activeConsequences.map(summarizeConsequence),
      relevantRelationships: sceneRetrieval.relevantRelationships.map(summarizeRelationship),
      activeThreads: sceneRetrieval.activeThreads.map(summarizeThread),
      activeActor: summarizeActor(campaign, turn?.actorId ?? campaign?.combat?.currentTurnId),
      recentMessages: (campaign?.sessionLog?.messages ?? []).slice(-8).map((message) => ({
        role: message.role,
        speaker: message.speaker ?? message.speakerName ?? message.title ?? null,
        text: String(message.body ?? message.text ?? message.content ?? "").slice(0, 1200),
      })),
      combat: summarizeCombat(campaign),
      ...context,
    },
    actionRecord,
    outputContract: outputContractForTask(task),
    dmQuality: dmQualityPolicyForTask(task),
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

export function createProviderOrchestrator(options = {}) {
  const fetchFn = options.fetchFn ?? globalThis.fetch?.bind(globalThis);
  const endpoint = options.endpoint;
  const setTimeoutFn = options.setTimeoutFn ?? globalThis.setTimeout?.bind(globalThis);
  const clearTimeoutFn = options.clearTimeoutFn ?? globalThis.clearTimeout?.bind(globalThis);
  if (!fetchFn) {
    throw new Error("ProviderOrchestrator requires a fetch function");
  }

  return {
    startLocalGeneration({ turn, providerSettings = {}, onEvent = () => {}, validateProviderResult = () => "", renderStructuredResponse = defaultRenderStructuredResponse }) {
      if (!endpoint) {
        throw new Error("ProviderOrchestrator requires an endpoint for local generation");
      }
      if (!turn?.playerMessage?.trim()) {
        throw new Error("Cannot start provider generation without a player message");
      }
      const turnId = turn.turnId ?? turn.id ?? `turn-${Date.now()}`;
      const requestId = `provider-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const controller = new AbortController();
      let responseText = "";
      let providerReceived = false;
      let timedOut = false;
      const timeoutMs = Math.max(15000, Number(providerSettings.generationTimeoutMs) || 120000) + 5000;
      const emit = (event) => onEvent({ turnId, requestId, ...event });
      queueMicrotask(() => emit({ type: "generation_started" }));
      const timeoutId = setTimeoutFn?.(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs);

      const promise = (async () => {
        try {
          const response = await fetchFn(endpoint, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              playerMessage: turn.playerMessage,
              playerInputs: turn.playerInputs ?? [],
            }),
            signal: controller.signal,
          });

          if (!response.ok || !response.body) {
            throw new Error(await response.text());
          }

          for await (const event of readNdjsonResponse(response.body)) {
            if (event.type === "start") {
              providerReceived = true;
              emit({ type: "generation_started", model: event.model });
            } else if (event.type === "token") {
              responseText += event.text ?? "";
              emit({ type: "generation_delta", textDelta: event.text ?? "" });
            } else if (event.type === "done") {
              responseText = event.result?.structured
                ? renderStructuredResponse(event.result.structured)
                : event.result?.text ?? responseText;
              const validationIssue = validateProviderResult(event.result);
              const completion = {
                providerReceived: true,
                responseText,
                rawText: event.result?.text ?? responseText,
                providerResult: event.result,
                validationIssue,
              };
              emit({ type: validationIssue ? "generation_failed" : "generation_completed", response: completion, error: validationIssue, recoverable: Boolean(validationIssue) });
              return completion;
            } else if (event.type === "error") {
              throw new Error(event.error || "Local provider generation failed.");
            }
          }

          if (responseText.trim()) {
            const completion = {
              providerReceived,
              responseText,
              rawText: responseText,
              providerResult: {
                text: responseText,
                warning: "Stream ended without a done event.",
              },
              validationIssue: "",
            };
            emit({ type: "generation_completed", response: completion });
            return completion;
          }

          throw new Error("Ollama returned no response text.");
        } catch (error) {
          if (error?.name === "AbortError") {
            const cancelled = {
              providerReceived,
              responseText,
              timedOut,
              canceled: !timedOut,
            };
            emit({ type: "generation_cancelled", reason: timedOut ? "timeout" : "cancelled", response: cancelled });
            return cancelled;
          }
          const failed = {
            providerReceived,
            responseText,
            error,
          };
          emit({
            type: "generation_failed",
            error: error instanceof Error ? error.message : String(error ?? "Provider generation failed"),
            recoverable: true,
            response: failed,
          });
          return failed;
        } finally {
          clearTimeoutFn?.(timeoutId);
        }
      })();

      return {
        turnId,
        requestId,
        cancel: () => controller.abort(),
        promise,
      };
    },
  };
}

export async function* readNdjsonResponse(body) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (line) yield JSON.parse(line);
      newlineIndex = buffer.indexOf("\n");
    }
  }

  const final = buffer.trim();
  if (final) yield JSON.parse(final);
}

function deriveMode(campaign) {
  return campaign?.combat?.inCombat ? "combat" : campaign?.scene?.status === "downtime" ? "downtime" : "rp";
}

function summarizeScene(campaign, sceneRetrieval = buildSceneRetrieval(campaign ?? {})) {
  const scene = sceneRetrieval.scene;
  return {
    status: campaign?.scene?.status ?? null,
    currentPlaceId: campaign?.scene?.currentPlaceId ?? null,
    activeSceneId: campaign?.scene?.activeSceneId ?? scene?.id ?? null,
    title: scene?.title ?? null,
    type: scene?.type ?? null,
    immediateSituation: scene?.immediateSituation ?? campaign?.scene?.immediateSituation ?? "",
    whyHere: scene?.whyHere ?? "",
    goals: scene?.goals ?? [],
    tensions: scene?.tensions ?? campaign?.scene?.tensions ?? [],
    unresolvedQuestions: scene?.unresolvedQuestions ?? campaign?.scene?.unresolvedQuestions ?? [],
    participants: sceneRetrieval.participants.map((participant) => ({
      id: participant.id,
      name: participant.name ?? participant.title ?? participant.id,
      role: participant.role ?? participant.type ?? participant.controllerKind ?? null,
    })),
  };
}

function summarizeConsequence(consequence) {
  return {
    id: consequence.id,
    title: consequence.title,
    scope: consequence.scope,
    state: consequence.state,
    importance: consequence.importance,
    description: consequence.description,
    participantIds: consequence.participantIds ?? [],
    threadIds: consequence.threadIds ?? [],
  };
}

function summarizeRelationship(relationship) {
  return {
    id: relationship.id ?? null,
    sourceId: relationship.sourceId,
    targetId: relationship.targetId,
    type: relationship.type,
    notes: asText(relationship.notes),
  };
}

function summarizeThread(thread) {
  return {
    id: thread.id,
    title: thread.title,
    status: thread.status,
    stakes: thread.stakes ?? "",
    openQuestions: thread.openQuestions ?? [],
  };
}

function asText(value) {
  if (Array.isArray(value)) {
    return value.filter(Boolean).map((entry) => String(entry).trim()).filter(Boolean).join(" ");
  }
  if (value && typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value ?? "");
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

function dmQualityPolicyForTask(task) {
  return {
    role: "creative_tabletop_dm_assistant",
    priorities: [
      "react to the latest table action",
      "prefer existing context before new content",
      "make NPCs act from motives, fears, relationships, and leverage",
      "create consequences that follow naturally",
      "avoid random escalation unless established danger demands it",
    ],
    avoid: [
      "generic story continuation",
      "random encounter table behavior",
      "sudden unrelated threats",
      "repeating the player action back",
      "flat exposition-only NPCs",
    ],
    taskGuidance: task === "choose_npc_intent"
      ? "Choose the NPC intent that best follows from their goal, fear, information, and current leverage."
      : "Narrate like a long-running campaign DM: continuity, consequence, sense of place, and meaningful agency first.",
  };
}

function defaultRenderStructuredResponse(structured) {
  return JSON.stringify(structured, null, 2);
}
