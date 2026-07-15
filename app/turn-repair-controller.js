const TECHNICAL_REPAIR_REASON = /(?:json|schema|contract|parse|validation|sceneStatus|choices\.|flags\.|mechanics\.|proposedChanges|provider result)/i;
const CONTROLLED_AGENCY_REPAIR_REASON = /(?:speaks? as controlled party member|uses DM role for controlled party member|appears to speak, decide, or act for controlled party member|without submitted controller input)/i;

export function compactUiText(value, limit = 160) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length <= limit ? text : `${text.slice(0, Math.max(0, limit - 1)).trimEnd()}...`;
}

export function tableRepairReason(value) {
  const text = compactUiText(value, 140);
  if (CONTROLLED_AGENCY_REPAIR_REASON.test(String(value ?? ""))) {
    const names = controlledAgencyRepairNames(value);
    const target = names.length
      ? names.length === 1
        ? names[0]
        : `${names.slice(0, -1).join(", ")}, and ${names.at(-1)}`
      : "a controlled party member";
    return `the DM response tried to speak or act for ${target}`;
  }
  if (!text || TECHNICAL_REPAIR_REASON.test(text)) {
    return "the DM response did not pass LoreKeeper's table checks";
  }
  return text;
}

function controlledAgencyRepairNames(value) {
  const names = [];
  for (const match of String(value ?? "").matchAll(/controlled party member ([A-Za-z][A-Za-z0-9' -]{1,60}?)(?: without|;|$)/gi)) {
    const name = compactUiText(match[1], 80);
    if (name && !names.includes(name)) {
      names.push(name);
    }
  }
  return names;
}

export function turnRepairStatusText(repair) {
  return `DM response needs review: ${tableRepairReason(repair?.reason)}`;
}

export function turnRepairActivityText(repair) {
  if (isHardBlockedTurnRepair(repair)) {
    return "DM response needs review - LoreKeeper blocked it because it spoke or acted for a controlled character. Try Again or open Details.";
  }
  return `DM response needs review - ${tableRepairReason(repair?.reason)}. Try Again, Details, or Use Anyway.`;
}

export function isHardBlockedTurnRepair(repair) {
  const text = [
    repair?.reason,
    repair?.parseError,
    ...(Array.isArray(repair?.validationErrors) ? repair.validationErrors : []),
  ].filter(Boolean).join("; ");
  return CONTROLLED_AGENCY_REPAIR_REASON.test(text);
}

export function turnRepairBlockedMessage(repair) {
  if (!isHardBlockedTurnRepair(repair)) {
    return "";
  }
  return "LoreKeeper blocked this DM response because it spoke or acted for a controlled party member. Use Try Again so the DM can answer without taking over a player character.";
}

export function turnRepairUseAnywayDialog() {
  return {
    title: "Use This DM Response?",
    message: "LoreKeeper could not fully verify this DM response. Use it only if the visible table text looks right for your campaign.",
    acceptLabel: "Use Anyway",
  };
}

export function buildTurnRepairActionGate({
  repair = null,
  action = "retry",
  activeGeneration = false,
  retryableTurnError = false,
} = {}) {
  if (activeGeneration) {
    return {
      blocked: true,
      reason: "busy",
      activityText: "Wait for the current DM response before using recovery actions.",
      activityState: "waiting",
    };
  }

  if (action === "retry" && !repair?.turn && !retryableTurnError) {
    return {
      blocked: true,
      reason: "no_repair_turn",
      activityText: "No DM response is available to try again",
      activityState: "error",
    };
  }

  if (action === "use_anyway" && !repair?.responseText) {
    return {
      blocked: true,
      reason: "no_reviewed_response",
      activityText: "No reviewed DM response is available",
      activityState: "error",
    };
  }

  if (action === "use_anyway" && isHardBlockedTurnRepair(repair)) {
    return {
      blocked: true,
      reason: "hard_blocked",
      activityText: turnRepairBlockedMessage(repair),
      activityState: "error",
      inspect: true,
    };
  }

  return { blocked: false };
}

export function turnRepairImportOptions(repair) {
  return {
    source: repair?.source || "ollama_repair",
    meta: [repair?.meta, "used after review warning"].filter(Boolean).join("; "),
    autoCommit: false,
    rememberProviderText: true,
    data: {
      providerResult: repair?.providerResult,
      turn: repair?.turn,
      contractWarning: repair?.reason,
      importedDespiteContractFailure: true,
    },
  };
}
