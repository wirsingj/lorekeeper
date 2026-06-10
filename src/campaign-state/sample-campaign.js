import { createEmptyCampaign } from "./schema.js";

export function createSampleCampaign() {
  return createEmptyCampaign({
    id: "veil-of-the-towers",
    title: "Veil of the Towers",
    summary:
      "A long-running fantasy campaign about hidden towers, shifting loyalties, and a party trying to keep memory intact while old powers wake.",
    people: [
      {
        id: "npc-mara-vell",
        name: "Mara Vell",
        type: "NPC",
        role: "tower archivist",
        status: "alive",
        locationId: "place-ashgate",
        notes: [
          "Knows more about the Veil than she admits.",
          "Protective of forbidden tower records.",
        ],
        tags: ["scholar", "guarded", "veil-lore"],
      },
      {
        id: "npc-captain-orren",
        name: "Captain Orren",
        type: "NPC",
        role: "city watch captain",
        status: "alive",
        locationId: "place-ashgate",
        notes: ["Wants public order more than truth."],
        tags: ["authority", "ashgate"],
      },
    ],
    party: [
      {
        id: "pc-elian",
        name: "Elian",
        playerRole: "primary hero",
        ancestryClass: "human ranger",
        status: "active",
        locationId: "place-ashgate",
        stats: {
          hp: { current: 24, max: 31 },
          abilities: ["tracking", "archery", "wildcraft"],
          spells: [],
        },
        notes: ["Has recurring dreams of a white tower under black rain."],
      },
      {
        id: "pc-nyra",
        name: "Nyra",
        playerRole: "companion",
        ancestryClass: "tiefling warlock",
        status: "active",
        locationId: "place-ashgate",
        stats: {
          hp: { current: 18, max: 26 },
          abilities: ["eldritch blast", "deception", "occult insight"],
          spells: ["hex", "armor of agathys"],
        },
        notes: ["Her patron reacts when tower sigils are nearby."],
      },
    ],
    factions: [
      {
        id: "faction-keepers",
        name: "The Lantern Keepers",
        type: "order",
        disposition: "uneasy ally",
        goals: ["Keep tower breaches contained", "Control public knowledge of the Veil"],
        notes: ["Mara Vell is connected to this faction."],
      },
      {
        id: "faction-ashen-court",
        name: "The Ashen Court",
        type: "occult faction",
        disposition: "hostile",
        goals: ["Open sealed tower paths", "Recover pre-Veil artifacts"],
        notes: ["Their agents use gray wax seals."],
      },
    ],
    places: [
      {
        id: "place-ashgate",
        name: "Ashgate",
        type: "city",
        region: "Eastern Marches",
        summary: "A rain-dark trade city built around old watchtowers and sealed catacombs.",
        notes: ["Current party location.", "Lantern Keepers maintain a hidden archive here."],
        connectedPlaceIds: ["place-archive", "place-east-road"],
      },
      {
        id: "place-archive",
        name: "The Lower Archive",
        type: "site",
        region: "Ashgate",
        summary: "A restricted archive below the old bell tower.",
        notes: ["Contains damaged maps of the Veil routes."],
        connectedPlaceIds: ["place-ashgate"],
      },
      {
        id: "place-east-road",
        name: "East Road",
        type: "route",
        region: "Eastern Marches",
        summary: "A muddy road leading toward abandoned tower country.",
        notes: ["Bandit activity has increased."],
        connectedPlaceIds: ["place-ashgate"],
      },
    ],
    maps: [
      {
        id: "map-ashgate",
        name: "Ashgate city map",
        placeId: "place-ashgate",
        fileRef: "maps/ashgate.png",
        notes: ["Placeholder reference for future campaign bundle asset handling."],
      },
    ],
    items: [
      {
        id: "item-gray-wax-seal",
        name: "Gray Wax Seal",
        type: "clue",
        status: "held",
        notes: ["Recovered from an Ashen Court courier."],
      },
      {
        id: "item-cracked-sigil",
        name: "Cracked Tower Sigil",
        type: "artifact",
        status: "held",
        notes: ["Warm to the touch near sealed tower paths."],
      },
    ],
    inventory: [
      {
        holderId: "pc-elian",
        itemId: "item-gray-wax-seal",
        quantity: 1,
        notes: "Wrapped in oilcloth.",
      },
      {
        holderId: "pc-nyra",
        itemId: "item-cracked-sigil",
        quantity: 1,
        notes: "Causes faint whispers during storms.",
      },
    ],
    lore: [
      {
        id: "lore-veil",
        title: "The Veil",
        canon: true,
        notes: [
          "The Veil hides or distorts paths to ancient towers.",
          "Records of the Veil are deliberately fragmented.",
        ],
        tags: ["world-canon", "towers"],
      },
      {
        id: "lore-gray-seals",
        title: "Gray Wax Seals",
        canon: true,
        notes: ["Used by Ashen Court agents to authenticate covert orders."],
        tags: ["factions", "clues"],
      },
    ],
    timeline: [
      {
        id: "event-001",
        session: "Session 1",
        happenedAt: "Campaign opening",
        summary: "The party arrived in Ashgate during a storm and found signs of tower magic.",
        involvedIds: ["pc-elian", "pc-nyra", "place-ashgate"],
      },
      {
        id: "event-002",
        session: "Session 2",
        happenedAt: "After the courier chase",
        summary: "The party recovered a gray wax seal from an Ashen Court courier.",
        involvedIds: ["pc-elian", "pc-nyra", "item-gray-wax-seal", "faction-ashen-court"],
      },
    ],
    quests: [
      {
        id: "quest-lower-archive",
        title: "Gain access to the Lower Archive",
        status: "active",
        stakes: "Mara may reveal how the gray seal connects to the tower routes.",
        openQuestions: [
          "What price will Mara ask for access?",
          "Is Captain Orren watching the party?",
        ],
        relatedIds: ["npc-mara-vell", "place-archive", "faction-keepers"],
      },
      {
        id: "quest-ashen-courier",
        title: "Identify the Ashen Court courier's contact",
        status: "unresolved",
        stakes: "The contact may expose the next tower breach.",
        openQuestions: ["Who was waiting for the courier in Ashgate?"],
        relatedIds: ["faction-ashen-court", "item-gray-wax-seal"],
      },
    ],
    relationships: [
      {
        id: "rel-mara-keepers",
        sourceId: "npc-mara-vell",
        targetId: "faction-keepers",
        type: "member",
        notes: "Likely senior archivist or oathbound agent.",
      },
      {
        id: "rel-party-orren",
        sourceId: "pc-elian",
        targetId: "npc-captain-orren",
        type: "watched_by",
        notes: "Orren suspects the party is tied to recent disturbances.",
      },
      {
        id: "rel-ashen-ashgate",
        sourceId: "faction-ashen-court",
        targetId: "place-ashgate",
        type: "infiltrating",
        notes: "At least one courier route passes through the city.",
      },
    ],
    scene: {
      status: "active_scene",
      currentPlaceId: "place-ashgate",
      nearbyPlaceIds: ["place-archive", "place-east-road"],
      presentPeopleIds: ["npc-mara-vell"],
      presentPartyMemberIds: ["pc-elian", "pc-nyra"],
      activeQuestIds: ["quest-lower-archive", "quest-ashen-courier"],
      localNotes: ["Rain is heavy.", "The archive door is guarded by a Lantern Keeper novice."],
      immediateSituation:
        "The party is waiting outside the Lower Archive while Mara decides whether to admit them.",
    },
  });
}

