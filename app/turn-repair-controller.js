const TECHNICAL_REPAIR_REASON = /(?:json|schema|contract|parse|validation|sceneStatus|choices\.|flags\.|mechanics\.|proposedChanges|provider result)/i;
const CONTROLLED_AGENCY_REPAIR_REASON = /(?:speaks? as controlled party member|uses DM role for controlled party member|appears to speak, decide, or act for controlled party member|without submitted controller input)/i;

export function compactUiText(value, limit = 160) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length <= limit ? text : `${text.slice(0, Math.max(0, limit - 1)).trimEnd()}...`;
}

export function tableRepairReason(value) {
  const text = compactUiText(value, 140);
  if (!text || TECHNICAL_REPAIR_REASON.test(text)) {
    return "the DM response did not pass LoreKeeper's table checks";
  }
  return text;
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
