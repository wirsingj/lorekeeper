export function buildAggregatedPlayerTurnFromInputs({ hostText = "", inputs = [] } = {}) {
  const trimmedHostText = String(hostText ?? "").trim();
  const readyInputs = Array.isArray(inputs)
    ? inputs
      .filter((input) => input?.ready && !input?.passed && String(input?.text ?? "").trim())
      .sort((a, b) => String(a.updatedAt ?? "").localeCompare(String(b.updatedAt ?? "")))
    : [];
  const lines = [];
  if (trimmedHostText) {
    lines.push(`Host/player: ${trimmedHostText}`);
  }
  for (const input of readyInputs) {
    lines.push(`${input.characterName || "Player"}: ${String(input.text ?? "").trim()}`);
  }
  if (!lines.length) {
    throw new Error("No ready player inputs to resolve.");
  }

  return {
    raw: "Combined structured party turn",
    text: [
      "Combined structured party turn:",
      ...lines.map((line) => `- ${line}`),
      "(meta: Resolve these party inputs together. Preserve each character's agency and voice. Return strict LoreKeeper JSON.)",
    ].join("\n"),
    playerInputs: [
      ...(trimmedHostText ? [{
        playerId: "host",
        playerName: "Host",
        characterId: null,
        characterName: "Host",
        text: trimmedHostText,
        ready: true,
      }] : []),
      ...readyInputs.map((input) => ({
        playerId: input.playerId,
        playerName: input.playerName,
        characterId: input.characterId,
        characterName: input.characterName,
        text: String(input.text ?? "").trim(),
        ready: Boolean(input.ready),
      })),
    ],
  };
}

export function buildAggregatedPlayerTurn(campaign, { hostText = "" } = {}) {
  return buildAggregatedPlayerTurnFromInputs({
    hostText,
    inputs: campaign?.multiplayer?.pendingTurnInputs ?? [],
  });
}
