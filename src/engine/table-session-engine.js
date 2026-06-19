import { getActiveCombatActor } from "./combat-engine.js";

export const tablePhases = Object.freeze({
  IDLE: "idle",
  OPENING_READY: "opening_ready",
  ROLEPLAY: "roleplay",
  WAITING_FOR_PLAYER: "waiting_for_player",
  WAITING_FOR_GUEST: "waiting_for_guest",
  WAITING_FOR_DM: "waiting_for_dm",
  PARTY_VOTE: "party_vote",
  COMBAT: "combat",
  HOST_REVIEW: "host_review",
  RECOVERY: "recovery",
});

const dmWorkingPhases = new Set([
  "dm_thinking",
  "preparing_turn",
  "enemy_turn",
  "resolving_remote_action",
  "guest_action_resolving",
  "retrying_dm",
  "working",
]);

const recoveryPhases = new Set([
  "recovering_turn",
  "dm_response_needs_review",
  "dm_timeout",
  "error",
]);

const canonOpeningRoles = new Set(["dm", "player", "party", "npc"]);

// TableSessionEngine is a projection engine: it consumes authoritative state
// from the turn/combat/multiplayer/provider systems and answers one question for
// UI and diagnostics: what is happening at the table right now?
export function buildTableSessionProjection({
  campaign = null,
  turnProjection = null,
  providerActivity = {},
  reviewBatch = null,
  repair = null,
  multiplayer = null,
  guestSession = null,
  guestSnapshot = null,
  clientMode = false,
} = {}) {
  const normalizedProvider = normalizeProviderActivity(providerActivity);
  const effectiveMultiplayer = multiplayer ?? campaign?.multiplayer ?? {};
  const pendingInputs = Array.isArray(effectiveMultiplayer.pendingTurnInputs)
    ? effectiveMultiplayer.pendingTurnInputs
    : [];
  const readyInputs = pendingInputs.filter((input) => input?.ready && !input?.passed && input?.text);
  const waitingInputs = pendingInputs.filter((input) => !input?.ready || input?.passed || !input?.text);
  const pendingGuests = (effectiveMultiplayer.connections ?? []).filter((connection) => connection.status === "pending");
  const waitingGuests = (effectiveMultiplayer.waitingGuests ?? []).filter((guest) => guest.status === "waiting");
  const choiceVotes = (effectiveMultiplayer.choiceVotes ?? []).filter((vote) => !vote.resolvedAt);
  const reviewCount = countOpenReviewChanges(reviewBatch);
  const activeCombatant = campaign?.combat?.inCombat ? getActiveCombatActor(campaign) : null;
  const guestPendingInput = guestSnapshot?.pendingInput ?? null;

  const context = {
    campaign,
    provider: normalizedProvider,
    turnProjection,
    repair,
    multiplayer: effectiveMultiplayer,
    pendingInputs,
    readyInputs,
    waitingInputs,
    pendingGuests,
    waitingGuests,
    choiceVotes,
    reviewCount,
    activeCombatant,
    guestSession,
    guestPendingInput,
    clientMode,
  };
  const phase = chooseTablePhase(context);
  const headline = phaseHeadline(phase, context);
  const nextStep = phaseNextStep(phase, context);
  const lines = buildPhaseLines(phase, context, nextStep);
  const expectedActor = expectedActorForPhase(phase, context);

  return {
    phase,
    headline,
    tone: toneForPhase(phase, normalizedProvider),
    nextStep,
    expectedActor,
    waitingOn: expectedActor?.label || "",
    dmStatus: normalizedProvider,
    combat: {
      active: Boolean(campaign?.combat?.inCombat),
      round: campaign?.combat?.round ?? null,
      activeActorId: activeCombatant?.id ?? null,
      activeActorName: activeCombatant?.name ?? "",
    },
    review: {
      active: reviewCount > 0,
      count: reviewCount,
    },
    recovery: {
      active: Boolean(repair) || recoveryPhases.has(normalizedProvider.phase),
      reason: repair?.reason || normalizedProvider.raw || "",
    },
    multiplayer: {
      tableRunning: Boolean(effectiveMultiplayer.localTable?.running),
      readyInputCount: readyInputs.length,
      waitingInputCount: waitingInputs.length,
      pendingGuestCount: pendingGuests.length,
      waitingGuestCount: waitingGuests.length,
      choiceVoteCount: choiceVotes.length,
      guestConnected: Boolean(guestSession?.connectionId || guestSnapshot?.connection?.id),
    },
    lines,
  };
}

function chooseTablePhase(context) {
  if (!context.campaign) {
    return tablePhases.IDLE;
  }
  if (context.repair || recoveryPhases.has(context.provider.phase)) {
    return tablePhases.RECOVERY;
  }
  if (context.reviewCount > 0) {
    return tablePhases.HOST_REVIEW;
  }
  if (context.provider.state === "working" || dmWorkingPhases.has(context.provider.phase)) {
    return tablePhases.WAITING_FOR_DM;
  }
  if (context.choiceVotes.length > 0) {
    return tablePhases.PARTY_VOTE;
  }
  if (context.pendingGuests.length || context.waitingGuests.length) {
    return tablePhases.WAITING_FOR_GUEST;
  }
  if (context.guestPendingInput?.text || context.guestPendingInput?.passed) {
    return tablePhases.WAITING_FOR_DM;
  }
  if (isCampaignReadyForOpening(context.campaign)) {
    return tablePhases.OPENING_READY;
  }
  if (context.readyInputs.length > 0) {
    return tablePhases.WAITING_FOR_PLAYER;
  }
  if (context.campaign.combat?.inCombat) {
    return tablePhases.COMBAT;
  }
  if (context.turnProjection?.state === "awaiting_input" || context.turnProjection?.canSubmit) {
    return tablePhases.WAITING_FOR_PLAYER;
  }
  return tablePhases.ROLEPLAY;
}

function phaseHeadline(phase, context) {
  switch (phase) {
    case tablePhases.IDLE:
      return "No Table Open";
    case tablePhases.OPENING_READY:
      return "Ready To Start";
    case tablePhases.RECOVERY:
      return "Recovery Needed";
    case tablePhases.HOST_REVIEW:
      return "Host Review";
    case tablePhases.WAITING_FOR_DM:
      return "DM Resolving";
    case tablePhases.PARTY_VOTE:
      return "Party Vote";
    case tablePhases.WAITING_FOR_GUEST:
      return "Waiting For Guest";
    case tablePhases.COMBAT:
      return context.activeCombatant
        ? `Combat Round ${context.campaign.combat?.round ?? 1}: ${context.activeCombatant.name}`
        : `Combat Round ${context.campaign.combat?.round ?? 1}`;
    case tablePhases.WAITING_FOR_PLAYER:
      return context.readyInputs.length
        ? "Host Action Needed"
        : "Waiting For Player";
    case tablePhases.ROLEPLAY:
    default:
      return "Roleplay";
  }
}

function phaseNextStep(phase, context) {
  switch (phase) {
    case tablePhases.IDLE:
      return "Open or create a campaign to start the table.";
    case tablePhases.OPENING_READY:
      return "Invite anyone else, then press Start Adventure for the opening narration.";
    case tablePhases.RECOVERY:
      return context.repair
        ? "Host chooses Try Again, Details, or Use Anyway."
        : "Host reviews the DM status and chooses the next recovery action.";
    case tablePhases.HOST_REVIEW:
      return `Host reviews or saves ${context.reviewCount} proposed table ${context.reviewCount === 1 ? "change" : "changes"}.`;
    case tablePhases.WAITING_FOR_DM:
      return context.guestPendingInput?.text || context.guestPendingInput?.passed
        ? "Wait for the host table to resolve your input."
        : "Wait for the DM response; new turns are locked until it lands.";
    case tablePhases.PARTY_VOTE:
      return "Players vote; host makes the final table call.";
    case tablePhases.WAITING_FOR_GUEST:
      if (context.pendingGuests.length) {
        return context.pendingGuests.length === 1
          ? `Host approves or declines ${context.pendingGuests[0].displayName || "the guest"}.`
          : "Host approves or declines guest requests.";
      }
      return context.waitingGuests.length === 1
        ? `Host seats ${context.waitingGuests[0].displayName || "the guest"}.`
        : "Host seats waiting guests.";
    case tablePhases.COMBAT:
      return context.activeCombatant
        ? `${context.activeCombatant.name} takes the active combat turn.`
        : "Choose the active combatant's action.";
    case tablePhases.WAITING_FOR_PLAYER:
      if (context.readyInputs.length) {
        return context.multiplayer.settings?.requireGuestActionApproval
          ? "Host approves the staged guest action or asks for changes."
          : "Host resolves the staged table input when ready.";
      }
      return "Host or active player sends the next table action.";
    case tablePhases.ROLEPLAY:
    default:
      return "Host or players continue the scene.";
  }
}

function buildPhaseLines(phase, context, nextStep) {
  const lines = [];
  if (nextStep) {
    lines.push(`Next: ${nextStep}`);
  }
  if (context.provider.text && (context.provider.state === "working" || context.provider.state === "waiting" || context.provider.state === "error")) {
    lines.push(`${context.provider.state === "error" ? "Attention" : "Status"}: ${context.provider.text}`);
  }
  if (context.campaign?.combat?.inCombat) {
    lines.push(context.activeCombatant
      ? `Combat is active: ${context.activeCombatant.name}'s turn in round ${context.campaign.combat.round ?? 1}.`
      : `Combat is active: round ${context.campaign.combat.round ?? 1}.`);
  }
  if (context.readyInputs.length) {
    lines.push(`${context.readyInputs.length} staged table ${context.readyInputs.length === 1 ? "input is" : "inputs are"} ready.`);
  }
  if (context.pendingGuests.length) {
    lines.push(`${context.pendingGuests.length} guest ${context.pendingGuests.length === 1 ? "request needs" : "requests need"} host review.`);
  }
  if (context.waitingGuests.length) {
    lines.push(`${context.waitingGuests.length} guest ${context.waitingGuests.length === 1 ? "is" : "are"} waiting for a seat.`);
  }
  if (context.reviewCount) {
    lines.push(`${context.reviewCount} proposed state ${context.reviewCount === 1 ? "change is" : "changes are"} waiting for review.`);
  }
  if (!lines.length && phase === tablePhases.ROLEPLAY) {
    lines.push("No blockers detected.");
  }
  return lines;
}

function expectedActorForPhase(phase, context) {
  switch (phase) {
    case tablePhases.WAITING_FOR_DM:
      return { kind: "dm", label: "DM" };
    case tablePhases.HOST_REVIEW:
    case tablePhases.RECOVERY:
      return { kind: "host", label: "Host" };
    case tablePhases.OPENING_READY:
      return { kind: "host", label: "Host" };
    case tablePhases.PARTY_VOTE:
      return { kind: "party", label: "Party vote" };
    case tablePhases.WAITING_FOR_GUEST:
      return { kind: "guest", label: "Guest" };
    case tablePhases.COMBAT:
      return context.activeCombatant
        ? { kind: "combat_actor", id: context.activeCombatant.id, label: context.activeCombatant.name }
        : { kind: "combat_actor", label: "Active combatant" };
    case tablePhases.WAITING_FOR_PLAYER:
      return context.readyInputs.length
        ? { kind: "host", label: "Host" }
        : { kind: "player", label: "Player" };
    default:
      return null;
  }
}

function toneForPhase(phase, provider) {
  if (phase === tablePhases.RECOVERY || provider.state === "error") {
    return "attention";
  }
  if (phase === tablePhases.WAITING_FOR_DM || provider.state === "working") {
    return "working";
  }
  if ([tablePhases.OPENING_READY, tablePhases.WAITING_FOR_PLAYER, tablePhases.WAITING_FOR_GUEST, tablePhases.PARTY_VOTE, tablePhases.HOST_REVIEW].includes(phase)) {
    return "waiting";
  }
  return "ready";
}

function isCampaignReadyForOpening(campaign) {
  if (!campaign || campaign.scene?.status !== "campaign_start") {
    return false;
  }
  const storedMessages = campaign.sessionLog?.messages ?? [];
  return !storedMessages.some((message) => canonOpeningRoles.has(message.role));
}

function normalizeProviderActivity(providerActivity = {}) {
  const text = String(providerActivity.text || providerActivity.message || "").trim();
  const phase = String(providerActivity.phase || providerActivity.tablePhase || providerActivity.statusPhase || "").trim();
  const state = String(providerActivity.state || providerActivity.status || "idle").trim() || "idle";
  return {
    text,
    raw: String(providerActivity.raw || text || "").trim(),
    phase: phase || state,
    state,
  };
}

function countOpenReviewChanges(reviewBatch) {
  const changes = Array.isArray(reviewBatch?.proposals)
    ? reviewBatch.proposals
    : Array.isArray(reviewBatch?.proposedChanges)
      ? reviewBatch.proposedChanges
      : [];
  return changes.filter((change) => change.status !== "committed").length;
}
