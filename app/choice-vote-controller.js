export function choiceLabelForIndex(index) {
  return String.fromCharCode(65 + index);
}

export function choiceOptionId(block, index) {
  return String(block.options?.[index]?.id || choiceLabelForIndex(index));
}

export function choicePanelKey(block = {}) {
  return compactCompareText([
    block.prompt || "",
    block.scope || "",
    block.forActorId || "",
    (block.options ?? []).map((option, index) => `${choiceOptionId(block, index)}:${option?.text || block.items?.[index] || ""}`).join("|"),
  ].join("::")).slice(0, 500);
}

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

function compactCompareText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
