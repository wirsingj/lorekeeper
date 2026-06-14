const openings = [
  {
    title: "Bar Fight",
    place: "Tavern",
    tone: "rowdy tavern trouble, grounded stakes, room to de-escalate or throw hands",
    premise: "Open in a crowded roadside tavern where a drunk miner is picking a fight with the wrong table. Start with social tension, clear NPC motives, and an immediate but not forced choice.",
  },
  {
    title: "Road Ambush",
    place: "Mining road",
    tone: "dusty road tension, practical danger, reluctant allies",
    premise: "Open on a mining road where a guarded merchant wagon is blocked by rough locals who claim the road is closed for a reason nobody wants to explain.",
  },
  {
    title: "Night Watch",
    place: "City gate",
    tone: "quiet dread, watch-post duty, slow-burn discovery",
    premise: "Open during a late city-wall watch as something moves beyond the lantern line. Let the first beat be observation and judgment before danger becomes certain.",
  },
  {
    title: "Market Debt",
    place: "Rainy market",
    tone: "street-level intrigue, debts, favors, sharp dialogue",
    premise: "Open in a rainy market where a nervous shopkeeper recognizes the player character and asks for help before a collector arrives.",
  },
  {
    title: "Ruined Shrine",
    place: "Old shrine road",
    tone: "mystery exploration, old vows, uncanny but grounded signs",
    premise: "Open beside a half-buried shrine on a forest road. A fresh offering sits on the stones, but there are no recent footprints nearby.",
  },
  {
    title: "River Crossing",
    place: "Flooded ferry landing",
    tone: "travel problem, local politics, weather pressure",
    premise: "Open at a flooded ferry landing where stranded travelers argue over the last safe crossing before nightfall.",
  },
];

const characters = [
  {
    name: "Garren",
    ancestry: "Human",
    characterClass: "Fighter",
    level: "2",
    concept: "A practical caravan guard with a dry sense of humor, a protective streak, and one unpaid debt he keeps pretending does not matter.",
  },
  {
    name: "Thora",
    ancestry: "Dwarf",
    characterClass: "Fighter",
    level: "2",
    concept: "A steady shield-hand and former mine guard who prefers solving problems loudly but knows when a room needs restraint.",
  },
  {
    name: "Mira",
    ancestry: "Halfling",
    characterClass: "Rogue",
    level: "2",
    concept: "A nimble courier with too many friends, too many routes through locked doors, and a habit of helping people before thinking it through.",
  },
  {
    name: "Rowan",
    ancestry: "Elf",
    characterClass: "Ranger",
    level: "2",
    concept: "A watchful road-scout who reads tracks better than faces and is looking for the person who sabotaged their last expedition.",
  },
  {
    name: "Ilyra",
    ancestry: "Half-elf",
    characterClass: "Bard",
    level: "2",
    concept: "A sharp-tongued performer with court gossip in her pockets and a quiet fear that one song she learned was actually a warning.",
  },
  {
    name: "Bram",
    ancestry: "Human",
    characterClass: "Cleric",
    level: "2",
    concept: "A field medic with a battered holy symbol, a patient voice, and a bad habit of standing between fools and consequences.",
  },
];

export function randomDevJumpStart(seed = Math.random) {
  const opening = pick(openings, seed);
  const character = pick(characters, seed);
  const suffix = Math.floor(seed() * 900 + 100);
  return {
    title: `${opening.title} ${suffix}`,
    premise: opening.premise,
    startingLocation: opening.place,
    tone: opening.tone,
    playerCharacter: {
      ...character,
      autoSheet: true,
    },
  };
}

function pick(items, seed) {
  return items[Math.floor(seed() * items.length) % items.length];
}

