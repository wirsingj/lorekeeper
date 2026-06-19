export function choiceLabelForIndex(index) {
  return String.fromCharCode(65 + index);
}

export function choiceOptionId(block, index) {
  return String(block?.options?.[index]?.id || choiceLabelForIndex(index));
}

export function choicePanelKey(block = {}) {
  return compactCompareText([
    block.prompt || "",
    block.scope || "",
    block.forActorId || "",
    (block.options ?? []).map((option, index) =>
      `${choiceOptionId(block, index)}:${option?.text || block.items?.[index] || ""}`
    ).join("|"),
  ].join("::")).slice(0, 500);
}

function compactCompareText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
