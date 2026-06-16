const TECHNICAL_REPAIR_REASON = /(?:json|schema|contract|parse|validation|sceneStatus|choices\.|flags\.|mechanics\.|proposedChanges|provider result)/i;

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
  return `DM response needs review - ${tableRepairReason(repair?.reason)}. Try Again, Details, or Use Anyway.`;
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
