import { buildStartAdventureOpeningProjection, isCampaignReadyForOpening } from "./table-opening-controller.js";

export function buildTableActionProjection({
  campaign = null,
  turnProjection = {},
  repair = null,
  repairHardBlocked = false,
  waitingGuests = [],
  preferredProvider = "",
  isHost = true,
  openingRequested = false,
} = {}) {
  const hasTable = Boolean(campaign);
  const activeRepair = Boolean(turnProjection.hasRepair || repair);
  const hasActiveGeneration = Boolean(turnProjection.hasActiveGeneration);
  const canNudge = Boolean(turnProjection.canNudge);
  const guestCount = Array.isArray(waitingGuests) ? waitingGuests.length : 0;
  const firstGuest = guestCount ? waitingGuests[0] : null;
  const readyForOpening = isCampaignReadyForOpening(campaign, { isHost });
  const startAdventure = buildStartAdventureOpeningProjection({
    campaign,
    turnProjection,
    isHost,
    openingRequested,
  });

  return {
    nudgeDm: {
      visible: true,
      disabled: !isHost || !hasTable || readyForOpening || !canNudge,
      title: activeRepair
        ? "Review the DM response first"
        : !isHost
          ? "Only the host can nudge the DM"
          : readyForOpening
            ? "Start Adventure before nudging the DM"
            : hasActiveGeneration
              ? "DM is already generating"
              : "Nudge DM",
    },
    cancelGeneration: {
      visible: Boolean(isHost && hasTable && hasActiveGeneration),
      disabled: false,
      title: "Cancel the DM response in progress",
    },
    startAdventure,
    seatGuest: {
      visible: Boolean(isHost && hasTable && guestCount),
      disabled: !isHost || !hasTable || !guestCount,
      text: guestCount === 1
        ? `Seat ${firstGuest?.displayName || "Guest"}`
        : `Seat ${guestCount} Guests`,
      title: guestCount === 1
        ? `${firstGuest?.displayName || "A guest"} is waiting for a character seat`
        : `${guestCount} guests are waiting for character seats`,
    },
    repairRetry: {
      visible: activeRepair,
      disabled: hasActiveGeneration,
    },
    repairInspect: {
      visible: activeRepair,
      disabled: false,
    },
    repairUseAnyway: {
      visible: activeRepair,
      disabled: hasActiveGeneration || repairHardBlocked,
      title: repairHardBlocked
        ? "Try Again: this response spoke or acted for a controlled character."
        : "Use the visible DM text despite table-check warnings.",
    },
    readLatest: {
      visible: Boolean(isHost && hasTable && !activeRepair && preferredProvider === "bridge"),
      disabled: false,
    },
  };
}

export function applyTableActionProjection(elements, projection) {
  applyButtonState(elements.nudgeDm, projection.nudgeDm);
  applyButtonState(elements.cancelGeneration, projection.cancelGeneration, {
    hiddenWhenUnavailable: true,
  });
  applyButtonState(elements.startAdventureOpening, projection.startAdventure, {
    hiddenWhenUnavailable: true,
  });
  applyButtonState(elements.seatWaitingGuest, projection.seatGuest, {
    hiddenWhenUnavailable: true,
    fallbackText: "Seat Guest",
  });
  applyButtonState(elements.repairRetry, projection.repairRetry, { hiddenWhenUnavailable: true });
  applyButtonState(elements.repairInspect, projection.repairInspect, { hiddenWhenUnavailable: true });
  applyButtonState(elements.repairImportAnyway, projection.repairUseAnyway, { hiddenWhenUnavailable: true });
  applyButtonState(elements.recheckProvider, projection.readLatest, { hiddenWhenUnavailable: true });
}

export function buildNudgeDmCommandGate({
  isHost = true,
  readyForOpening = false,
  turnProjection = {},
} = {}) {
  if (!isHost) {
    return {
      blocked: true,
      reason: "guest_mode",
      activityText: "Only the host can nudge the DM",
      activityState: "waiting",
    };
  }
  if (readyForOpening) {
    return {
      blocked: true,
      reason: "opening_not_started",
      activityText: "Start Adventure before nudging the DM.",
      activityState: "waiting",
    };
  }
  if (turnProjection.hasActiveGeneration) {
    return {
      blocked: true,
      reason: "busy",
      activityText: "DM is already generating",
      activityState: "waiting",
    };
  }
  return { blocked: false };
}

export function buildAiCompanionNudgeGate({
  isHost = true,
  readyForOpening = false,
  inCombat = false,
  isActiveCombatTurn = false,
  companionName = "This companion",
} = {}) {
  if (!isHost) {
    return {
      blocked: true,
      reason: "guest_mode",
      activityText: "Only the host can nudge AI companions",
      activityState: "waiting",
      title: "Only the host can nudge AI companions",
    };
  }
  if (readyForOpening) {
    return {
      blocked: true,
      reason: "opening_not_started",
      activityText: "Start Adventure before nudging AI companions.",
      activityState: "waiting",
      title: "Start Adventure before nudging AI companions",
    };
  }
  if (inCombat && !isActiveCombatTurn) {
    return {
      blocked: true,
      reason: "combat_wrong_turn",
      activityText: `${companionName} can be nudged for RP after combat, or on their own combat turn.`,
      activityState: "waiting",
      title: `${companionName} can be nudged on their own combat turn`,
    };
  }
  return {
    blocked: false,
    title: inCombat
      ? `Nudge ${companionName} for a companion combat suggestion`
      : `Nudge ${companionName} for a brief AI companion RP contribution`,
  };
}

export function buildStartAdventureCommandGate({
  isHost = true,
  readyForOpening = false,
  openingRequested = false,
  turnProjection = {},
} = {}) {
  if (!isHost) {
    return {
      blocked: true,
      reason: "guest_mode",
      activityText: "Only the host can start the adventure",
      activityState: "waiting",
    };
  }
  if (!readyForOpening) {
    return {
      blocked: true,
      reason: "already_started",
      activityText: "The adventure has already started. Use Nudge when the DM needs to continue.",
      activityState: "idle",
    };
  }
  if (openingRequested) {
    return {
      blocked: true,
      reason: "requested_this_session",
      activityText: "The adventure is already starting for this table session.",
      activityState: "waiting",
    };
  }
  if (turnProjection.hasActiveGeneration) {
    return {
      blocked: true,
      reason: "busy",
      activityText: "DM is already starting the adventure",
      activityState: "waiting",
    };
  }
  return { blocked: false };
}

function applyButtonState(button, state = {}, { hiddenWhenUnavailable = false, fallbackText = "" } = {}) {
  if (!button) {
    return;
  }
  const visible = Boolean(state.visible);
  if (hiddenWhenUnavailable) {
    button.hidden = !visible;
  }
  button.disabled = Boolean(state.disabled);
  if (state.text || fallbackText) {
    button.textContent = visible ? (state.text || fallbackText) : fallbackText;
  }
  if (state.title) {
    button.title = state.title;
  }
}
