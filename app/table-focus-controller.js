const phaseCopy = Object.freeze({
  idle: {
    label: "Table",
    rail: "none",
    surfaces: {
      campaign: "supporting",
      party: "supporting",
      combat: "",
      notebook: "supporting",
      tableTalk: "supporting",
    },
  },
  roleplay: {
    label: "Story",
    rail: "party",
    surfaces: {
      campaign: "supporting",
      party: "supporting",
      combat: "",
      notebook: "supporting",
      tableTalk: "supporting",
    },
  },
  waiting_for_player: {
    label: "Player",
    rail: "party",
    surfaces: {
      campaign: "supporting",
      party: "primary",
      combat: "",
      notebook: "quiet",
      tableTalk: "supporting",
    },
  },
  waiting_for_guest: {
    label: "Guests",
    rail: "party",
    surfaces: {
      campaign: "supporting",
      party: "primary",
      combat: "",
      notebook: "quiet",
      tableTalk: "supporting",
    },
  },
  waiting_for_dm: {
    label: "DM",
    rail: "story",
    surfaces: {
      campaign: "supporting",
      party: "quiet",
      combat: "quiet",
      notebook: "quiet",
      tableTalk: "quiet",
    },
  },
  party_vote: {
    label: "Vote",
    rail: "party",
    surfaces: {
      campaign: "supporting",
      party: "primary",
      combat: "",
      notebook: "quiet",
      tableTalk: "supporting",
    },
  },
  combat: {
    label: "Combat",
    rail: "combat",
    surfaces: {
      campaign: "supporting",
      party: "supporting",
      combat: "primary",
      notebook: "quiet",
      tableTalk: "quiet",
    },
  },
  host_review: {
    label: "Review",
    rail: "review",
    surfaces: {
      campaign: "primary",
      party: "quiet",
      combat: "quiet",
      notebook: "quiet",
      tableTalk: "quiet",
    },
  },
  recovery: {
    label: "Recovery",
    rail: "review",
    surfaces: {
      campaign: "primary",
      party: "quiet",
      combat: "quiet",
      notebook: "quiet",
      tableTalk: "quiet",
    },
  },
});

export function buildTableFocusProjection(tableSession = null) {
  const phase = tableSession?.phase || "idle";
  const copy = phaseCopy[phase] ?? phaseCopy.idle;
  const headline = tableSession?.headline || "Table Ready";
  const nextStep = tableSession?.nextStep || "Continue the scene.";
  return {
    phase,
    tone: tableSession?.tone || "ready",
    focusRail: copy.rail,
    surfaces: copy.surfaces,
    label: copy.label,
    nowText: `Now: ${headline}`,
    nextText: `Next: ${nextStep}`,
  };
}

export function applyTableFocusProjection(elements, projection) {
  if (elements.app) {
    elements.app.dataset.tablePhase = projection.phase;
    elements.app.dataset.tableTone = projection.tone;
    elements.app.dataset.tableFocus = projection.focusRail;
  }

  if (elements.commandContext) {
    elements.commandContext.dataset.phase = projection.phase;
    elements.commandContext.dataset.tone = projection.tone;
  }
  if (elements.commandContextPhase) {
    elements.commandContextPhase.textContent = projection.nowText;
  }
  if (elements.commandContextNext) {
    elements.commandContextNext.textContent = projection.nextText;
  }

  applySurfaceFocus(elements.campaignRailSection, projection.surfaces?.campaign);
  applySurfaceFocus(elements.partyRailSection, projection.surfaces?.party);
  applySurfaceFocus(elements.combatTrackerSection, projection.surfaces?.combat);
  applySurfaceFocus(elements.campaignNotesPanel, projection.surfaces?.notebook);
  applySurfaceFocus(elements.playerNotesPanel, projection.surfaces?.notebook);
  applySurfaceFocus(elements.tableTalkSection, projection.surfaces?.tableTalk);
}

function applySurfaceFocus(element, state = "") {
  if (!element) {
    return;
  }
  element.dataset.tableFocus = state || "";
}
