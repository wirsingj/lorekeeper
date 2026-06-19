import { isCampaignReadyForOpening } from "./table-opening-controller.js";

export function buildInputComposerProjection({
  clientMode = false,
  campaign = null,
  guestSession = null,
  guestSnapshot = null,
  turnProjection = {},
  tableSession = null,
  collectStagedRemoteInputs = () => [],
  findPartyMember = () => null,
  isHostControlledPartyRecord = () => false,
  labelById = (_id) => "Unknown",
} = {}) {
  if (clientMode) {
    const effectiveGuestSession = {
      ...guestSession,
      status: guestSession?.status ?? guestSnapshot?.connection?.status ?? "",
      partyMemberId: guestSession?.partyMemberId ?? guestSnapshot?.connection?.partyMemberId ?? "",
    };
    const connected = effectiveGuestSession.status === "connected";
    const readyForOpening = isCampaignReadyForOpening(campaign, { isHost: true });
    const activeCombatTurn = campaign?.combat?.inCombat ? campaign.combat.currentTurnId : null;
    const isGuestCombatTurn = !activeCombatTurn || activeCombatTurn === effectiveGuestSession.partyMemberId;
    const guestPhaseOverride = connected ? guestComposerPhaseOverride(tableSession, guestSnapshot) : null;
    if (connected && readyForOpening) {
      return {
        inputDisabled: true,
        sendDisabled: true,
        placeholder: "Waiting for the host to begin the opening scene.",
        buttonText: "Send To Host",
      };
    }
    if (guestPhaseOverride) {
      return {
        inputDisabled: true,
        sendDisabled: true,
        placeholder: guestPhaseOverride,
        buttonText: "Send To Host",
      };
    }
    return {
      inputDisabled: !connected || !isGuestCombatTurn,
      sendDisabled: !connected || !isGuestCombatTurn,
      placeholder: !connected
        ? "Join a hosted LoreKeeper table before sending party-member actions."
        : isGuestCombatTurn
          ? `Type as ${guestSnapshot?.assignedCharacter?.name ?? "your assigned party member"}. Send to the host table.`
          : `Waiting for ${labelById(activeCombatTurn)}'s combat turn.`,
      buttonText: "Send To Host",
    };
  }

  const readyForOpening = isCampaignReadyForOpening(campaign, { isHost: true });
  if (readyForOpening) {
    return {
      inputDisabled: true,
      sendDisabled: true,
      placeholder: "Press Start Adventure for the opening DM narration before sending table actions.",
      buttonText: "Send Turn",
    };
  }

  const combatGate = buildHostCombatGate({
    campaign,
    collectStagedRemoteInputs,
    findPartyMember,
    isHostControlledPartyRecord,
    labelById,
  });
  const phaseOverride = hostComposerPhaseOverride(tableSession);
  const phaseLocksComposer = Boolean(phaseOverride?.lock);
  return {
    inputDisabled: phaseLocksComposer || combatGate.inputDisabled,
    sendDisabled: phaseLocksComposer || !turnProjection.canSubmit || combatGate.sendDisabled,
    placeholder: phaseOverride?.placeholder || combatGate.placeholder || "Describe what your character does, says, or asks.",
    buttonText: "Send Turn",
  };
}

export function applyInputComposerProjection(elements, projection) {
  elements.playerInput.disabled = projection.inputDisabled;
  elements.playerInput.placeholder = projection.placeholder;
  elements.buildTurn.disabled = projection.sendDisabled;
  elements.buildTurn.textContent = projection.buttonText;
}

export function buildHostCombatGate({
  campaign = null,
  collectStagedRemoteInputs = () => [],
  findPartyMember = () => null,
  isHostControlledPartyRecord = () => false,
  labelById = (_id) => "Unknown",
} = {}) {
  const combat = campaign?.combat;
  if (!combat?.inCombat || !combat.currentTurnId) {
    return { inputDisabled: false, sendDisabled: false, placeholder: "" };
  }
  const activeId = combat.currentTurnId;
  const activeMember = findPartyMember(activeId);
  if (activeMember && isHostControlledPartyRecord(activeMember)) {
    return {
      inputDisabled: false,
      sendDisabled: false,
      placeholder: `Act as ${activeMember.name}. It is their combat turn.`,
    };
  }
  const stagedForActive = collectStagedRemoteInputs().length > 0;
  const activeName = labelById(activeId);
  return {
    inputDisabled: true,
    sendDisabled: !stagedForActive,
    placeholder: stagedForActive
      ? `${activeName}'s remote action is staged. Send Turn resolves it.`
      : `Waiting for ${activeName}'s combat turn.`,
  };
}

function hostComposerPhaseOverride(tableSession) {
  const phase = tableSession?.phase || "";
  if (phase === "waiting_for_dm") {
    return { lock: true, placeholder: "DM is thinking. Wait for the response before sending another turn." };
  }
  if (phase === "opening_ready") {
    return { lock: true, placeholder: "Press Start Adventure for the opening DM narration before sending table actions." };
  }
  if (phase === "recovery") {
    return { lock: true, placeholder: "Review the DM response before sending the next turn." };
  }
  if (phase === "host_review") {
    return { lock: true, placeholder: "Review the pending table changes before continuing." };
  }
  if (phase === "party_vote") {
    return { lock: false, placeholder: "Review the party vote, then send the table's final choice." };
  }
  if (phase === "waiting_for_guest") {
    return { lock: false, placeholder: "Seat waiting friends when ready, or continue the scene." };
  }
  return null;
}

function guestComposerPhaseOverride(tableSession, guestSnapshot) {
  const phase = tableSession?.phase || "";
  if (guestSnapshot?.pendingInput?.text || guestSnapshot?.pendingInput?.passed) {
    return "Your action was sent to the host table. Wait for it to resolve.";
  }
  if (phase === "waiting_for_dm") {
    return "DM is thinking. Wait for the table to continue.";
  }
  if (phase === "opening_ready") {
    return "Waiting for the host to begin the opening scene.";
  }
  if (phase === "recovery" || phase === "host_review") {
    return "Host is reviewing the table before play continues.";
  }
  if (phase === "party_vote") {
    return "Vote on the table choice above; the host makes the final call.";
  }
  return null;
}
