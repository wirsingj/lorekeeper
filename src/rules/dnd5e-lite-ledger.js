const ABILITY_LABELS = ["STR", "DEX", "CON", "INT", "WIS", "CHA"];

const SKILL_ABILITIES = {
  athletics: "STR",
  acrobatics: "DEX",
  stealth: "DEX",
  "sleight of hand": "DEX",
  arcana: "INT",
  history: "INT",
  investigation: "INT",
  nature: "INT",
  religion: "INT",
  "animal handling": "WIS",
  insight: "WIS",
  medicine: "WIS",
  perception: "WIS",
  survival: "WIS",
  deception: "CHA",
  intimidation: "CHA",
  performance: "CHA",
  persuasion: "CHA",
};

const CLASS_SPELL_SLOTS = {
  full: {
    1: { 1: 2 },
    2: { 1: 3 },
    3: { 1: 4, 2: 2 },
    4: { 1: 4, 2: 3 },
    5: { 1: 4, 2: 3, 3: 2 },
  },
  half: {
    2: { 1: 2 },
    3: { 1: 3 },
    4: { 1: 3 },
    5: { 1: 4, 2: 2 },
  },
  third: {
    3: { 1: 2 },
    4: { 1: 3 },
    5: { 1: 3 },
  },
};

export function buildRulesLedger(campaign, options = {}) {
  const activeActorIds = activePartyIds(campaign, options);
  const actors = activeActorIds
    .map((id) => campaign.party?.find((member) => member.id === id))
    .filter(Boolean)
    .map((member) => buildActorLedger(campaign, member, options));

  return {
    system: "dnd-5e-lite",
    source: "campaign_sqlite_snapshot",
    mode: campaign.combat?.inCombat || options.mode === "combat" ? "combat" : "scene",
    round: campaign.combat?.round ?? null,
    activeActorIds,
    actors,
    rules: [
      "Legal options are derived from the stored character sheet, resources, scene, and combat state.",
      "The model may narrate and choose for non-player companions, but must not spend unavailable resources.",
      "The primary player character gets options and awaits player choice.",
      "Improvised actions are allowed, but mark them as improvised and request validation/rolls.",
    ],
  };
}

export function buildActorLedger(campaign, member, options = {}) {
  const sheet = normalizeCharacterSheet(member);
  const turnEconomy = normalizeTurnEconomy(campaign, member, sheet);
  const legalOptions = buildLegalOptions(member, sheet, turnEconomy, options);

  return {
    id: member.id,
    name: member.name,
    agency: isPrimaryPlayerCharacter(member) ? "primary_player_character" : "dm_controlled_companion",
    sheet,
    turnEconomy,
    legalOptions,
  };
}

export function normalizeCharacterSheet(member = {}) {
  const level = Number(member.level ?? member.stats?.level ?? member.characterLevel ?? 1) || 1;
  const ancestryClass = member.ancestryClass || member.role || member.class || "";
  const abilityScores = normalizeAbilityScores(member.stats?.abilityScores ?? member.abilityScores ?? member.stats?.abilities);
  const proficiencyBonus = Number(member.proficiencyBonus ?? member.stats?.proficiencyBonus ?? proficiencyBonusForLevel(level));
  const skills = normalizeList(member.skills ?? member.proficiencies ?? member.specialties ?? member.stats?.skills);
  const abilities = normalizeList(member.abilities ?? member.features ?? member.traits);
  const spells = normalizeSpellList(member.spells ?? member.stats?.spells);
  const spellSlots = normalizeSpellSlots(member.resources?.spellSlots ?? member.stats?.spellSlots, ancestryClass, level);
  const hp = normalizeHp(member.stats?.hp ?? member.hp ?? member.hitPoints);

  return {
    level,
    ancestryClass,
    hp,
    armorClass: numberOrNull(member.stats?.armorClass ?? member.armorClass ?? member.ac),
    speedFt: Number(member.speedFt ?? member.speed ?? member.stats?.speedFt ?? member.stats?.speed ?? 30) || 30,
    proficiencyBonus,
    abilityScores,
    skills: skills.map((skill) => ({
      name: recordName(skill),
      ability: SKILL_ABILITIES[recordName(skill).toLowerCase()] ?? null,
      bonus: skillBonus(skill, abilityScores, proficiencyBonus),
    })),
    abilities,
    attacks: normalizeAttacks(member.attacks ?? member.weapons ?? member.equipment?.weapons, abilityScores, proficiencyBonus, ancestryClass),
    spells,
    resources: {
      spellSlots,
      uses: normalizeResourceUses(member.resources?.uses ?? member.stats?.uses ?? member.uses),
    },
    conditions: normalizeList(member.conditions ?? member.stats?.conditions),
    inventory: normalizeList(member.inventory ?? member.equipment ?? member.items),
    assumptions: sheetAssumptions(member, spellSlots),
  };
}

function buildLegalOptions(member, sheet, turnEconomy, options = {}) {
  const choices = [];
  if (turnEconomy.action === "available") {
    choices.push(...attackOptions(sheet));
    choices.push(...spellOptions(sheet, { requireAction: true }));
    choices.push(...featureOptions(sheet, "action"));
    choices.push(...commonActionOptions(sheet));
  }

  if (turnEconomy.bonusAction === "available") {
    choices.push(...spellOptions(sheet, { bonusAction: true }));
    choices.push(...featureOptions(sheet, "bonus_action"));
  }

  if (turnEconomy.movementRemainingFt > 0) {
    choices.push({
      id: "move",
      label: `Move up to ${turnEconomy.movementRemainingFt} ft`,
      type: "movement",
      cost: { movementFt: Math.min(sheet.speedFt, turnEconomy.movementRemainingFt) },
      requirements: ["movement remaining"],
      roll: null,
      effect: "Reposition within the scene if terrain allows.",
      source: "movement",
      legal: true,
    });
  }

  choices.push({
    id: "improvise",
    label: "Try an improvised action",
    type: "improvised",
    cost: { action: turnEconomy.action === "available" ? 1 : 0 },
    requirements: ["DM validation", "appropriate roll if uncertain"],
    roll: { type: "ability_check", ability: "varies", bonus: null },
    effect: "Attempt something not listed; app/DM validates cost, roll, and consequence.",
    source: "rules",
    legal: true,
  });

  return uniqueById(choices).slice(0, options.maxLegalOptions ?? 14).map((choice, index) => ({
    ...choice,
    letter: choice.letter ?? letterForIndex(index),
  }));
}

function attackOptions(sheet) {
  const attacks = sheet.attacks.length ? sheet.attacks : [defaultAttack(sheet)];
  return attacks.filter(Boolean).map((attack, index) => {
    const name = recordName(attack.name || attack.title || attack) || `attack-${index + 1}`;
    const damage = compactRecordText(attack.damage) || "";
    const range = compactRecordText(attack.range) || "";
    return {
      id: `attack-${slugify(name)}`,
      label: `Attack with ${name}`,
      type: "attack",
      cost: { action: 1 },
      requirements: attack.requirements ?? ["target in range", "weapon/effect available"],
      roll: { type: "attack", bonus: attack.attackBonus, damage, range },
      effect: compactRecordText(attack.effect) || `${damage || "weapon"} damage on hit.`,
      source: "sheet.attacks",
      legal: true,
    };
  });
}

function spellOptions(sheet, { requireAction = false, bonusAction = false } = {}) {
  return sheet.spells
    .filter((spell) => {
      if (bonusAction && spell.castingTime !== "bonus_action") return false;
      if (requireAction && spell.castingTime === "bonus_action") return false;
      if (spell.level === 0) return true;
      return availableSpellSlot(sheet.resources.spellSlots, spell.level);
    })
    .map((spell) => ({
      id: `spell-${slugify(spell.name)}`,
      label: `Cast ${spell.name}`,
      type: "spell",
      cost: {
        action: spell.castingTime === "bonus_action" ? 0 : 1,
        bonusAction: spell.castingTime === "bonus_action" ? 1 : 0,
        spellSlot: spell.level > 0 ? String(spell.level) : null,
      },
      requirements: spell.level > 0
        ? ["spell known/prepared", `${ordinal(spell.level)}-level slot available`, "target/components valid"]
        : ["cantrip known", "target/components valid"],
      roll: spell.roll,
      effect: spell.effect || "Resolve spell effect using sheet and scene rules.",
      source: "sheet.spells",
      legal: true,
    }));
}

function featureOptions(sheet, actionKind) {
  return sheet.abilities
    .map((ability) => featureToOption(ability, sheet, actionKind))
    .filter(Boolean);
}

function featureToOption(ability, sheet, actionKind) {
  const label = recordName(ability);
  const lower = label.toLowerCase();
  if (actionKind === "bonus_action" && /second wind/i.test(label)) {
    return featureOption("second-wind", label, "bonus_action", "Regain 1d10 + fighter level HP.", sheet.resources.uses.secondWind);
  }
  if (actionKind === "action" && /wild shape/i.test(label)) {
    return featureOption("wild-shape", label, "action", "Transform into an available beast form.", sheet.resources.uses.wildShape);
  }
  if (actionKind === "action" && /channel divinity/i.test(label)) {
    return featureOption("channel-divinity", label, "action", "Use a divine class feature.", sheet.resources.uses.channelDivinity);
  }
  if (actionKind === "bonus_action" && /cunning action/i.test(label)) {
    return featureOption("cunning-action", label, "bonus_action", "Dash, Disengage, or Hide as a bonus action.", null);
  }
  if (actionKind === "action" && /\bhelp|analysis|study|stabil/i.test(lower)) {
    return featureOption(slugify(label), label, "action", "Use this feature to aid, analyze, or stabilize the scene.", null);
  }
  return null;
}

function featureOption(id, label, actionKind, effect, uses) {
  const available = !uses || uses.used < uses.max;
  return {
    id: `feature-${id}`,
    label,
    type: "feature",
    cost: { action: actionKind === "action" ? 1 : 0, bonusAction: actionKind === "bonus_action" ? 1 : 0 },
    requirements: uses ? [`uses remaining ${Math.max(0, uses.max - uses.used)}/${uses.max}`] : ["feature available"],
    roll: null,
    effect,
    source: "sheet.abilities",
    legal: available,
  };
}

function commonActionOptions(sheet) {
  return [
    {
      id: "dodge",
      label: "Dodge",
      type: "defense",
      cost: { action: 1 },
      requirements: ["can take an action"],
      roll: null,
      effect: "Attackers have disadvantage against this actor until their next turn if visible.",
      source: "dnd5e.common_actions",
      legal: true,
    },
    {
      id: "help",
      label: "Help an ally",
      type: "support",
      cost: { action: 1 },
      requirements: ["ally can benefit", "position/range makes sense"],
      roll: null,
      effect: "Grant advantage or narrative aid to an ally's next relevant check/action.",
      source: "dnd5e.common_actions",
      legal: true,
    },
    {
      id: "dash",
      label: "Dash",
      type: "movement",
      cost: { action: 1 },
      requirements: ["can take an action"],
      roll: null,
      effect: `Gain extra movement up to ${sheet.speedFt} ft this turn.`,
      source: "dnd5e.common_actions",
      legal: true,
    },
    {
      id: "disengage",
      label: "Disengage",
      type: "movement",
      cost: { action: 1 },
      requirements: ["can take an action"],
      roll: null,
      effect: "Movement does not provoke opportunity attacks this turn.",
      source: "dnd5e.common_actions",
      legal: true,
    },
    {
      id: "hide",
      label: "Hide",
      type: "skill",
      cost: { action: 1 },
      requirements: ["can take an action", "cover, concealment, or distraction makes hiding plausible"],
      roll: { type: "ability_check", ability: "DEX", skill: "stealth" },
      effect: "Attempt to become hidden until discovered or revealed.",
      source: "dnd5e.common_actions",
      legal: true,
    },
    {
      id: "ready",
      label: "Ready an action",
      type: "feature",
      cost: { action: 1 },
      requirements: ["can take an action", "clear trigger and intended response"],
      roll: null,
      effect: "Prepare a specific response to a visible trigger before your next turn.",
      source: "dnd5e.common_actions",
      legal: true,
    },
  ];
}

function activePartyIds(campaign, options) {
  if (options.actorId) {
    return [options.actorId];
  }
  if (campaign.combat?.inCombat && campaign.combat.currentTurnId) {
    const currentPartyActor = (campaign.party ?? []).find((member) => member.id === campaign.combat.currentTurnId);
    return currentPartyActor ? [currentPartyActor.id] : [];
  }
  const present = campaign.scene?.presentPartyMemberIds ?? [];
  if (present.length) {
    return present;
  }
  return (campaign.party ?? []).map((member) => member.id);
}

function normalizeTurnEconomy(campaign, member, sheet) {
  const stored = campaign.combat?.turnEconomy?.[member.id] ?? member.turnEconomy ?? {};
  return {
    action: stored.action ?? "available",
    bonusAction: stored.bonusAction ?? "available",
    reaction: stored.reaction ?? "available",
    movementRemainingFt: Number(stored.movementRemainingFt ?? stored.movement ?? sheet.speedFt) || 0,
    freeObjectInteraction: stored.freeObjectInteraction ?? "available",
  };
}

function normalizeHp(value) {
  if (!value) return { current: null, max: null, temporary: 0 };
  if (typeof value === "number") return { current: value, max: value, temporary: 0 };
  if (typeof value === "string") {
    const match = value.match(/(\d+)\s*\/\s*(\d+)/);
    if (match) return { current: Number(match[1]), max: Number(match[2]), temporary: 0 };
    const numeric = Number(value);
    return { current: Number.isFinite(numeric) ? numeric : null, max: Number.isFinite(numeric) ? numeric : null, temporary: 0 };
  }
  return {
    current: numberOrNull(value.current ?? value.value),
    max: numberOrNull(value.max ?? value.maximum),
    temporary: Number(value.temporary ?? value.temp ?? 0) || 0,
  };
}

function normalizeAbilityScores(value = {}) {
  const scores = {};
  for (const label of ABILITY_LABELS) {
    const aliases = [label, label.toLowerCase(), abilityName(label)];
    const score = aliases.map((alias) => value?.[alias]).find((entry) => entry !== undefined && entry !== null);
    scores[label] = Number(score) || 10;
  }
  return scores;
}

function normalizeSpellSlots(value, ancestryClass, level) {
  const derived = deriveSpellSlots(ancestryClass, level);
  const source = value && typeof value === "object" ? value : {};
  const slots = {};
  for (const spellLevel of new Set([...Object.keys(derived), ...Object.keys(source)])) {
    const entry = source[spellLevel] ?? {};
    const max = Number(entry.max ?? entry.total ?? entry.available ?? derived[spellLevel] ?? 0) || 0;
    const used = Number(entry.used ?? entry.spent ?? 0) || 0;
    slots[spellLevel] = { max, used, available: Math.max(0, max - used) };
  }
  return slots;
}

function deriveSpellSlots(ancestryClass, level) {
  const lower = String(ancestryClass).toLowerCase();
  const tier = lower.match(/\b(wizard|cleric|druid|bard|sorcerer)\b/) ? "full"
    : lower.match(/\b(ranger|paladin)\b/) ? "half"
      : lower.match(/\b(eldritch knight|arcane trickster)\b/) ? "third"
        : null;
  if (!tier) return {};
  const table = CLASS_SPELL_SLOTS[tier];
  const eligibleLevel = Math.max(...Object.keys(table).map(Number).filter((item) => item <= level));
  return table[eligibleLevel] ?? {};
}

function normalizeSpellList(value) {
  const list = normalizeList(value);
  return list.map((spell) => {
    if (typeof spell === "object") {
      return {
        name: String(spell.name || spell.title || "Unnamed spell"),
        level: Number(spell.level ?? spell.spellLevel ?? inferSpellLevel(spell.name)) || 0,
        castingTime: normalizeCastingTime(spell.castingTime),
        roll: spell.roll ?? inferSpellRoll(spell.name),
        effect: spell.effect || spell.summary || "",
      };
    }
    return {
      name: spell,
      level: inferSpellLevel(spell),
      castingTime: normalizeCastingTime(spell),
      roll: inferSpellRoll(spell),
      effect: "",
    };
  });
}

function normalizeResourceUses(value = {}) {
  const uses = {};
  for (const [key, entry] of Object.entries(value || {})) {
    if (entry && typeof entry === "object") {
      uses[key] = {
        max: Number(entry.max ?? entry.total ?? 0) || 0,
        used: Number(entry.used ?? entry.spent ?? 0) || 0,
      };
    }
  }
  return uses;
}

function normalizeAttacks(value, abilityScores, proficiencyBonus, ancestryClass) {
  const attacks = normalizeList(value).map((attack) => {
    if (typeof attack === "object") {
      return {
        name: recordName(attack.name || attack.title || attack) || "weapon",
        attackBonus: numberOrNull(attack.attackBonus ?? attack.bonus),
        damage: compactRecordText(attack.damage),
        range: compactRecordText(attack.range),
        effect: compactRecordText(attack.effect),
        requirements: normalizeList(attack.requirements),
      };
    }
    return {
      name: attack,
      attackBonus: null,
      damage: "",
      range: "",
      effect: "",
      requirements: [],
    };
  });
  if (attacks.length) return attacks;
  const ability = /\b(rogue|ranger|druid|wizard|bard)\b/i.test(ancestryClass) ? "DEX" : "STR";
  return [{
    name: "equipped weapon",
    attackBonus: abilityModifier(abilityScores[ability]) + proficiencyBonus,
    damage: `${ability === "DEX" ? "1d6" : "1d8"}+${abilityModifier(abilityScores[ability])}`,
    range: "melee or listed weapon range",
    requirements: ["equipped weapon"],
  }];
}

function defaultAttack(sheet) {
  const ability = sheet.abilityScores.DEX >= sheet.abilityScores.STR ? "DEX" : "STR";
  return {
    name: "equipped weapon",
    attackBonus: abilityModifier(sheet.abilityScores[ability]) + sheet.proficiencyBonus,
    damage: "weapon damage + ability modifier",
    range: "weapon range",
  };
}

function sheetAssumptions(member, spellSlots) {
  const assumptions = [];
  if (!member.speedFt && !member.speed && !member.stats?.speedFt) assumptions.push("speed defaults to 30 ft");
  if (!member.attacks?.length && !member.weapons?.length) assumptions.push("default equipped weapon attack inferred");
  if (Object.keys(spellSlots).length && !member.resources?.spellSlots && !member.stats?.spellSlots) {
    assumptions.push("spell slots inferred from class/level");
  }
  return assumptions;
}

function normalizeList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === "object") {
    return Object.entries(value).map(([key, entry]) => (typeof entry === "object" ? { name: key, ...entry } : `${key}: ${entry}`));
  }
  return String(value).split(/[,;\n]+/).map((item) => item.trim()).filter(Boolean);
}

function skillBonus(skill, abilityScores, proficiencyBonus) {
  const ability = SKILL_ABILITIES[recordName(skill).toLowerCase()];
  if (!ability) return null;
  return abilityModifier(abilityScores[ability]) + proficiencyBonus;
}

function availableSpellSlot(slots, level) {
  const entry = slots?.[String(level)] ?? slots?.[level];
  return Boolean(entry && entry.available > 0);
}

function inferSpellLevel(spell) {
  const name = String(spell ?? "").toLowerCase();
  if (/\b(cantrip|druidcraft|frostbite|guidance|mage hand|vicious mockery)\b/.test(name)) return 0;
  if (/\b(magic missile|shield of faith|bless|healing word|goodberry|entangle|cure wounds)\b/.test(name)) return 1;
  return 0;
}

function inferSpellRoll(spell) {
  const name = String(spell ?? "").toLowerCase();
  if (/\bguiding bolt|fire bolt|frostbite|attack\b/.test(name)) return { type: "spell_attack_or_save", bonus: null };
  if (/\bmagic missile\b/.test(name)) return { type: "automatic_hit", damage: "3 x (1d4+1)" };
  return null;
}

function normalizeCastingTime(spellOrTime) {
  const text = String(spellOrTime ?? "").toLowerCase();
  if (/\b(healing word|misty step|bonus)\b/.test(text)) return "bonus_action";
  return "action";
}

function isPrimaryPlayerCharacter(member) {
  return /player/i.test([member.playerRole, member.role, member.type].filter(Boolean).join(" "));
}

function proficiencyBonusForLevel(level) {
  return 2 + Math.floor((Math.max(1, level) - 1) / 4);
}

function abilityModifier(score) {
  return Math.floor((Number(score || 10) - 10) / 2);
}

function abilityName(label) {
  return {
    STR: "strength",
    DEX: "dexterity",
    CON: "constitution",
    INT: "intelligence",
    WIS: "wisdom",
    CHA: "charisma",
  }[label];
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function recordName(value) {
  if (value && typeof value === "object") {
    return String(value.name || value.title || value.id || "");
  }
  return String(value ?? "");
}

function compactRecordText(value) {
  if (!value) {
    return "";
  }
  if (typeof value === "object") {
    const named = recordName(value);
    if (named) {
      return named;
    }
    return Object.entries(value)
      .map(([key, entry]) => `${key}: ${recordName(entry) || String(entry ?? "")}`)
      .join(", ");
  }
  return String(value);
}

function uniqueById(records) {
  const seen = new Set();
  return records.filter((record) => {
    if (seen.has(record.id)) return false;
    seen.add(record.id);
    return record.legal !== false;
  });
}

function letterForIndex(index) {
  return String.fromCharCode(65 + index);
}

function ordinal(value) {
  return `${value}${value === 1 ? "st" : value === 2 ? "nd" : value === 3 ? "rd" : "th"}`;
}

function slugify(value) {
  return String(value)
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "option";
}
