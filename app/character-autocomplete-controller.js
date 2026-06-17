// Shared character creation helper for Host New, post-start host creation, and
// guest join. By default it preserves user-supplied facts first; callers can set
// regenerate when an Auto-Complete button should refresh derived flavor from the
// current hard facts instead of keeping stale generated text.
export function completeCharacterSeed(seed = {}, options = {}) {
  const regenerate = Boolean(options.regenerate);
  const campaignContext = buildCharacterAutocompleteContext(options);
  const text = [
    seed.name,
    seed.ancestry,
    seed.characterClass,
    seed.roleIntent,
    seed.appearance,
    seed.backstory,
    seed.concept,
    seed.integrationPrompt,
    campaignContext.summary,
    campaignContext.tone,
  ].filter(Boolean).join(" ");
  const ancestry = String(
    seed.ancestry || inferAncestryFromText(text) || campaignContext.commonAncestry || "Human",
  ).trim();
  const characterClass = String(
    seed.characterClass || inferClassFromText(text) || campaignContext.commonClass || "Adventurer",
  ).trim();
  const name = String(seed.name || suggestCharacterName(ancestry, characterClass, campaignContext)).trim();
  const roleIntent = String(seed.roleIntent || inferRoleIntent(characterClass, text, campaignContext)).trim();
  const level = clampLevel(parseOptionalNumber(seed.level) ?? campaignContext.defaultLevel ?? 1);
  const profile = classifyCharacterProfile(`${characterClass} ${roleIntent} ${seed.backstory || seed.concept || ""}`);
  const partyTheme = describePartyTheme(campaignContext);
  const appearance = `${name} is a ${compactAncestryAdjective(ancestry)} ${profile.label} with practical travel-worn gear and a steady, readable presence.`;
  const backstory = partyTheme
    ? `${name} is a ${ancestry} ${characterClass} known for ${roleIntent.toLowerCase()}. They fit the party's ${partyTheme} without taking over the main decision.`
    : `${name} is a ${ancestry} ${characterClass} known for ${roleIntent.toLowerCase()}. They are dependable under pressure, but carry a personal reason to keep moving with the party.`;
  const integrationPrompt = regenerate
    ? defaultPartyIntegration(name, campaignContext)
    : seed.integrationPrompt || defaultPartyIntegration(name, campaignContext);
  const hostIntegrationPrompt = regenerate
    ? `${name} should support the party's current goal without taking control of the main decision.`
    : seed.hostIntegrationPrompt || `${name} should support the party's current goal without taking control of the main decision.`;

  return {
    ...seed,
    name,
    ancestry,
    characterClass,
    level,
    roleIntent,
    appearance: regenerate ? appearance : seed.appearance || appearance,
    backstory: regenerate ? backstory : seed.backstory || seed.concept || backstory,
    concept: regenerate ? backstory : seed.concept || seed.backstory || backstory,
    integrationPrompt,
    hostIntegrationPrompt,
  };
}

export function buildPartyTemplateCharacters(seed = {}, options = {}) {
  const count = Math.max(1, Math.min(Number(options.count) || 3, 8));
  const campaign = options.campaign || {};
  const startingPartyMembers = Array.isArray(options.startingPartyMembers) ? [...options.startingPartyMembers] : [];
  const primary = completeCharacterSeed(seed, {
    campaign,
    startingPartyMembers,
  });
  const characters = [];
  for (let index = 0; index < count; index += 1) {
    const completed = completeCharacterSeed({
      ancestry: primary.ancestry,
      characterClass: primary.characterClass,
      level: primary.level,
      roleIntent: primary.roleIntent,
      concept: `${primary.ancestry} ${primary.characterClass} companion connected to ${primary.name}.`,
      controllerKind: "ai_companion",
    }, {
      campaign,
      startingPartyMembers: [
        ...startingPartyMembers,
        primary,
        ...characters,
      ],
    });
    characters.push({
      ...completed,
      controllerKind: "ai_companion",
      hostIntegrationPrompt: `${completed.name} should reinforce the party theme and stay available for host direction.`,
    });
  }
  return characters;
}

export function splitAncestryClass(value = "") {
  const words = String(value ?? "").trim().split(/\s+/).filter(Boolean);
  const ancestryIndex = words.findIndex((word) => /\b(dwarf|dwarven|elf|elven|human|halfling|gnome|orc|tiefling|dragonborn|fairy|fae)\b/i.test(word));
  if (ancestryIndex === -1) {
    return { ancestry: "", characterClass: words.join(" ") };
  }
  const ancestry = inferAncestryFromText(words[ancestryIndex]);
  const characterClass = words.filter((_, index) => index !== ancestryIndex).join(" ");
  return { ancestry, characterClass };
}

export function buildCharacterAutocompleteContext(options = {}) {
  const campaign = options.campaign || {};
  const startingPartyMembers = Array.isArray(options.startingPartyMembers) ? options.startingPartyMembers : [];
  const party = [...(Array.isArray(campaign.party) ? campaign.party : []), ...startingPartyMembers].filter(Boolean);
  const ancestries = party.map((member) => member.ancestry || splitAncestryClass(member.ancestryClass).ancestry).filter(Boolean);
  const classes = party.map((member) => member.characterClass || splitAncestryClass(member.ancestryClass || member.role || member.playerRole).characterClass).filter(Boolean);
  return {
    partyNames: party.map((member) => member.name).filter(Boolean).slice(0, 4),
    commonAncestry: mostCommon(ancestries),
    commonClass: mostCommon(classes),
    defaultLevel: mostCommon(party.map((member) => Number(member.level)).filter(Number.isFinite)),
    summary: campaign.summary || campaign.premise || "",
    tone: campaign.style?.tone || campaign.tone || "",
    startingLocation: campaign.scene?.currentPlaceId || campaign.startingLocation || "",
  };
}

function inferAncestryFromText(text = "") {
  const match = String(text).match(/\b(dwarf|dwarven|elf|elven|human|halfling|gnome|orc|half-orc|tiefling|dragonborn|fairy|fae)\b/i);
  if (!match) return "";
  return {
    dwarven: "Dwarf",
    elven: "Elf",
    fae: "Fairy",
  }[match[1].toLowerCase()] || titleCase(match[1]);
}

function inferClassFromText(text = "") {
  const value = String(text);
  const matches = [
    [/scout|archer|tracker|hunter|ranger/i, "Scout"],
    [/soldier|guard|fighter|warrior|knight/i, "Soldier"],
    [/cleric|priest|healer|paladin/i, "Cleric"],
    [/rogue|thief|burglar|spy/i, "Rogue"],
    [/wizard|mage|arcane|scholar/i, "Wizard"],
    [/druid|warden|nature/i, "Druid"],
    [/bard|performer|envoy/i, "Bard"],
  ].find(([regex]) => regex.test(value));
  return matches?.[1] || "";
}

function inferRoleIntent(characterClass = "", text = "", context = {}) {
  const value = `${characterClass} ${text}`;
  if (/scout|ranger|tracker|hunter/i.test(value)) return "Scout and pathfinder";
  if (/soldier|fighter|warrior|guard|knight/i.test(value)) return "Front-line soldier";
  if (/cleric|healer|priest|paladin/i.test(value)) return "Healer and steady counsel";
  if (/rogue|thief|spy|burglar/i.test(value)) return "Quiet problem-solver";
  if (/wizard|mage|arcane|scholar/i.test(value)) return "Arcane specialist";
  if (/bard|performer|envoy/i.test(value)) return "Face and morale";
  if (context.commonClass) return `Reliable ${String(context.commonClass).toLowerCase()} support`;
  return "Reliable adventuring support";
}

function suggestCharacterName(ancestry = "", characterClass = "", context = {}) {
  const key = `${ancestry} ${characterClass}`.toLowerCase();
  const used = new Set((context.partyNames ?? []).map((name) => String(name).toLowerCase()));
  const names = /dwarf/.test(key)
    ? ["Oskar", "Bram", "Tilli", "Ingrid", "Bren", "Thora"]
    : /elf|fairy|fae/.test(key)
      ? ["Mira", "Elaris", "Thistle", "Liora", "Corin"]
      : ["Rowan", "Jarin", "Evelynn", "Corin", "Garren"];
  return names.find((name) => !used.has(name.toLowerCase())) || names[0];
}

function compactAncestryAdjective(ancestry = "") {
  return String(ancestry || "adventuring").toLowerCase();
}

function defaultPartyIntegration(name = "This character", context = {}) {
  const partyNames = context.partyNames ?? [];
  const theme = describePartyTheme(context);
  if (partyNames.length) {
    const themeText = theme ? ` as part of the group's ${theme}` : "";
    return `${name} already has a practical reason to trust ${partyNames.join(", ")}${themeText} and backs them up without taking over the scene.`;
  }
  if (context.summary) {
    return `${name} is tied to the campaign premise and has a grounded reason to join the first scene.`;
  }
  return `${name} begins in the same immediate situation as the primary character and has a reason to stay with the group.`;
}

function describePartyTheme(context = {}) {
  if (context.commonAncestry && context.commonClass) {
    return `${String(context.commonAncestry).toLowerCase()} ${String(context.commonClass).toLowerCase()} theme`;
  }
  if (context.commonAncestry) {
    return `${String(context.commonAncestry).toLowerCase()} party theme`;
  }
  if (context.commonClass) {
    return `${String(context.commonClass).toLowerCase()} party role`;
  }
  return "";
}

function classifyCharacterProfile(text = "") {
  if (/cleric|healer|priest|paladin/i.test(text)) return { label: "steady healer" };
  if (/rogue|thief|spy|scout|ranger|hunter/i.test(text)) return { label: "quick-eyed scout" };
  if (/wizard|mage|arcane|scholar/i.test(text)) return { label: "thoughtful spellcaster" };
  if (/fighter|soldier|warrior|guard|knight/i.test(text)) return { label: "seasoned fighter" };
  if (/bard|performer|envoy/i.test(text)) return { label: "silver-tongued traveler" };
  return { label: "capable adventurer" };
}

function mostCommon(values = []) {
  const counts = new Map();
  for (const value of values.map((item) => String(item ?? "").trim()).filter(Boolean)) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || "";
}

function clampLevel(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 1;
  return Math.max(1, Math.min(20, Math.round(number)));
}

function parseOptionalNumber(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return null;
  const number = Number(trimmed);
  return Number.isFinite(number) ? number : null;
}

function titleCase(value = "") {
  const text = String(value);
  return text ? `${text.slice(0, 1).toUpperCase()}${text.slice(1).toLowerCase()}` : "";
}
