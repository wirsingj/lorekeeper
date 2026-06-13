const mechanicKeywords = "(?:Attack|Counterattack|Damage|Check|Save|Initiative|Roll|Healing)";
const mechanicMarkerPattern = new RegExp(
  `(?:^|[\\s.;\\n]+)((?:[A-Z][A-Za-z'’ -]{0,50}(?:'s)?\\s+)?${mechanicKeywords}):\\s*`,
  "gi",
);

export function splitMechanicsFromBlock(block) {
  const text = String(block ?? "").trim();
  if (!text) {
    return [];
  }

  const matches = mechanicMatches(text);
  if (!matches.length) {
    return [{ type: "text", text }];
  }

  const first = matches[0];
  const before = text.slice(0, first.start).trim();
  const mechanicsText = text.slice(first.start).trim();
  const rows = extractMechanicsRows(mechanicsText);
  if (!rows.length) {
    return [{ type: "text", text }];
  }

  return [
    before ? { type: "text", text: before } : null,
    { type: "mechanics", rows },
  ].filter(Boolean);
}

export function dedupeMechanicsRows(rows = [], seenKeys = new Set()) {
  const rowList = rows.filter((row) => row?.label && row?.detail);
  const hasMathByLabel = new Map();
  for (const row of rowList) {
    const labelKey = mechanicLabelCategory(row.label);
    hasMathByLabel.set(labelKey, Boolean(hasMathByLabel.get(labelKey) || hasRollMath(row.detail)));
  }

  const nextRows = [];
  for (const row of rowList) {
    const labelKey = mechanicLabelCategory(row.label);
    if (hasMathByLabel.get(labelKey) && !hasRollMath(row.detail) && !hasHpMath(row.detail)) {
      continue;
    }

    const key = mechanicDuplicateKey(row);
    if (seenKeys.has(key)) {
      continue;
    }
    seenKeys.add(key);
    nextRows.push(row);
  }
  return nextRows;
}

function extractMechanicsRows(text) {
  const matches = mechanicMatches(text);
  if (!matches.length) {
    return [];
  }

  const rows = [];
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const next = matches[index + 1];
    const detail = cleanMechanicDetail(text.slice(match.end, next?.start ?? text.length));
    if (!detail) {
      continue;
    }
    rows.push({
      label: formatMechanicLabel(match.label),
      detail,
      category: mechanicLabelCategory(match.label),
    });
  }

  return dedupeMechanicsRows(rows);
}

function mechanicMatches(text) {
  const matches = [];
  const regex = new RegExp(mechanicMarkerPattern);
  let match;
  while ((match = regex.exec(text)) !== null) {
    const label = match[1] || "";
    const labelOffset = match[0].lastIndexOf(label);
    const start = match.index + Math.max(0, labelOffset);
    matches.push({
      label,
      start,
      end: regex.lastIndex,
    });
  }
  return matches;
}

function cleanMechanicDetail(value) {
  return String(value ?? "")
    .replace(/^[\s:;.,-]+/, "")
    .replace(/\s+/g, " ")
    .replace(/\s*;\s*/g, "; ")
    .trim();
}

function formatMechanicLabel(label) {
  return String(label ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .replace(/'S\b/g, "'s");
}

function mechanicLabelCategory(label) {
  const lower = String(label ?? "").toLowerCase();
  if (lower.includes("damage") || lower.includes("healing") || lower.includes("hp")) return "damage";
  if (lower.includes("attack") || lower.includes("counterattack")) return "attack";
  if (lower.includes("save")) return "save";
  if (lower.includes("initiative")) return "initiative";
  if (lower.includes("check") || lower.includes("roll")) return "check";
  return lower.replace(/[^a-z0-9]+/g, "-");
}

function mechanicDuplicateKey(row) {
  const detail = String(row.detail ?? "").toLowerCase();
  const formula = detail.match(/\b\d*d\d+\s*(?:[+-]\s*\d+)?\b/i)?.[0]?.replace(/\s+/g, "") ?? "";
  const total = detail.match(/=\s*(-?\d+)/)?.[1] ?? detail.match(/;\s*(-?\d+)\s*$/)?.[1] ?? "";
  const target = detail.match(/\b(?:vs\s+ac\s*\d+|hp\s*:\s*-?\d+\s*[-=]*>\s*-?\d+)\b/i)?.[0]?.replace(/\s+/g, "") ?? "";
  const compact = detail.replace(/[^a-z0-9+-=<>]+/g, "");
  return [row.category || mechanicLabelCategory(row.label), formula, total, target, formula || total || target ? "" : compact].join("|");
}

function hasRollMath(text) {
  return /\b\d*d\d+\b/i.test(text) ||
    /\b\d+\s*[+-]\s*\d+\s*=\s*-?\d+\b/.test(text) ||
    /\b=\s*-?\d+\b/.test(text) ||
    /\bvs\s+AC\s*\d+\b/i.test(text);
}

function hasHpMath(text) {
  return /\bHP\b.*-?\d+\s*[-=]*>\s*-?\d+/i.test(text);
}
