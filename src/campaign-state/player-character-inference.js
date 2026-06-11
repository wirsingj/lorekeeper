import { touchCampaign } from "./schema.js";

export function ensureInferredPlayerCharacter(campaign) {
  if ((campaign.party ?? []).length > 0) {
    return {
      campaign,
      inferred: null,
    };
  }

  const inference = inferPlayerCharacter(campaign);
  if (!inference) {
    return {
      campaign,
      inferred: null,
    };
  }

  const working = structuredClone(campaign);
  const now = new Date().toISOString();
  const record = {
    id: inference.id,
    name: inference.name,
    type: "player_character",
    playerRole: "player character",
    ancestryClass: inference.ancestryClass,
    stats: {
      hp: null,
      armorClass: null,
      abilities: {},
      spells: [],
    },
    abilities: inference.abilities,
    notes: inference.notes,
    createdAt: now,
    updatedAt: now,
  };

  working.party = [record];
  working.scene.presentPartyMemberIds = [...new Set([record.id, ...(working.scene.presentPartyMemberIds ?? [])])];

  return {
    campaign: touchCampaign(working),
    inferred: record,
  };
}

function inferPlayerCharacter(campaign) {
  const text = [
    campaign.summary,
    ...(campaign.sessionLog?.messages ?? [])
      .filter((message) => message.role === "player")
      .map((message) => message.body),
  ].filter(Boolean).join("\n");

  const explicitName = matchFirst(text, [
    /\bmy character (?:is|as|=)\s+([A-Z][A-Za-z' -]{1,40})/i,
    /\bI(?:'|’)ll play as\s+([A-Z][A-Za-z' -]{1,40})/i,
    /\bI am playing\s+([A-Z][A-Za-z' -]{1,40})/i,
    /\bmy character,\s*([A-Z][A-Za-z' -]{1,40})/i,
  ]);

  if (explicitName) {
    return {
      id: `party-${slugify(explicitName)}`,
      name: explicitName,
      ancestryClass: inferAncestryClass(text, "player character"),
      abilities: inferAbilities(text),
      notes: ["Player character inferred from the campaign setup.", summarizeSetup(text)],
    };
  }

  if (/\b(?:the )?player is(?:,| )|(?:the )?player was(?:,| )/i.test(text) && /\bking\b/i.test(text)) {
    return {
      id: "party-exiled-king",
      name: "The Exiled King",
      ancestryClass: "amnesiac exiled king",
      abilities: inferAbilities(text),
      notes: [
        "Player character inferred from the campaign setup.",
        "True name currently unknown.",
        "Meta-known setup: the player was a king, betrayed, exiled, and stripped of memory.",
        "Update this party member when the character's real name is revealed.",
      ],
    };
  }

  if (/\b(?:the )?player is(?:,| )|(?:the )?player was(?:,| )|\bmy character\b/i.test(text)) {
    return {
      id: "party-player-character",
      name: "Player Character",
      ancestryClass: inferAncestryClass(text, "adventurer"),
      abilities: inferAbilities(text),
      notes: ["Player character inferred from the campaign setup.", summarizeSetup(text)],
    };
  }

  return null;
}

function matchFirst(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const value = match?.[1]?.trim().replace(/[.!,;:]+$/, "");
    if (value) {
      return value;
    }
  }

  return null;
}

function inferAncestryClass(text, fallback) {
  const parts = [];
  for (const word of ["elf", "human", "dwarf", "halfling", "tiefling", "dragonborn", "gnome", "orc"]) {
    if (new RegExp(`\\b${word}\\b`, "i").test(text)) {
      parts.push(word);
      break;
    }
  }

  for (const word of ["druid", "fighter", "rogue", "thief", "wizard", "cleric", "ranger", "bard", "paladin", "warlock", "sorcerer", "monk", "barbarian", "king"]) {
    if (new RegExp(`\\b${word}\\b`, "i").test(text)) {
      parts.push(word);
    }
  }

  return parts.length ? [...new Set(parts)].join(" ") : fallback;
}

function inferAbilities(text) {
  const abilities = [];
  if (/turn into a wolf|wolf shape|wild shape/i.test(text)) {
    abilities.push("Can turn into a wolf");
  }
  if (/frost magic|ice magic/i.test(text)) {
    abilities.push("Frost magic");
  }
  if (/memory wiped|amnesia|lost memor/i.test(text)) {
    abilities.push("Lost memories");
  }
  if (/king|royal|crown/i.test(text)) {
    abilities.push("Royal authority");
  }
  return abilities;
}

function summarizeSetup(text) {
  return text.replace(/\s+/g, " ").trim().slice(0, 260);
}

function slugify(value) {
  return String(value)
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
