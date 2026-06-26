export function recordDialogConfig(domain) {
  const configs = {
    party: {
      title: "Add Party Member",
      editTitle: "Edit Party Member",
      nameLabel: "Character name",
      roleLabel: "Ancestry / class",
      namePlaceholder: "Character name",
      rolePlaceholder: "Ancestry and class",
      notesPlaceholder: "Personality, goals, stats, familiar, important backstory...",
    },
    people: {
      title: "Add Person",
      editTitle: "Edit Person",
      nameLabel: "Name",
      roleLabel: "Role / type",
      namePlaceholder: "Person name",
      rolePlaceholder: "Role, faction, or relationship...",
      notesPlaceholder: "What is canon about this person?",
    },
    places: {
      title: "Add Place",
      editTitle: "Edit Place",
      nameLabel: "Place name",
      roleLabel: "Place type",
      namePlaceholder: "Place name",
      rolePlaceholder: "Town, ruin, road, safehouse...",
      notesPlaceholder: "Sights, factions, dangers, connections, known facts...",
    },
    quests: {
      title: "Add Thread",
      editTitle: "Edit Thread",
      nameLabel: "Thread title",
      roleLabel: "Status",
      namePlaceholder: "Open thread title",
      rolePlaceholder: "active",
      notesPlaceholder: "Stakes, clues, unresolved questions...",
    },
    lore: {
      title: "Add Lore Note",
      editTitle: "Edit Lore Note",
      nameLabel: "Lore title",
      roleLabel: "Tags",
      namePlaceholder: "Lore note title",
      rolePlaceholder: "Tags, themes, domains...",
      notesPlaceholder: "Canon note text...",
    },
    assets: {
      title: "Add Source Image",
      editTitle: "Edit Source Image",
      nameLabel: "Asset name",
      roleLabel: "Kind",
      namePlaceholder: "Source image name",
      rolePlaceholder: "image",
      notesPlaceholder: "What should LoreKeeper remember about this source image?",
    },
    items: {
      title: "Add Thing",
      editTitle: "Edit Thing",
      nameLabel: "Thing name",
      roleLabel: "Kind / type",
      namePlaceholder: "Thing name",
      rolePlaceholder: "Tool, clue, artifact, weapon...",
      notesPlaceholder: "What is known about it, who has it, and why it matters...",
    },
  };

  return configs[domain] ?? configs.lore;
}

export function recordRoleValue(domain, record = {}) {
  if (domain === "party") {
    return record.ancestryClass || record.role || record.playerRole || "";
  }

  if (domain === "quests") {
    return record.status || "";
  }

  if (domain === "lore") {
    return (record.tags ?? []).join(", ");
  }

  return record.role || record.type || record.kind || record.region || "";
}

export function recordNotesValue(domain, record = {}) {
  if (domain === "quests") {
    return [record.stakes, ...(record.openQuestions ?? []).map((question) => `Open: ${question}`)].filter(Boolean).join("\n");
  }

  return [record.summary, record.description, ...(record.notes ?? [])].filter(Boolean).join("\n");
}

export function recordLabel(domain) {
  return {
    party: "Party member",
    people: "Person",
    places: "Place",
    quests: "Thread",
    lore: "Lore note",
    assets: "Asset",
    items: "Thing",
  }[domain] ?? "Record";
}
