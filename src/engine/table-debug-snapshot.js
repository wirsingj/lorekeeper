import { getActiveCombatActor } from "./combat-engine.js";

// Compact "what is happening at the table?" blob for diagnostics.
// Keep this pure and redaction-friendly so both the renderer and local server
// can include it without reaching into DOM state or transport-specific objects.
export function buildTableDebugSnapshot({
  campaign = null,
  tableSession = null,
  turnProjection = null,
  currentTurn = null,
  providerActivity = null,
  reviewBatch = null,
  repair = null,
  multiplayer = null,
  guestSession = null,
  guestSnapshot = null,
  recentErrors = [],
} = {}) {
  const effectiveMultiplayer = multiplayer ?? campaign?.multiplayer ?? {};
  const localTable = effectiveMultiplayer.localTable ?? {};
  const combat = campaign?.combat ?? {};
  const activeCombatActor = combat.inCombat ? getActiveCombatActor(campaign) : null;
  const activeActorId = activeCombatActor?.id
    ?? turnProjection?.actorId
    ?? currentTurn?.actorId
    ?? combat.currentTurnId
    ?? "";
  const activeActor = activeActorId ? findActor(campaign, activeActorId) : null;
  const stagedInputs = Array.isArray(effectiveMultiplayer.pendingTurnInputs)
    ? effectiveMultiplayer.pendingTurnInputs
    : [];

  return {
    generatedAt: new Date().toISOString(),
    identity: {
      campaignId: campaign?.id ?? "",
      campaignTitle: campaign?.title ?? "",
      tableId: localTable.tableId ?? "",
      sessionId: localTable.sessionId ?? "",
      tableRunning: Boolean(localTable.running),
    },
    mode: {
      source: tableSession?.phase ? "TableSessionEngine" : "raw",
      phase: tableSession?.phase ?? "",
      headline: tableSession?.headline ?? "",
      expectedActor: tableSession?.expectedActor ?? null,
      waitingOn: tableSession?.waitingOn ?? "",
      nextStep: tableSession?.nextStep ?? "",
    },
    turn: {
      id: turnProjection?.turnId ?? currentTurn?.id ?? currentTurn?.turnId ?? "",
      state: turnProjection?.state ?? "",
      canSubmit: Boolean(turnProjection?.canSubmit),
      activeActorId,
      activeActorName: activeActor?.name ?? activeCombatActor?.name ?? "",
      controller: controllerSummary(activeActor),
      promptChars: currentTurn?.providerPrompt?.length ?? 0,
    },
    provider: providerSummary(providerActivity),
    combat: {
      active: Boolean(combat.inCombat),
      round: combat.round ?? null,
      currentTurnId: combat.currentTurnId ?? "",
      activeActorName: activeCombatActor?.name ?? "",
      turnOrderCount: Array.isArray(combat.turnOrder) ? combat.turnOrder.length : 0,
      enemyCount: Array.isArray(combat.enemies) ? combat.enemies.length : 0,
    },
    multiplayer: {
      hostTurnState: effectiveMultiplayer.hostTurnState ?? "",
      connectedGuests: countByStatus(effectiveMultiplayer.connections, "connected"),
      pendingGuests: countByStatus(effectiveMultiplayer.connections, "pending"),
      waitingGuests: countByStatus(effectiveMultiplayer.waitingGuests, "waiting"),
      stagedGuestInputs: stagedInputs.map((input) => ({
        id: input.id ?? "",
        connectionId: input.connectionId ?? "",
        characterId: input.characterId ?? "",
        characterName: input.characterName ?? "",
        ready: Boolean(input.ready),
        passed: Boolean(input.passed),
        disposition: input.disposition ?? "",
        textPreview: compact(input.text, 160),
      })),
      guest: guestSession || guestSnapshot ? {
        status: guestSession?.status ?? guestSnapshot?.connection?.status ?? "",
        connectionId: guestSession?.connectionId ?? guestSnapshot?.connection?.id ?? "",
        partyMemberId: guestSession?.partyMemberId ?? guestSnapshot?.connection?.partyMemberId ?? "",
        pendingInput: Boolean(guestSnapshot?.pendingInput?.text || guestSnapshot?.pendingInput?.passed),
      } : null,
    },
    review: {
      pendingChanges: countReviewChanges(reviewBatch),
      active: countReviewChanges(reviewBatch) > 0,
    },
    recovery: {
      active: Boolean(repair),
      reason: repair?.reason ?? "",
      turnId: repair?.turn?.turnId ?? repair?.turnId ?? "",
    },
    lastErrors: Array.isArray(recentErrors)
      ? recentErrors.slice(-8).map((error) => ({
          at: error.createdAt ?? error.at ?? "",
          severity: error.severity ?? "",
          source: error.source ?? "",
          eventType: error.eventType ?? error.type ?? "",
          message: compact(error.message, 260),
          requestId: error.requestId ?? "",
          model: error.model ?? "",
        }))
      : [],
  };
}

function providerSummary(providerActivity) {
  return {
    state: providerActivity?.state ?? providerActivity?.status ?? "",
    phase: providerActivity?.phase ?? providerActivity?.tablePhase ?? "",
    text: compact(providerActivity?.text ?? providerActivity?.message ?? "", 260),
    requestId: providerActivity?.requestId ?? "",
    model: providerActivity?.model ?? "",
  };
}

function findActor(campaign, actorId) {
  return [
    ...(campaign?.party ?? []),
    ...(campaign?.people ?? []),
    ...(campaign?.combat?.enemies ?? []),
  ].find((actor) => actor?.id === actorId) ?? null;
}

function controllerSummary(actor) {
  if (!actor) {
    return { kind: "", id: "" };
  }
  return {
    kind: actor.controllerKind ?? actor.controller ?? actor.type ?? "",
    id: actor.controllerId ?? "",
  };
}

function countByStatus(items, status) {
  return Array.isArray(items)
    ? items.filter((item) => item?.status === status).length
    : 0;
}

function countReviewChanges(reviewBatch) {
  const changes = Array.isArray(reviewBatch?.proposedChanges)
    ? reviewBatch.proposedChanges
    : Array.isArray(reviewBatch?.proposals)
      ? reviewBatch.proposals
      : [];
  return changes.filter((change) => change?.status !== "committed").length;
}

function compact(value, maxLength) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, Math.max(0, maxLength - 1))}...` : text;
}
