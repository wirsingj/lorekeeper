import { createDefaultRulesProfile, createEmptyCampaign } from "./schema.js";

export function createStarterCampaign(options = {}) {
  const title = options.title?.trim() || "New LoreKeeper Campaign";
  const premise =
    options.premise?.trim() ||
    "A new fantasy campaign ready to grow through play, with canon captured by LoreKeeper.";

  return createEmptyCampaign({
    id: options.id ?? slugify(title),
    title,
    summary: premise,
    scene: {
      status: "campaign_start",
      currentPlaceId: "place-starting-location",
      nearbyPlaceIds: [],
      presentPeopleIds: [],
      presentPartyMemberIds: [],
      activeQuestIds: ["quest-first-thread"],
      localNotes: ["The first scene has not been played yet."],
      immediateSituation:
        options.openingScene?.trim() ||
        "The adventure is ready to begin. Establish the opening location, party, tone, and first tension.",
    },
    places: [
      {
        id: "place-starting-location",
        name: options.startingLocation?.trim() || "Starting Location",
        type: "starting area",
        region: "",
        summary: "The first place the campaign will frame in detail.",
        notes: ["Replace this with the first real settlement, road, dungeon, ship, keep, or wilderness site."],
        connectedPlaceIds: [],
      },
    ],
    quests: [
      {
        id: "quest-first-thread",
        title: "Open the first thread",
        status: "active",
        stakes: "Establish what the characters want, what stands in the way, and what changes if they fail.",
        openQuestions: [
          "Who is present at the start?",
          "What immediate pressure demands a choice?",
          "What tone should the first session lock in?",
        ],
        relatedIds: ["place-starting-location"],
      },
    ],
    lore: [
      {
        id: "lore-campaign-premise",
        title: "Campaign Premise",
        canon: true,
        notes: [premise],
        tags: ["premise", "starter"],
      },
    ],
    rulesProfile: createDefaultRulesProfile(),
    providerSettings: options.providerSettings,
    style: {
      tone: options.tone?.trim() || "engaging D&D-style adventure with strong continuity and player agency",
      pacing: "establish the scene with narration first, preserve consequences, and offer structured choices only for combat, immediate danger, or explicit option requests",
      narrationRules: [
        "Preserve approved canon.",
        "Ask the user before making major player-character decisions.",
        "Track important names, places, items, relationships, and unresolved threads.",
      ],
      formattingRules: [
        "End most turns with solid narration or a direct prompt; reserve structured choices for combat, immediate danger, or explicit option requests.",
        "Separate proposed LoreKeeper updates from in-world narration.",
        "Use structured combat turns when stakes rise.",
      ],
    },
  });
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
