import { buildStartAdventureOpeningProjection } from "./table-opening-controller.js";

export function buildTableActionProjection({
  campaign = null,
  turnProjection = {},
  repair = null,
  repairHardBlocked = false,
  waitingGuests = [],
  preferredProvider = "",
  isHost = true,
} = {}) {
  const hasTable = Boolean(campaign);
  const activeRepair = Boolean(turnProjection.hasRepair || repair);
  const hasActiveGeneration = Boolean(turnProjection.hasActiveGeneration);
  const canNudge = Boolean(turnProjection.canNudge);
  const guestCount = Array.isArray(waitingGuests) ? waitingGuests.length : 0;
  const firstGuest = guestCount ? waitingGuests[0] : null;
  const startAdventure = buildStartAdventureOpeningProjection({
    campaign,
    turnProjection,
    isHost,
  });

  return {
    nudgeDm: {
      visible: true,
      disabled: !isHost || !hasTable || !canNudge,
      title: activeRepair
        ? "Review the DM response first"
        : hasActiveGeneration
          ? "DM is already generating"
          : !isHost
            ? "Only the host can nudge the DM"
            : "Nudge DM",
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
