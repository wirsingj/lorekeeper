export function buildJoinPreviewProjection(preview, { seatHint = true } = {}) {
  const scene = preview?.scene ?? {};
  const sceneSummary = compactJoinPreviewLine(scene.immediateSituation);
  const campaignSummary = compactJoinPreviewLine(preview?.campaignSummary);
  const summary = sceneSummary || campaignSummary || "The host is sharing this local table.";
  const title = preview?.campaignTitle || "Hosted Table";
  const place = joinPreviewPlaceName(scene, preview?.places ?? []);
  const partyNames = (preview?.party ?? []).map((member) => member.name).filter(Boolean).slice(0, 5);
  const facts = [];
  if (place) {
    facts.push(`Scene: ${place}`);
  }
  if (partyNames.length) {
    facts.push(`Party: ${partyNames.join(", ")}`);
  }

  const placeNames = (preview?.places ?? [])
    .map((placeRecord) => placeRecord.name || placeRecord.title)
    .filter((name) => name && name !== place && !isScaffoldJoinPreviewText(name))
    .slice(0, 3);
  if (placeNames.length) {
    facts.push(`Places: ${placeNames.join(", ")}`);
  }

  const peopleNames = (preview?.people ?? []).map((person) => person.name || person.title).filter(Boolean).slice(0, 3);
  if (peopleNames.length) {
    facts.push(`Known faces: ${peopleNames.join(", ")}`);
  }

  const questNames = (preview?.quests ?? [])
    .map((quest) => quest.title || quest.name)
    .filter((name) => name && !isScaffoldJoinPreviewText(name))
    .slice(0, 2);
  if (questNames.length) {
    facts.push(`Threads: ${questNames.join(", ")}`);
  }

  return {
    title,
    summary,
    facts,
    hint: seatHint ? joinPreviewHint(partyNames) : "",
  };
}

export function compactJoinPreviewLine(text) {
  const cleaned = String(text ?? "")
    .replace(/\s+Next:\s+.*$/i, "")
    .replace(/opening DM narration/gi, "opening narration")
    .replace(/\s+/g, " ")
    .trim();
  const setupPremise = cleaned.match(/^The table is set at\b.*?\bPremise:\s*(.+)$/i);
  return (setupPremise?.[1]?.trim() || cleaned).slice(0, 420);
}

export function joinPreviewPlaceName(scene = {}, places = []) {
  const rawPlace = scene.currentPlaceId || scene.location || scene.place || "";
  const scenePlace = places.find((placeRecord) => placeRecord.id === rawPlace);
  return scenePlace?.name || scenePlace?.title || (looksLikeRecordId(rawPlace) ? "" : rawPlace);
}

export function isScaffoldJoinPreviewText(value) {
  return /^(?:place|draft)-|^Open the first thread$/i.test(String(value ?? "").trim());
}

function joinPreviewHint(partyNames = []) {
  return partyNames.length
    ? `Use this to explain how your character knows ${partyNames[0]} or why they are present in this scene.`
    : "Use this context to write why your character is already connected to this situation.";
}

function looksLikeRecordId(value) {
  return /^[a-z]+-[a-z0-9-]{6,}$/i.test(String(value ?? "").trim());
}
