export function indexById(records = []) {
  return new Map(records.map((record) => [record.id, record]));
}

export function findById(records = [], id) {
  return records.find((record) => record.id === id) ?? null;
}

export function labelEntity(campaign, id) {
  const groups = [
    campaign.people,
    campaign.party,
    campaign.factions,
    campaign.places,
    campaign.items,
    campaign.quests,
    campaign.lore,
  ];

  for (const group of groups) {
    const match = findById(group, id);
    if (match) {
      return match.name ?? match.title ?? match.id;
    }
  }

  return id ?? "Unknown";
}

export function bulletList(values, fallback = "None recorded.") {
  if (!values || values.length === 0) {
    return [`- ${fallback}`];
  }

  return values.map((value) => `- ${value}`);
}

export function joinNotes(notes = []) {
  if (!Array.isArray(notes) || notes.length === 0) {
    return "";
  }

  return notes.join(" ");
}

