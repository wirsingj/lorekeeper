export function compactSceneSituation(text = "") {
  const cleaned = String(text)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line && !isChoiceLikeLine(line) && !/^what (?:does|do|would|will|should|can)\b/i.test(line))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) {
    return "";
  }
  return cleaned.length > 520 ? `${cleaned.slice(0, 519).trimEnd()}...` : cleaned;
}

export function isChoiceLikeLine(line) {
  return /^\s*(?:[-*]\s*)?(?:[A-Ha-h]|\d{1,2})\s*[\).:-]\s+/.test(String(line ?? ""));
}
