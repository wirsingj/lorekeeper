export {
  choiceLabelForIndex,
  choiceOptionId,
  choicePanelKey,
} from "../src/engine/choice-vote-identity.js";

import {
  choiceLabelForIndex,
  choiceOptionId,
  choicePanelKey,
} from "../src/engine/choice-vote-identity.js";

export function isPartyVoteChoiceBlock(block = {}) {
  const scope = String(block.scope || "").trim();
  return block.allowVote === true || scope === "party" || scope === "vote";
}

export function currentChoiceVotesForBlock(block = {}, choiceVotes = []) {
  const key = choicePanelKey(block);
  if (!key) {
    return [];
  }
  return (Array.isArray(choiceVotes) ? choiceVotes : [])
    .filter((vote) => vote.choiceKey === key);
}

export function choiceVoteCounts(block = {}, choiceVotes = []) {
  const counts = new Map();
  for (const vote of currentChoiceVotesForBlock(block, choiceVotes)) {
    const id = String(vote.optionId || "");
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  return counts;
}

export function choiceVoteEntries(block = {}, choiceVotes = []) {
  const counts = choiceVoteCounts(block, choiceVotes);
  return (block.items ?? []).map((_, index) => {
    const optionId = choiceOptionId(block, index);
    return {
      index,
      optionId,
      label: choiceLabelForIndex(index),
      count: counts.get(optionId) || 0,
    };
  });
}

export function choiceVoteState(block = {}, choiceVotes = []) {
  const entries = choiceVoteEntries(block, choiceVotes).filter((entry) => entry.count > 0);
  if (!entries.length) {
    return { entries, leaders: [], leader: null, tied: false };
  }
  const maxCount = Math.max(...entries.map((entry) => entry.count));
  const leaders = entries.filter((entry) => entry.count === maxCount);
  return {
    entries,
    leaders,
    leader: leaders.length === 1 ? leaders[0] : null,
    tied: leaders.length > 1,
  };
}

export function choiceVoteSummaryText(block = {}, choiceVotes = []) {
  if (!isPartyVoteChoiceBlock(block)) {
    return "";
  }
  const voteState = choiceVoteState(block, choiceVotes);
  if (!voteState.entries.length) {
    return "";
  }
  const votesText = voteState.entries.map((entry) => `${entry.label}: ${entry.count}`).join(", ");
  if (voteState.tied) {
    return `Tie at the table - ${votesText}. Host breaks the tie by choosing any option.`;
  }
  return `Table leaning - ${votesText}. Leading: ${voteState.leader.label}.`;
}

export function leadingChoiceVoteEntry(block = {}, { choiceVotes = [], isHost = true } = {}) {
  if (!isHost || !isPartyVoteChoiceBlock(block)) {
    return null;
  }
  return choiceVoteState(block, choiceVotes).leader;
}

export function currentGuestVoteForChoice(block = {}, {
  choiceVotes = [],
  playerId = "",
  characterId = "",
} = {}) {
  if (!playerId && !characterId) {
    return null;
  }
  return currentChoiceVotesForBlock(block, choiceVotes).find((vote) =>
    (playerId && vote.playerId === playerId) ||
    (characterId && vote.characterId === characterId)
  ) ?? null;
}

export function choiceSelectionActivityText(label, voteCount = 0) {
  const voteText = voteCount ? ` with ${voteCount} ${voteCount === 1 ? "vote" : "votes"}` : "";
  return `Selected choice ${label}${voteText}; edit or send`;
}

export function structuredChoicesForMessage(turnResponse) {
  const choices = turnResponse?.choices;
  if (!choices?.options?.length) {
    return null;
  }
  return {
    prompt: choices.prompt || "What do you do?",
    scope: choices.scope || "",
    forActorId: choices.forActorId ?? null,
    forActor: choices.forActor || "",
    forActorIds: Array.isArray(choices.forActorIds) ? choices.forActorIds : [],
    allowVote: choices.allowVote === true,
    voteTieBreaker: choices.voteTieBreaker || "host",
    allowOther: choices.allowOther !== false,
    options: choices.options.map((option, index) => ({
      id: String(option.id || choiceLabelForIndex(index)),
      actorId: option.actorId ?? null,
      actor: option.actor || "",
      targetActorId: option.targetActorId ?? null,
      targetActor: option.targetActor || "",
      legalOptionId: option.legalOptionId ?? null,
      text: option.text || option.label || "",
    })).filter((option) => option.text),
  };
}

export function structuredChoiceBlockFromMessageData(data = {}) {
  if (data.choiceOwner !== true) {
    return null;
  }
  const choices = data.choices;
  if (!choices?.options?.length) {
    return null;
  }
  return {
    type: "choices",
    prompt: choices.prompt || "What do you do?",
    audienceLabel: choiceAudienceLabel(choices),
    scope: choices.scope || "",
    forActorId: choices.forActorId ?? null,
    forActor: choices.forActor || "",
    forActorIds: Array.isArray(choices.forActorIds) ? choices.forActorIds : [],
    allowVote: choices.allowVote === true,
    items: choices.options.map(formatStructuredChoiceOption),
    options: choices.options,
    allowOther: choices.allowOther !== false,
    structured: true,
  };
}

export function choiceAudienceLabel(choices = {}) {
  const scope = String(choices.scope || "").trim();
  if (choices.allowVote === true || scope === "vote") {
    return "Party vote - host breaks ties";
  }
  if (scope === "party") {
    return "For the party";
  }
  if (scope === "combat_actor") {
    return choices.forActor ? `Combat turn: ${choices.forActor}` : "Current combat actor";
  }
  if (scope === "character") {
    return choices.forActor ? `For ${choices.forActor}` : "For one character";
  }
  if (scope === "subset") {
    return choices.forActor ? `For ${choices.forActor}` : "For selected characters";
  }
  return "";
}

export function buildChoiceSelectionFromText({ text = "", panel = null } = {}) {
  const choiceTokenText = extractChoiceTokenText(text);
  if (!choiceTokenText || !panel?.items?.length) {
    return null;
  }

  const selectedIndexes = parseChoiceIndexes(choiceTokenText, panel.items.length);
  if (!selectedIndexes.length) {
    return null;
  }

  const labels = selectedIndexes.map((index) => choiceLabelForIndex(index));
  const choices = selectedIndexes.map((index) => panel.items[index]).filter(Boolean);
  if (!choices.length) {
    return null;
  }

  return {
    labels,
    choices,
    optionRecords: selectedIndexes.map((index) => panel.options?.[index] ?? null),
    prompt: panel.prompt,
    scope: panel.scope || "",
    forActorId: panel.forActorId ?? null,
    forActor: panel.forActor || "",
    forActorIds: Array.isArray(panel.forActorIds) ? panel.forActorIds : [],
    allowVote: panel.allowVote === true,
    selectedOptionIds: selectedIndexes.map((index) => panel.options?.[index]?.id ?? choiceLabelForIndex(index)),
    inWorldText: `I choose ${labels.join(" + ")}: ${choices.join(" Also, ")}`,
  };
}

export function extractChoiceTokenText(text) {
  const trimmed = String(text ?? "").trim();
  if (/^(?:[A-Ha-h]|\d+)(?:\s*(?:,|\+|and|&)\s*(?:[A-Ha-h]|\d+))*$/.test(trimmed)) {
    return trimmed;
  }
  const match = trimmed.match(/^(?:i\s+)?(?:choose|chose|pick|picked|select|selected|option|choice)\s+((?:[A-Ha-h]|\d+)(?:\s*(?:,|\+|and|&)\s*(?:[A-Ha-h]|\d+))*)(?:\b|[:.)-])/i);
  return match?.[1] ?? "";
}

export function choiceSelectionInWorldText(selection, visibleText = "") {
  const text = String(visibleText ?? "").trim();
  if (!text) {
    return selection.inWorldText;
  }

  const tokenText = extractChoiceTokenText(text);
  if (!tokenText) {
    return text;
  }

  if (isBareChoiceSelectionText(text) || isExactChoiceDraft(selection, text)) {
    return selection.inWorldText;
  }

  return text;
}

export function pendingSelectionMatchesText(selection, text = "") {
  if (!selection?.choices?.length) {
    return false;
  }
  const normalizedText = compactCompareText(text);
  if (!normalizedText) {
    return false;
  }
  if (normalizedText === compactCompareText(selection.inWorldText)) {
    return true;
  }
  return selection.selectedOptionIds?.some((id) =>
    new RegExp(`^(?:i\\s+)?(?:choose|chose|pick|picked|select|selected|option|choice)\\s+${escapeRegExp(id)}\\b`, "i").test(text)
  );
}

export function buildChoiceSelectionMeta(selection, { actualAction = "", inCombat = false } = {}) {
  const combatInstruction = inCombat
    ? " This is a combat action for the active initiative actor; resolve it with visible mechanics, HP/resource updates, and advance the turn. Do not resolve or narrate the next initiative actor's attack/action in this response."
    : "";
  const audienceInstruction = choiceSelectionAudienceMeta(selection);
  const editedInstruction = actualAction && compactCompareText(actualAction) !== compactCompareText(selection.inWorldText)
    ? " The player edited/expanded the selected option; user.inWorld is the authoritative action and overrides the original option wording."
    : " Resolve the selected choice text, not the bare numbers/letters.";
  return `(meta: The player selected ${selection.labels.join(", ")} from the latest visible choice panel.${audienceInstruction}${editedInstruction} Preserve concrete player details, props, positioning, dialogue, and intent from user.inWorld. Do not ask the same choice question again unless new information changes the options.${combatInstruction})`;
}

export function parseChoiceIndexes(text, maxChoices) {
  const seen = new Set();
  return String(text)
    .split(/\s*(?:,|\+|and|&)\s*/i)
    .map((token) => choiceTokenToIndex(token))
    .filter((index) => Number.isInteger(index) && index >= 0 && index < maxChoices)
    .filter((index) => {
      if (seen.has(index)) {
        return false;
      }
      seen.add(index);
      return true;
    });
}

function isBareChoiceSelectionText(text) {
  const trimmed = String(text ?? "").trim();
  return /^(?:[A-Ha-h]|\d+)(?:\s*(?:,|\+|and|&)\s*(?:[A-Ha-h]|\d+))*$/.test(trimmed) ||
    /^(?:i\s+)?(?:choose|chose|pick|picked|select|selected|option|choice)\s+(?:[A-Ha-h]|\d+)(?:\s*(?:,|\+|and|&)\s*(?:[A-Ha-h]|\d+))*\s*$/i.test(trimmed);
}

function isExactChoiceDraft(selection, text) {
  const normalizedText = compactCompareText(text);
  if (!normalizedText) {
    return false;
  }
  if (normalizedText === compactCompareText(selection.inWorldText)) {
    return true;
  }
  return (selection.selectedOptionIds ?? []).some((id, index) => {
    const choice = selection.choices?.[index] ?? "";
    return normalizedText === compactCompareText(`I choose ${id}: ${choice}`) ||
      normalizedText === compactCompareText(`I choose ${id}. ${choice}`) ||
      normalizedText === compactCompareText(`I choose ${id} ${choice}`) ||
      normalizedText === compactCompareText(`${id}. ${choice}`);
  });
}

function choiceSelectionAudienceMeta(selection = {}) {
  const pieces = [];
  if (selection.scope) {
    pieces.push(`choice scope: ${selection.scope}`);
  }
  if (selection.forActor) {
    pieces.push(`targeted actor: ${selection.forActor}`);
  }
  if (selection.forActorId) {
    pieces.push(`targeted actor id: ${selection.forActorId}`);
  }
  if (selection.allowVote) {
    pieces.push("this was a party vote prompt; host breaks ties");
  }
  return pieces.length ? ` ${pieces.join("; ")}.` : "";
}

function formatStructuredChoiceOption(option) {
  const actor = option.actor || option.targetActor ? `${option.actor || option.targetActor}: ` : "";
  return `${actor}${option.text}`;
}

function choiceTokenToIndex(token) {
  const trimmed = String(token ?? "").trim();
  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed) - 1;
  }
  const letter = trimmed.toUpperCase();
  if (/^[A-H]$/.test(letter)) {
    return letter.charCodeAt(0) - 65;
  }
  return -1;
}

function compactCompareText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
