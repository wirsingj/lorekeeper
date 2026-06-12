const CONTRACT_VERSION = "turn-json-v1";
const TEXT_LIMITS = Object.freeze({
  summary: 520,
  sectionEntry: 260,
  partyNote: 180,
  userPrompt: 1600,
});

export function buildTurnJsonPrompt({ campaign, contextPack, playerTurn, parsedMessage } = {}) {
  const request = buildTurnRequestEnvelope({ campaign, contextPack, playerTurn, parsedMessage });
  return [
    "You are LoreKeeper's local tabletop RPG engine.",
    "Read this JSON request. Return only one valid JSON object matching responseFormat.schema.",
    "No markdown. No fenced code. No prose outside JSON.",
    JSON.stringify(request),
  ].join("\n");
}

export function buildTurnRequestEnvelope({ campaign, contextPack, playerTurn, parsedMessage } = {}) {
  return {
    lorekeeperRequest: CONTRACT_VERSION,
    meta: {
      intent: "generate_next_tabletop_turn",
      campaignId: campaign.id,
      campaignTitle: campaign.title,
      system: "D&D 5e-lite",
      canonSource: "SQLite campaign state in this request",
      instructionPriority: [
        "Never contradict canon context.",
        "Do not decide the primary player character's major choices.",
        "Parenthetical player text is meta direction, not in-world speech.",
        "Write a strong, specific scene beat with useful choices.",
      ],
    },
    responseFormat: {
      type: "json_only",
      schema: {
        lorekeeperResponse: CONTRACT_VERSION,
        table: [
          {
            speaker: "DM or party member name",
            role: "dm|party",
            text: "player-facing table chat text",
          },
        ],
        choices: {
          prompt: "question for the player",
          options: [{ id: "1", text: "clear action option" }],
          allowOther: true,
        },
        mechanics: [
          {
            type: "check|attack|save|damage|status|none",
            actor: "character or creature name",
            roll: "optional dice formula or result",
            dc: null,
            outcome: "success|failure|mixed|pending|none",
            label: "optional short roll/check/combat note",
            text: "brief player-facing mechanics",
          },
        ],
        proposedChanges: [
          {
            operation: "add|update|remove|note",
            domain: "party|people|factions|places|items|inventory|lore|timeline|quests|relationships|scene|combat|style",
            targetId: null,
            summary: "compact canon update",
            data: {},
            confidence: "low|medium|high",
            reason: "why this should become canon",
          },
        ],
      },
      rules: [
        "Return valid JSON only.",
        "Use proposedChanges: [] when no canon changed.",
        "Use party for PCs and trusted companions; people for NPCs.",
        "Every named add/update should include data.name or data.title.",
        "Choices must be separate objects, not a paragraph.",
      ],
    },
    user: {
      raw: compactText(parsedMessage?.raw || playerTurn || "", TEXT_LIMITS.userPrompt),
      inWorld: compactText(parsedMessage?.inWorldText || playerTurn || "", TEXT_LIMITS.userPrompt),
      meta: (parsedMessage?.metaInstructions ?? []).map((item) => compactText(item, 260)),
      actionIntent: inferActionIntent(parsedMessage?.inWorldText || playerTurn || ""),
      requestedRolls: inferRequestedRolls(parsedMessage?.raw || playerTurn || ""),
    },
    context: buildCompactContext(contextPack, campaign),
  };
}

export function parseTurnJsonResponse(rawText) {
  const parsed = parseJsonObject(rawText);
  const response = parsed.value ?? {};
  return {
    error: parsed.error,
    response: normalizeTurnResponse(response),
  };
}

export function renderTurnResponseForImport(turnResponse) {
  const response = normalizeTurnResponse(turnResponse);
  const lines = [];

  for (const entry of response.table) {
    const speaker = String(entry.speaker || "DM").trim();
    const text = String(entry.text || "").trim();
    if (!text) {
      continue;
    }

    if (speaker.toLowerCase() === "dm" || entry.role === "dm") {
      lines.push(text);
    } else {
      lines.push(`${speaker}: ${text}`);
    }
  }

  if (response.mechanics.length) {
    lines.push(response.mechanics.map((item) => `${item.label}: ${item.text}`).join("\n"));
  }

  if (response.choices.options.length) {
    lines.push([
      response.choices.prompt || "What do you do?",
      ...response.choices.options.map((option, index) => `${option.id || index + 1}. ${option.text}`),
      response.choices.allowOther ? "Something else." : "",
    ].filter(Boolean).join("\n"));
  }

  lines.push([
    "```json lorekeeper_updates",
    JSON.stringify({ proposedChanges: response.proposedChanges ?? [] }),
    "```",
  ].join("\n"));

  return lines.filter(Boolean).join("\n\n").trim();
}

function normalizeTurnResponse(response) {
  const table = Array.isArray(response.table)
    ? response.table.map(normalizeTableEntry).filter((entry) => entry.text)
    : [];
  const choices = normalizeChoices(response.choices);
  const mechanics = Array.isArray(response.mechanics)
    ? response.mechanics.map(normalizeMechanic).filter((item) => item.text)
    : [];
  const proposedChanges = Array.isArray(response.proposedChanges)
    ? response.proposedChanges
    : Array.isArray(response.updates?.proposedChanges)
      ? response.updates.proposedChanges
      : [];

  return {
    lorekeeperResponse: CONTRACT_VERSION,
    table: table.length ? table : [{ speaker: "DM", role: "dm", text: fallbackNarration(response) }],
    choices,
    mechanics,
    proposedChanges,
  };
}

function normalizeTableEntry(entry) {
  if (typeof entry === "string") {
    return { speaker: "DM", role: "dm", text: compactWhitespace(entry) };
  }

  return {
    speaker: compactWhitespace(entry?.speaker || "DM"),
    role: entry?.role === "party" ? "party" : "dm",
    text: compactWhitespace(entry?.text || entry?.body || ""),
  };
}

function normalizeChoices(choices = {}) {
  const options = Array.isArray(choices.options)
    ? choices.options.map((option, index) => ({
      id: String(option?.id ?? index + 1),
      text: compactWhitespace(option?.text || option),
    })).filter((option) => option.text)
    : [];

  return {
    prompt: compactWhitespace(choices.prompt || "What do you do?"),
    options: options.slice(0, 7),
    allowOther: choices.allowOther !== false,
  };
}

function normalizeMechanic(item) {
  return {
    type: compactWhitespace(item?.type || "none"),
    actor: compactWhitespace(item?.actor || ""),
    roll: compactWhitespace(item?.roll || ""),
    dc: item?.dc ?? null,
    outcome: compactWhitespace(item?.outcome || "none"),
    label: compactWhitespace(item?.label || "Mechanic"),
    text: compactWhitespace(item?.text || item),
  };
}

function fallbackNarration(response) {
  return compactWhitespace(response.narration || response.text || response.message || "The local model returned an empty table response.");
}

function buildCompactContext(contextPack, campaign) {
  return {
    summary: compactText(campaign.summary, TEXT_LIMITS.summary),
    scene: {
      status: campaign.scene?.status,
      currentPlaceId: campaign.scene?.currentPlaceId,
      presentPeopleIds: campaign.scene?.presentPeopleIds ?? [],
      presentPartyMemberIds: campaign.scene?.presentPartyMemberIds ?? [],
      activeQuestIds: campaign.scene?.activeQuestIds ?? [],
    },
    party: (campaign.party ?? []).map(compactPartyMember).slice(0, 8),
    tableVoices: (campaign.party ?? []).map((member) => ({
      id: member.id,
      name: member.name,
      voice: compactText(member.voice || member.personality || member.role || "reacts as an individual party member", 140),
      agency: member.playerRole === "player" || /player/i.test(member.role ?? "")
        ? "primary player character; do not choose major actions unless delegated"
        : "companion; may advise, react, and act within established facts",
    })).slice(0, 8),
    sections: (contextPack?.sections ?? []).map((section) => ({
      kind: section.kind,
      title: section.title,
      entries: section.entries.map((entry) => compactText(entry, TEXT_LIMITS.sectionEntry)).slice(0, 8),
    })),
  };
}

function inferActionIntent(value) {
  const text = String(value ?? "").toLowerCase();
  if (/\b(attack|shoot|stab|strike|cast|damage)\b/.test(text)) {
    return "combat_action";
  }
  if (/\b(check|roll|inspect|investigate|search|look|listen|track|sneak|hide|persuade|deceive|intimidate)\b/.test(text)) {
    return "skill_or_scene_check";
  }
  if (/\b(talk|ask|say|tell|convince|negotiate)\b/.test(text)) {
    return "social_action";
  }
  if (/\b(go|move|travel|enter|leave|follow|run|climb)\b/.test(text)) {
    return "movement_or_exploration";
  }
  return "freeform_table_action";
}

function inferRequestedRolls(value) {
  const text = String(value ?? "");
  const requests = [];
  const diceMatches = text.match(/\b\d*d(?:4|6|8|10|12|20|100)(?:\s*[+-]\s*\d+)?\b/gi) ?? [];
  for (const formula of diceMatches.slice(0, 4)) {
    requests.push({ type: "explicit_dice", formula, reason: "Player mentioned dice notation." });
  }

  const skillMatches = text.match(/\b(athletics|acrobatics|stealth|arcana|history|investigation|nature|religion|animal handling|insight|medicine|perception|survival|deception|intimidation|performance|persuasion)\b/gi) ?? [];
  for (const skill of [...new Set(skillMatches.map((item) => item.toLowerCase()))].slice(0, 4)) {
    requests.push({ type: "skill_check", skill, reason: "Player mentioned a 5E-style skill." });
  }

  return requests;
}

function compactPartyMember(member) {
  return {
    id: member.id,
    name: member.name,
    role: compactText(member.ancestryClass || member.role || member.class || "party member", 90),
    hp: member.stats?.hp ?? member.hp ?? member.hitPoints ?? null,
    level: member.level ?? member.stats?.level ?? member.characterLevel ?? null,
    abilities: compactArray(member.abilities ?? member.features ?? member.traits, 5),
    skills: compactArray(member.skills ?? member.specialties ?? member.proficiencies ?? member.stats?.skills, 5),
    notes: compactArray(member.notes, 2, TEXT_LIMITS.partyNote),
  };
}

function compactArray(value, limit, textLimit = 90) {
  const array = Array.isArray(value) ? value : value ? [value] : [];
  return array.map((item) => compactText(item, textLimit)).filter(Boolean).slice(0, limit);
}

function parseJsonObject(rawText) {
  const text = String(rawText ?? "").trim();
  if (!text) {
    return { value: null, error: "Empty model response." };
  }

  const stripped = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    return { value: JSON.parse(stripped), error: null };
  } catch (directError) {
    const candidate = extractBalancedObject(stripped);
    if (!candidate) {
      return { value: null, error: directError.message };
    }

    try {
      return { value: JSON.parse(candidate), error: null };
    } catch (candidateError) {
      return { value: null, error: candidateError.message };
    }
  }
}

function extractBalancedObject(text) {
  const start = text.indexOf("{");
  if (start === -1) {
    return "";
  }

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, index + 1);
      }
    }
  }

  return "";
}

function compactText(value, limit) {
  const compact = compactWhitespace(value);
  if (!limit || compact.length <= limit) {
    return compact;
  }

  return `${compact.slice(0, Math.max(0, limit - 1)).trimEnd()}...`;
}

function compactWhitespace(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}
