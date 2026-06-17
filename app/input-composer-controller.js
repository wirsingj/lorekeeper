export function buildInputComposerProjection({
  clientMode = false,
  campaign = null,
  guestSession = null,
  guestSnapshot = null,
  turnProjection = {},
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
    const activeCombatTurn = campaign?.combat?.inCombat ? campaign.combat.currentTurnId : null;
    const isGuestCombatTurn = !activeCombatTurn || activeCombatTurn === effectiveGuestSession.partyMemberId;
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

  const combatGate = buildHostCombatGate({
    campaign,
    collectStagedRemoteInputs,
    findPartyMember,
    isHostControlledPartyRecord,
    labelById,
  });
  return {
    inputDisabled: combatGate.inputDisabled,
    sendDisabled: !turnProjection.canSubmit || combatGate.sendDisabled,
    placeholder: combatGate.placeholder || "Describe what your character does, says, or asks.",
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
