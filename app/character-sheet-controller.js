export function buildCharacterSheetProjection(member = {}) {
  const hp = normalizeHpForForm(member.stats?.hp ?? member.hp ?? member.hitPoints);
  const scores = characterAbilityScores(member);
  return {
    title: member.name || "Unnamed party member",
    subtitle: [
      member.ancestryClass,
      member.playerRole,
      member.role,
      member.type,
    ].filter(Boolean).join(" / ") || "Party member",
    fields: {
      name: member.name || "",
      ancestryClass: member.ancestryClass || member.class || "",
      role: member.playerRole || member.role || "",
      level: member.level ?? member.stats?.level ?? member.characterLevel ?? "",
      xp: member.experience ?? member.xp ?? member.stats?.experience ?? member.stats?.xp ?? "",
      hpCurrent: hp.current ?? "",
      hpMax: hp.max ?? "",
      armorClass: member.stats?.armorClass ?? member.armorClass ?? member.ac ?? "",
      proficiencyBonus: member.proficiencyBonus ?? member.stats?.proficiencyBonus ?? member.prof ?? "",
      background: member.background || member.backstory || member.summary || member.description || "",
      str: scores.STR ?? "",
      dex: scores.DEX ?? "",
      con: scores.CON ?? "",
      int: scores.INT ?? "",
      wis: scores.WIS ?? "",
      cha: scores.CHA ?? "",
      skills: characterSkills(member).join("\n"),
      abilities: characterAbilities(member).join("\n"),
      spells: uniqueTextList([member.spells, member.stats?.spells]).join("\n"),
      notes: (member.notes ?? []).join("\n"),
    },
  };
}

export function buildCharacterSheetPayload({ member = {}, autoSheet = null, values = {} } = {}) {
  const preservedResources = autoSheet?.resources ?? member.resources ?? member.stats?.resources ?? {};
  const preservedAttacks = autoSheet?.attacks ?? member.attacks ?? member.weapons ?? member.equipment?.weapons ?? [];
  const preservedConditions = member.conditions ?? member.stats?.conditions ?? autoSheet?.conditions ?? [];
  return {
    domain: "party",
    id: member.id,
    name: String(values.name ?? "").trim(),
    role: String(values.role ?? "").trim(),
    playerRole: String(values.role ?? "").trim(),
    ancestryClass: String(values.ancestryClass ?? "").trim(),
    level: parseSheetNumber(values.level),
    experience: parseSheetNumber(values.xp),
    proficiencyBonus: parseSheetNumber(values.proficiencyBonus),
    background: String(values.background ?? "").trim(),
    stats: {
      hp: buildHpPayload(values),
      armorClass: parseSheetNumber(values.armorClass),
      abilityScores: buildAbilityScorePayload(values),
      spellSlots: preservedResources.spellSlots ?? member.stats?.spellSlots ?? null,
      resources: preservedResources,
      conditions: preservedConditions,
      spells: splitSheetText(values.spells),
    },
    speedFt: autoSheet?.speedFt ?? member.speedFt ?? member.speed ?? member.stats?.speedFt ?? member.stats?.speed ?? null,
    resources: preservedResources,
    attacks: preservedAttacks,
    conditions: preservedConditions,
    inventory: member.inventory ?? member.equipment ?? member.items ?? [],
    skills: splitSheetText(values.skills),
    abilities: splitSheetText(values.abilities),
    spells: splitSheetText(values.spells),
    notes: splitSheetText(values.notes),
  };
}

export function mergeSheetText(existing, additions) {
  return uniqueTextList([splitSheetText(existing), additions]).join("\n");
}

function buildHpPayload(values) {
  const current = parseSheetNumber(values.hpCurrent);
  const max = parseSheetNumber(values.hpMax);
  if (current === null && max === null) {
    return null;
  }
  return {
    current,
    max,
  };
}

function buildAbilityScorePayload(values) {
  return removeNullEntries({
    STR: parseSheetNumber(values.str),
    DEX: parseSheetNumber(values.dex),
    CON: parseSheetNumber(values.con),
    INT: parseSheetNumber(values.int),
    WIS: parseSheetNumber(values.wis),
    CHA: parseSheetNumber(values.cha),
  });
}

function normalizeHpForForm(hp) {
  if (!hp) {
    return {};
  }
  if (typeof hp === "number" || typeof hp === "string") {
    return {
      current: hp,
      max: "",
    };
  }
  return hp;
}

function characterAbilityScores(member) {
  const source = member.abilityScores ?? member.ability_scores ?? member.stats?.abilityScores ?? member.stats?.ability_scores ?? member.stats?.abilities;
  if (!source || Array.isArray(source) || typeof source !== "object") {
    return {};
  }

  const aliases = {
    STR: ["STR", "str", "strength"],
    DEX: ["DEX", "dex", "dexterity"],
    CON: ["CON", "con", "constitution"],
    INT: ["INT", "int", "intelligence"],
    WIS: ["WIS", "wis", "wisdom"],
    CHA: ["CHA", "cha", "charisma"],
  };

  return Object.fromEntries(
    Object.entries(aliases)
      .map(([label, keys]) => {
        const score = keys.map((key) => source[key]).find((value) => value !== undefined && value !== null);
        return score !== undefined ? [label, score] : null;
      })
      .filter(Boolean),
  );
}

function characterSkills(member) {
  return uniqueTextList([
    member.skills,
    member.specialties,
    member.proficiencies,
    member.expertise,
    member.stats?.skills,
    member.stats?.proficiencies,
  ]);
}

function characterAbilities(member) {
  return uniqueTextList([
    member.abilities,
    member.features,
    member.traits,
  ]);
}

function uniqueTextList(values) {
  const seen = new Set();
  return values
    .flatMap((value) => {
      if (!value) {
        return [];
      }
      if (Array.isArray(value)) {
        return value;
      }
      if (typeof value === "object") {
        return Object.entries(value).map(([key, entry]) => `${key}: ${entry}`);
      }
      return String(value).split(/[,;\n]+/);
    })
    .map((value) => {
      if (value && typeof value === "object") {
        return String(value.name || value.title || value.label || Object.entries(value).map(([key, entry]) => `${key}: ${entry}`).join(", "));
      }
      return String(value);
    })
    .map((value) => value.trim())
    .filter((value) => {
      if (!value || seen.has(value.toLowerCase())) {
        return false;
      }
      seen.add(value.toLowerCase());
      return true;
    });
}

function splitSheetText(value) {
  return String(value || "")
    .split(/[,;\n]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseSheetNumber(value) {
  const text = String(value ?? "").trim();
  if (!text) {
    return null;
  }
  const number = Number(text);
  return Number.isFinite(number) ? number : text;
}

function removeNullEntries(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== null && value !== ""));
}
