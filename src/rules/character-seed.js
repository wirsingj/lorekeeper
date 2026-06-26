export function buildFiveELiteCharacterSeed(character = {}) {
  const level = clampLevel(character.level || 1);
  const profile = classifyCharacterProfile(`${character.characterClass} ${character.concept}`);
  const abilityScores = standardScoresForProfile(profile);
  const conMod = abilityModifier(abilityScores.CON);
  const dexMod = abilityModifier(abilityScores.DEX);
  const hitDie = hitDieForProfile(profile);
  const maxHp = Math.max(1, hitDie + conMod + Math.max(0, level - 1) * Math.max(1, Math.ceil(hitDie / 2) + conMod));
  const armorClass = Math.max(10, 10 + dexMod + armorBonusForProfile(profile));
  const ancestryClass = [character.ancestry, character.characterClass].filter(Boolean).join(" ") || profile.label;
  const proficiencyBonus = proficiencyBonusForLevel(level);
  const spells = spellsForProfile(profile, character);
  const resources = {
    spellSlots: spellSlotsForProfile(profile, level),
    uses: usesForProfile(profile, level),
  };
  const attacks = attacksForProfile(profile, abilityScores, proficiencyBonus);
  const equipment = equipmentForProfile(profile, character);

  return {
    id: `party-${slugify(character.name)}`,
    name: character.name,
    type: "player_character",
    playerRole: "Player character",
    ancestryClass,
    level,
    experience: 0,
    proficiencyBonus,
    background: character.concept || `${character.name} is a ${ancestryClass} beginning the campaign.`,
    stats: {
      hp: {
        current: maxHp,
        max: maxHp,
      },
      armorClass,
      abilityScores,
      spells,
      spellSlots: resources.spellSlots,
    },
    speedFt: 30,
    resources,
    attacks,
    conditions: [],
    skills: skillsForProfile(profile, character),
    abilities: abilitiesForProfile(profile, character),
    spells,
    inventory: equipment.inventory,
    equipment,
    notes: ["Created from the new campaign wizard with a 5E-lite standard array."],
  };
}

export function classifyCharacterProfile(text = "") {
  const value = String(text ?? "").toLowerCase();
  const profiles = [
    { key: "druid", label: "druid", match: /\b(druid|wild shape|nature|frost|wolf)\b/ },
    { key: "rogue", label: "rogue", match: /\b(rogue|thief|burglar|assassin|heist|lock|sneak)\b/ },
    { key: "ranger", label: "ranger", match: /\b(ranger|scout|archer|bow|tracker|hunter)\b/ },
    { key: "fighter", label: "fighter", match: /\b(fighter|warrior|soldier|guard|knight|sword)\b/ },
    { key: "wizard", label: "wizard", match: /\b(wizard|mage|arcane|spellbook|sorcerer)\b/ },
    { key: "cleric", label: "cleric", match: /\b(cleric|priest|paladin|divine|faith|healer)\b/ },
    { key: "bard", label: "bard", match: /\b(bard|performer|charmer|silver tongue|song)\b/ },
  ];
  return profiles.find((profile) => profile.match.test(value)) ?? { key: "balanced", label: "adventurer" };
}

export function clampLevel(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return 1;
  }
  return Math.min(20, Math.max(1, Math.round(number)));
}

function standardScoresForProfile(profile) {
  const maps = {
    druid: { STR: 8, DEX: 13, CON: 14, INT: 12, WIS: 15, CHA: 10 },
    rogue: { STR: 8, DEX: 15, CON: 13, INT: 12, WIS: 10, CHA: 14 },
    ranger: { STR: 10, DEX: 15, CON: 13, INT: 8, WIS: 14, CHA: 12 },
    fighter: { STR: 15, DEX: 12, CON: 14, INT: 8, WIS: 13, CHA: 10 },
    wizard: { STR: 8, DEX: 14, CON: 13, INT: 15, WIS: 12, CHA: 10 },
    cleric: { STR: 12, DEX: 10, CON: 14, INT: 8, WIS: 15, CHA: 13 },
    bard: { STR: 8, DEX: 14, CON: 13, INT: 10, WIS: 12, CHA: 15 },
    balanced: { STR: 12, DEX: 14, CON: 13, INT: 10, WIS: 15, CHA: 8 },
  };

  return maps[profile.key] ?? maps.balanced;
}

function hitDieForProfile(profile) {
  if (profile.key === "fighter") {
    return 10;
  }
  if (profile.key === "wizard") {
    return 6;
  }
  return 8;
}

function armorBonusForProfile(profile) {
  if (profile.key === "fighter" || profile.key === "cleric") {
    return 3;
  }
  if (profile.key === "ranger" || profile.key === "rogue") {
    return 2;
  }
  return 0;
}

function skillsForProfile(profile, character) {
  const skills = {
    druid: ["Nature", "Survival", "Animal Handling", "Perception"],
    rogue: ["Stealth", "Sleight of Hand", "Deception", "Thieves' Tools"],
    ranger: ["Perception", "Survival", "Stealth", "Athletics"],
    fighter: ["Athletics", "Intimidation", "Perception", "Survival"],
    wizard: ["Arcana", "Investigation", "History", "Insight"],
    cleric: ["Medicine", "Insight", "Religion", "Persuasion"],
    bard: ["Performance", "Persuasion", "Deception", "Insight"],
    balanced: ["Perception", "Survival", "Insight", "Athletics"],
  };
  const extras = /frost/i.test(`${character.characterClass} ${character.concept}`) ? ["Frost magic control"] : [];
  return [...(skills[profile.key] ?? skills.balanced), ...extras];
}

function abilitiesForProfile(profile, character) {
  const abilities = {
    druid: ["Wild Shape", "Druidcraft", "Primal spellcasting"],
    rogue: ["Sneak Attack", "Cunning Action", "Thieves' Tools"],
    ranger: ["Favored terrain instincts", "Archery training", "Tracking"],
    fighter: ["Second Wind", "Weapon training", "Tactical footing"],
    wizard: ["Arcane Recovery", "Ritual casting", "Spellbook"],
    cleric: ["Channel Divinity", "Divine spellcasting", "Healing word"],
    bard: ["Bardic Inspiration", "Jack of All Trades", "Silver tongue"],
    balanced: ["Adventurer's instincts", "Fieldcraft", "Quick thinking"],
  };
  const extras = /wolf/i.test(`${character.characterClass} ${character.concept}`) ? ["Wolf companion bond"] : [];
  return [...(abilities[profile.key] ?? abilities.balanced), ...extras];
}

function spellsForProfile(profile, character) {
  const value = `${character.characterClass} ${character.concept}`;
  if (profile.key === "druid") {
    return /frost/i.test(value)
      ? [
        spell("Frostbite", 0, { castingTime: "action", roll: { save: { ability: "CON" }, damage: "1d6" }, effect: "Cold cantrip that can sap a target's next weapon attack." }),
        spell("Druidcraft", 0, { castingTime: "action", effect: "Small primal omen, sensory, or nature effect." }),
        spell("Entangle", 1, { castingTime: "action", roll: { save: { ability: "STR" }, conditionOnFail: "restrained" }, effect: "Plants restrain creatures in a small area on a failed save." }),
        spell("Goodberry", 1, { castingTime: "action", effect: "Creates simple magical food and minor healing." }),
      ]
      : [
        spell("Druidcraft", 0, { castingTime: "action", effect: "Small primal omen, sensory, or nature effect." }),
        spell("Entangle", 1, { castingTime: "action", roll: { save: { ability: "STR" }, conditionOnFail: "restrained" }, effect: "Plants restrain creatures in a small area on a failed save." }),
        spell("Goodberry", 1, { castingTime: "action", effect: "Creates simple magical food and minor healing." }),
      ];
  }
  if (profile.key === "wizard") {
    return [
      spell("Mage Hand", 0, { castingTime: "action", effect: "Spectral hand manipulates small objects at range." }),
      spell("Detect Magic", 1, { castingTime: "action", effect: "Reveals nearby magical auras with concentration." }),
      spell("Magic Missile", 1, { castingTime: "action", roll: { damage: "3d4+3" }, effect: "Automatic force darts against visible targets." }),
    ];
  }
  if (profile.key === "cleric") {
    return [
      spell("Guidance", 0, { castingTime: "action", effect: "Brief divine help on an ability check." }),
      spell("Bless", 1, { castingTime: "action", effect: "Allies add a small divine bonus to attacks and saves." }),
      spell("Healing Word", 1, { castingTime: "bonus_action", roll: { healing: "1d4+3" }, effect: "Ranged minor healing as a bonus action." }),
    ];
  }
  if (profile.key === "bard") {
    return [
      spell("Vicious Mockery", 0, { castingTime: "action", roll: { save: { ability: "WIS" }, damage: "1d4" }, effect: "Psychic insult that can hinder a target's next attack." }),
      spell("Charm Person", 1, { castingTime: "action", roll: { save: { ability: "WIS" } }, effect: "Social magic that makes one humanoid friendly for a while." }),
      spell("Healing Word", 1, { castingTime: "bonus_action", roll: { healing: "1d4+3" }, effect: "Ranged minor healing as a bonus action." }),
    ];
  }
  return [];
}

function spell(name, level, details = {}) {
  return {
    name,
    level,
    castingTime: details.castingTime || "action",
    roll: details.roll ?? null,
    effect: details.effect || "",
  };
}

function spellSlotsForProfile(profile, level) {
  const fullCaster = {
    1: { 1: { max: 2, used: 0 } },
    2: { 1: { max: 3, used: 0 } },
    3: { 1: { max: 4, used: 0 }, 2: { max: 2, used: 0 } },
    4: { 1: { max: 4, used: 0 }, 2: { max: 3, used: 0 } },
    5: { 1: { max: 4, used: 0 }, 2: { max: 3, used: 0 }, 3: { max: 2, used: 0 } },
  };
  const halfCaster = {
    2: { 1: { max: 2, used: 0 } },
    3: { 1: { max: 3, used: 0 } },
    4: { 1: { max: 3, used: 0 } },
    5: { 1: { max: 4, used: 0 }, 2: { max: 2, used: 0 } },
  };
  const table = ["druid", "wizard", "cleric", "bard"].includes(profile.key)
    ? fullCaster
    : profile.key === "ranger"
      ? halfCaster
      : null;
  if (!table) {
    return {};
  }
  const eligibleLevels = Object.keys(table).map(Number).filter((entry) => entry <= level);
  const eligibleLevel = Math.max(...eligibleLevels);
  return structuredClone(table[eligibleLevel] ?? {});
}

function usesForProfile(profile, level) {
  const uses = {};
  if (profile.key === "druid" && level >= 2) {
    uses.wildShape = { max: 2, used: 0 };
  }
  if (profile.key === "fighter") {
    uses.secondWind = { max: 1, used: 0 };
  }
  if (profile.key === "cleric" && level >= 2) {
    uses.channelDivinity = { max: 1, used: 0 };
  }
  if (profile.key === "bard") {
    uses.bardicInspiration = { max: Math.max(1, abilityModifier(15)), used: 0 };
  }
  return uses;
}

function attacksForProfile(profile, abilityScores, proficiencyBonus) {
  const dexAttack = abilityModifier(abilityScores.DEX) + proficiencyBonus;
  const strAttack = abilityModifier(abilityScores.STR) + proficiencyBonus;
  const wisAttack = abilityModifier(abilityScores.WIS) + proficiencyBonus;
  const intAttack = abilityModifier(abilityScores.INT) + proficiencyBonus;
  const chaAttack = abilityModifier(abilityScores.CHA) + proficiencyBonus;
  const damage = (dice, mod) => `${dice}${mod ? formatModifier(mod) : ""}`;

  const attacks = {
    druid: [
      { name: "Quarterstaff", attackBonus: strAttack, damage: damage("1d6", abilityModifier(abilityScores.STR)), range: "5 ft", requirements: ["equipped weapon"] },
      { name: "Primal cantrip", attackBonus: wisAttack, damage: "cantrip effect", range: "spell range", requirements: ["known cantrip"] },
    ],
    rogue: [
      { name: "Shortsword", attackBonus: dexAttack, damage: damage("1d6", abilityModifier(abilityScores.DEX)), range: "5 ft", requirements: ["finesse weapon"] },
      { name: "Shortbow", attackBonus: dexAttack, damage: damage("1d6", abilityModifier(abilityScores.DEX)), range: "80/320 ft", requirements: ["line of sight", "ammunition"] },
    ],
    ranger: [
      { name: "Longbow", attackBonus: dexAttack, damage: damage("1d8", abilityModifier(abilityScores.DEX)), range: "150/600 ft", requirements: ["line of sight", "ammunition"] },
      { name: "Shortsword", attackBonus: dexAttack, damage: damage("1d6", abilityModifier(abilityScores.DEX)), range: "5 ft", requirements: ["equipped weapon"] },
    ],
    fighter: [
      { name: "Longsword", attackBonus: strAttack, damage: damage("1d8", abilityModifier(abilityScores.STR)), range: "5 ft", requirements: ["equipped weapon"] },
      { name: "Javelin", attackBonus: strAttack, damage: damage("1d6", abilityModifier(abilityScores.STR)), range: "30/120 ft", requirements: ["line of sight"] },
    ],
    wizard: [
      { name: "Dagger", attackBonus: dexAttack, damage: damage("1d4", abilityModifier(abilityScores.DEX)), range: "20/60 ft", requirements: ["equipped weapon"] },
      { name: "Arcane cantrip", attackBonus: intAttack, damage: "cantrip effect", range: "spell range", requirements: ["known cantrip"] },
    ],
    cleric: [
      { name: "Mace", attackBonus: strAttack, damage: damage("1d6", abilityModifier(abilityScores.STR)), range: "5 ft", requirements: ["equipped weapon"] },
      { name: "Divine cantrip", attackBonus: wisAttack, damage: "cantrip effect", range: "spell range", requirements: ["known cantrip"] },
    ],
    bard: [
      { name: "Rapier", attackBonus: dexAttack, damage: damage("1d8", abilityModifier(abilityScores.DEX)), range: "5 ft", requirements: ["finesse weapon"] },
      { name: "Bardic cantrip", attackBonus: chaAttack, damage: "cantrip effect", range: "spell range", requirements: ["known cantrip"] },
    ],
    balanced: [
      { name: "Simple weapon", attackBonus: dexAttack, damage: damage("1d6", abilityModifier(abilityScores.DEX)), range: "weapon range", requirements: ["equipped weapon"] },
    ],
  };

  return attacks[profile.key] ?? attacks.balanced;
}

function equipmentForProfile(profile, character = {}) {
  const ancestryClass = `${character.ancestry || ""} ${character.characterClass || ""} ${character.concept || ""}`;
  const common = ["Bedroll", "Rations", "Waterskin", "Tinderbox"];
  const kits = {
    druid: {
      armor: "Leather armor",
      weapons: ["Quarterstaff", "Sling"],
      tools: ["Herbalism kit"],
      inventory: ["Druidic focus", "Herbalism kit", ...common],
    },
    rogue: {
      armor: "Leather armor",
      weapons: ["Shortsword", "Shortbow", "Dagger"],
      tools: ["Thieves' tools", "Disguise kit"],
      inventory: ["Thieves' tools", "Disguise kit", "50 ft rope", ...common],
    },
    ranger: {
      armor: "Leather armor",
      weapons: ["Longbow", "Shortsword", "Dagger"],
      tools: ["Hunting trap"],
      inventory: ["Quiver of arrows", "Hunting trap", "50 ft rope", ...common],
    },
    fighter: {
      armor: /dwarf|soldier|guard|knight/i.test(ancestryClass) ? "Chain mail" : "Scale mail",
      weapons: ["Longsword", "Javelin", "Shield"],
      tools: ["Gaming set or soldier's kit"],
      inventory: ["Shield", "Javelins", "Whetstone", ...common],
    },
    wizard: {
      armor: "No armor",
      weapons: ["Dagger", "Quarterstaff"],
      tools: ["Spellbook", "Arcane focus"],
      inventory: ["Spellbook", "Arcane focus", "Ink and quill", ...common],
    },
    cleric: {
      armor: "Scale mail",
      weapons: ["Mace", "Light crossbow", "Shield"],
      tools: ["Holy symbol", "Healer's kit"],
      inventory: ["Holy symbol", "Healer's kit", "Shield", ...common],
    },
    bard: {
      armor: "Leather armor",
      weapons: ["Rapier", "Dagger", "Light crossbow"],
      tools: ["Musical instrument"],
      inventory: ["Musical instrument", "Diplomat's pack", ...common],
    },
    balanced: {
      armor: "Traveling leathers",
      weapons: ["Simple weapon", "Dagger"],
      tools: ["Adventuring kit"],
      inventory: ["Adventuring kit", ...common],
    },
  };
  return kits[profile.key] ?? kits.balanced;
}

function formatModifier(value) {
  const number = Number(value) || 0;
  return number >= 0 ? `+${number}` : `${number}`;
}

function proficiencyBonusForLevel(level) {
  return 2 + Math.floor((Math.max(1, level) - 1) / 4);
}

function abilityModifier(score) {
  return Math.floor((Number(score) - 10) / 2);
}

function slugify(value) {
  return String(value || "item")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "item";
}
