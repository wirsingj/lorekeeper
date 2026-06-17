const phaseCopy = Object.freeze({
  idle: {
    label: "Table",
    rail: "none",
  },
  roleplay: {
    label: "Story",
    rail: "party",
  },
  waiting_for_player: {
    label: "Player",
    rail: "party",
  },
  waiting_for_guest: {
    label: "Guests",
    rail: "party",
  },
  waiting_for_dm: {
    label: "DM",
    rail: "story",
  },
  party_vote: {
    label: "Vote",
    rail: "party",
  },
  combat: {
    label: "Combat",
    rail: "combat",
  },
  host_review: {
    label: "Review",
    rail: "review",
  },
  recovery: {
    label: "Recovery",
    rail: "review",
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

  if (elements.combatTrackerSection) {
    elements.combatTrackerSection.dataset.tableFocus = projection.focusRail === "combat" ? "primary" : "";
  }
}
