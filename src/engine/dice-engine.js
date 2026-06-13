export function createDiceEngine(options = {}) {
  return {
    rollFormula: (formula, rollOptions = {}) => rollFormula(formula, { ...options, ...rollOptions }),
    rollD20: (rollOptions = {}) => rollD20({ ...options, ...rollOptions }),
  };
}

export function rollD20(options = {}) {
  const modifier = Number(options.modifier ?? 0) || 0;
  const sign = modifier >= 0 ? "+" : "";
  return rollFormula(`1d20${modifier ? `${sign}${modifier}` : ""}`, {
    ...options,
    label: options.label ?? "d20",
  });
}

export function rollFormula(formula, options = {}) {
  const parsed = parseRollFormula(formula);
  const rng = createSeededRng(options.seed ?? `${formula}:${options.label ?? ""}`);
  const hasAdvantage = Boolean(options.advantage && !options.disadvantage && parsed.count === 1 && parsed.sides === 20);
  const hasDisadvantage = Boolean(options.disadvantage && !options.advantage && parsed.count === 1 && parsed.sides === 20);
  const rollCount = hasAdvantage || hasDisadvantage ? 2 : parsed.count;
  const rolls = Array.from({ length: rollCount }, () => Math.floor(rng() * parsed.sides) + 1);
  const kept = hasAdvantage ? [Math.max(...rolls)] : hasDisadvantage ? [Math.min(...rolls)] : rolls.slice();
  const dropped = hasAdvantage || hasDisadvantage ? rolls.filter((value, index) => index !== rolls.indexOf(kept[0])) : [];
  const total = kept.reduce((sum, value) => sum + value, 0) + parsed.modifier;
  const normalizedFormula = formatFormula(parsed);

  return {
    id: stableRollId(normalizedFormula, options),
    formula: normalizedFormula,
    label: options.label ?? null,
    actorId: options.actorId ?? null,
    targetId: options.targetId ?? null,
    rolls,
    kept,
    dropped,
    modifier: parsed.modifier,
    total,
    advantage: hasAdvantage,
    disadvantage: hasDisadvantage,
    createdAt: options.now ?? new Date().toISOString(),
    breakdown: formatBreakdown({ rolls, kept, dropped, modifier: parsed.modifier, total, advantage: hasAdvantage, disadvantage: hasDisadvantage }),
  };
}

export function parseRollFormula(formula) {
  const source = String(formula || "").replace(/\s+/g, "");
  const match = source.match(/^(\d*)d(\d+)((?:[+-]\d+)*)$/i);
  if (!match) {
    throw new Error(`Unsupported roll formula: ${formula}`);
  }
  const count = Number(match[1] || 1);
  const sides = Number(match[2]);
  const modifier = (match[3] || "")
    .match(/[+-]\d+/g)
    ?.reduce((sum, value) => sum + Number(value), 0) ?? 0;
  if (!Number.isInteger(count) || count < 1 || count > 100 || !Number.isInteger(sides) || sides < 2 || sides > 1000) {
    throw new Error(`Invalid roll formula bounds: ${formula}`);
  }
  return { count, sides, modifier };
}

export function extractFirstRollFormula(text, fallback = "1d4") {
  const match = String(text || "").match(/\b\d*d\d+(?:\s*[+-]\s*\d+)?\b/i);
  return match ? match[0].replace(/\s+/g, "") : fallback;
}

function formatFormula({ count, sides, modifier }) {
  const sign = modifier > 0 ? `+${modifier}` : modifier < 0 ? String(modifier) : "";
  return `${count}d${sides}${sign}`;
}

function formatBreakdown({ rolls, kept, dropped, modifier, total, advantage, disadvantage }) {
  const mode = advantage ? " with advantage" : disadvantage ? " with disadvantage" : "";
  const modifierText = modifier ? ` ${modifier >= 0 ? "+" : "-"} ${Math.abs(modifier)}` : "";
  const droppedText = dropped.length ? `; dropped ${dropped.join(", ")}` : "";
  return `Rolled ${rolls.join(", ")}${mode}; kept ${kept.join(", ")}${modifierText}${droppedText} = ${total}`;
}

function stableRollId(formula, options) {
  const hash = hashString(`${formula}:${options.seed ?? ""}:${options.label ?? ""}:${options.actorId ?? ""}:${options.targetId ?? ""}:${options.now ?? ""}`);
  return `roll-${hash.toString(36)}`;
}

function createSeededRng(seed) {
  let state = hashString(String(seed));
  return function rng() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
