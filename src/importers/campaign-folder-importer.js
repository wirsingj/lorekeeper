import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { createDefaultRulesProfile, createEmptyCampaign } from "../campaign-state/schema.js";

const TEXT_EXTENSIONS = new Set([".txt", ".md"]);
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);
const DOCUMENT_EXTENSIONS = new Set([".docx", ".pdf"]);
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".webm"]);

const PARTY_NAMES = new Map([
  ["oskar", "Oskar Bluez"],
  ["oskar bluez", "Oskar Bluez"],
  ["syrelia", "Syrelia Vaelora Bluez"],
  ["syrelia vaelora", "Syrelia Vaelora Bluez"],
  ["syrelia vaelora bluez", "Syrelia Vaelora Bluez"],
  ["sy", "Syrelia Vaelora Bluez"],
  ["thor", "Thoran Holt"],
  ["thoran", "Thoran Holt"],
  ["thoran holt", "Thoran Holt"],
  ["elendra", "Elendra Myris"],
  ["elendra myris", "Elendra Myris"],
  ["el", "Elendra Myris"],
  ["joren", "Joren Valehart"],
  ["joren valehart", "Joren Valehart"],
  ["dave", "Dave"],
  ["torrin", "Torrin"],
  ["kestrin", "Kestrin"],
  ["branek", "Branek Stonewatch"],
  ["branek stonewatch", "Branek Stonewatch"],
  ["rathar", "Rathar Stonekin"],
  ["rathar stonekin", "Rathar Stonekin"],
  ["kaelrin", "Kaelrin"],
  ["silva", "Silva"],
  ["hank", "Hank"],
]);

const FACTION_HINTS = [
  "Order of the Blue Lantern",
  "Silent Eye",
  "Lantern Guard",
  "Outer Watch",
  "Eastbound Company",
  "Company of the People",
  "Academy of Harmonic Weave",
];

const LOCATION_HINTS = [
  "City of Resonance",
  "Highmark Vale",
  "Highmark Vault",
  "Vault Antichamber",
  "Feidrend",
  "Caelvarin",
  "Vaskorath",
  "Thyraven Reach",
  "Lethora'kael",
  "Caelvarin Inner Passes",
  "Lethryn Vale",
  "Thyraven Reach",
  "Stonehome",
  "Stonehome Peaks",
  "Willowhollow",
  "Thornhollow",
  "Graymere",
  "Vaerhold",
  "Forest of Mirrors",
  "Ridgepeak Mountains",
  "Ridge Peak Mountains",
];

const ITEM_HINTS = [
  "Mirror Heart #1",
  "Mirror Heart #2",
  "Mirror Heart #3",
  "Unity Shard",
  "Traveler Stones",
  "Clarity Scroll",
  "Highmark Runes",
];

export async function importCampaignFolder(folderPath, options = {}) {
  const entries = await readCampaignFolder(folderPath);
  const sourceDocuments = await readSourceDocuments(entries.textFiles);
  const assets = entries.assetFiles.map(createAssetRecord);
  const extracted = extractStructuredCampaign(sourceDocuments);
  const title = options.title ?? inferCampaignTitle(sourceDocuments) ?? path.basename(folderPath);

  const campaign = createEmptyCampaign({
    id: slugify(title),
    title,
    summary: extracted.summary,
    people: extracted.people,
    party: extracted.party,
    factions: extracted.factions,
    places: extracted.places,
    maps: extracted.maps,
    items: extracted.items,
    inventory: extracted.inventory,
    lore: extracted.lore,
    timeline: extracted.timeline,
    quests: extracted.quests,
    relationships: extracted.relationships,
    scene: extracted.scene,
    combat: extracted.combat,
    rulesProfile: createDefaultRulesProfile(),
    style: extracted.style,
    sourceDocuments,
    assets,
  });

  return {
    campaign,
    importReport: {
      folderPath,
      importedAt: new Date().toISOString(),
      textFiles: sourceDocuments.length,
      assets: assets.length,
      extractedCounts: {
        people: campaign.people.length,
        party: campaign.party.length,
        factions: campaign.factions.length,
        places: campaign.places.length,
        items: campaign.items.length,
        lore: campaign.lore.length,
        timeline: campaign.timeline.length,
        quests: campaign.quests.length,
      },
      notes: [
        "Raw source documents are preserved for future review.",
        "Structured entities are first-pass guesses and should be reviewed before treating them as final canon.",
        "Later source files are ordered after earlier files so newer dumps can override older snapshots in future merge logic.",
      ],
    },
  };
}

async function readCampaignFolder(folderPath) {
  const files = await readCampaignFiles(folderPath);

  files.sort((a, b) => {
    const rank = inferSourceRank(a.name) - inferSourceRank(b.name);
    if (rank !== 0) {
      return rank;
    }

    const time = new Date(a.modifiedAt).getTime() - new Date(b.modifiedAt).getTime();
    return time === 0 ? a.name.localeCompare(b.name) : time;
  });

  return {
    textFiles: files.filter((file) => TEXT_EXTENSIONS.has(file.extension)),
    assetFiles: files.filter(
      (file) =>
        IMAGE_EXTENSIONS.has(file.extension) ||
        DOCUMENT_EXTENSIONS.has(file.extension) ||
        VIDEO_EXTENSIONS.has(file.extension),
    ),
  };
}

async function readCampaignFiles(folderPath, basePath = folderPath) {
  const dirents = await readdir(folderPath, { withFileTypes: true });
  const files = [];

  for (const dirent of dirents) {
    const filePath = path.join(folderPath, dirent.name);
    if (dirent.isDirectory()) {
      files.push(...await readCampaignFiles(filePath, basePath));
      continue;
    }
    if (!dirent.isFile()) {
      continue;
    }

    const fileStat = await stat(filePath);
    const extension = path.extname(dirent.name).toLowerCase();
    files.push({
      name: path.relative(basePath, filePath),
      path: filePath,
      extension,
      size: fileStat.size,
      modifiedAt: fileStat.mtime.toISOString(),
    });
  }

  return files;
}

async function readSourceDocuments(textFiles) {
  return Promise.all(
    textFiles.map(async (file, index) => ({
      id: `source-${String(index + 1).padStart(3, "0")}-${slugify(file.name.replace(file.extension, ""))}`,
      name: file.name,
      path: file.path,
      kind: "continuity_dump",
      mediaType: "text/plain",
      size: file.size,
      modifiedAt: file.modifiedAt,
      sourceOrder: index + 1,
      content: await readFile(file.path, "utf8"),
    })),
  );
}

function createAssetRecord(file) {
  const kind = IMAGE_EXTENSIONS.has(file.extension)
    ? "image"
    : DOCUMENT_EXTENSIONS.has(file.extension)
      ? "document"
      : VIDEO_EXTENSIONS.has(file.extension)
        ? "video"
        : "asset";

  return {
    id: `asset-${slugify(file.name.replace(file.extension, ""))}`,
    name: file.name,
    path: file.path,
    kind,
    extension: file.extension,
    size: file.size,
    modifiedAt: file.modifiedAt,
    notes: [],
  };
}

function extractStructuredCampaign(sourceDocuments) {
  const combined = sourceDocuments.map((doc) => `\n\n# Source: ${doc.name}\n${doc.content}`).join("\n");
  const canonText = prioritizedCanonText(sourceDocuments);
  const sceneSource = selectSceneSource(sourceDocuments)?.content ?? sourceDocuments.at(-1)?.content ?? canonText;
  const scene = extractScene(sceneSource, canonText);

  return {
    summary: extractSummary(canonText),
    party: extractParty(canonText),
    people: extractPeople(canonText),
    factions: extractHintRecords(canonText, FACTION_HINTS, "faction"),
    places: ensureScenePlace(extractPlaces(canonText), scene),
    maps: [],
    items: extractItems(canonText),
    inventory: extractInventory(canonText),
    lore: extractLore(combined),
    timeline: extractTimeline(combined),
    quests: extractQuests(canonText),
    relationships: extractRelationships(canonText),
    scene,
    combat: extractCombat(canonText),
    style: extractStyle(canonText),
  };
}

function prioritizedCanonText(sourceDocuments) {
  return [...sourceDocuments]
    .sort((a, b) => canonPriority(a.name) - canonPriority(b.name))
    .map((doc) => `\n\n# Source: ${doc.name}\n${doc.content}`)
    .join("\n");
}

function canonPriority(name) {
  const normalized = name.toLowerCase().replace(/\\/g, "/");
  if (normalized.endsWith("markdown/17_next_session_state.md")) return 0;
  if (normalized.endsWith("markdown/01_current_state.md")) return 1;
  if (normalized.endsWith("markdown/16_canon_corrections_and_deprecated_names.md")) return 2;
  if (normalized.endsWith("markdown/18_lorekeeper_condensed_import.md")) return 3;
  if (normalized.endsWith("markdown/10_current_arc_caelvarin.md")) return 4;
  if (normalized.endsWith("markdown/11_current_arc_westbound_thyraven.md")) return 5;
  if (normalized.includes("vott_lorekeeper_full_import.md")) return 6;
  if (normalized.includes("/markdown/")) return 20;
  if (normalized.includes("source_refs/")) return 80;
  return 100;
}

function extractSummary(text) {
  const currentScene = findSectionLines(text, ["Current party and location", "Current exact scene"])
    .slice(0, 3)
    .join(" ");
  if (currentScene) {
    return currentScene;
  }

  const status = findSectionLines(text, ["CURRENT STATUS", "CURRENT TIMELINE", "CURRENT STATUS MOVING INTO NEXT CHAT WINDOW"])
    .slice(0, 8)
    .join(" ");

  return (
    status ||
    "Veil of the Towers is a long-running D&D-style campaign about restoring tower harmonics, founding the Order of the Blue Lantern, and preserving continuity as the world enters the Fifth Age: The Awakened Veil."
  );
}

function extractParty(text) {
  const records = [];

  for (const [key, canonicalName] of PARTY_NAMES.entries()) {
    if (!new RegExp(`\\b${escapeRegExp(key)}\\b`, "i").test(text)) {
      continue;
    }

    const description = findDescriptionForName(text, canonicalName) ?? findDescriptionForName(text, key) ?? "";
    const isPrimaryPlayerCharacter = canonicalName.startsWith("Oskar");
    records.push({
      id: `pc-${slugify(canonicalName)}`,
      name: canonicalName,
      type: isPrimaryPlayerCharacter ? "player_character" : "party_member",
      playerRole: isPrimaryPlayerCharacter ? "primary player character" : "party member",
      controllerKind: isPrimaryPlayerCharacter ? "host" : "ai_companion",
      controllerId: isPrimaryPlayerCharacter ? "host" : null,
      fallbackControllerKind: isPrimaryPlayerCharacter ? "host" : "ai_companion",
      ancestryClass: inferAncestryClass(description),
      status: "active",
      locationId: null,
      stats: extractStats(description),
      notes: uniqueStrings([description].filter(Boolean)),
      source: "imported-continuity-dumps",
    });
  }

  return uniqueById(records);
}

function extractPeople(text) {
  const names = [
    "Sister Nira",
    "Kaelrin",
    "Rathar Stonekin",
    "Silva",
    "Dave",
    "Hank",
    "Larry",
    "Lord Marshal Harrin Vale",
    "Councilor Renwick",
    "Highmark Scribe",
    "Highmark Court Mage Eramine Valdren",
    "Erenn",
    "Brunna",
    "Elaia",
    "Torun",
    "Eiran",
    "Amariel Vaelora",
    "Vaelorin Vaelora",
    "Sage Aelthas",
    "Forge Master Dhurin",
    "Mayor Harrow",
    "Lysa",
    "Harven",
  ];

  return names
    .filter((name) => text.includes(name))
    .map((name) => {
      const description = findDescriptionForName(text, name) ?? "";
      return {
        id: `npc-${slugify(name)}`,
        name,
        type: inferPersonType(description),
        role: description || "Imported campaign figure.",
        status: inferStatus(description),
        locationId: inferLocationId(description),
        notes: description ? [description] : [],
        tags: inferTags(description),
        source: "imported-continuity-dumps",
      };
    });
}

function extractPlaces(text) {
  const places = extractHintRecords(text, LOCATION_HINTS, "place").map((place) => ({
    ...place,
    type: inferPlaceType(place.notes.join(" ")),
    region: "",
    summary: place.notes[0] ?? "Imported campaign location.",
    connectedPlaceIds: [],
  }));

  if (/Caelvarin['’]s inner passes|living forest roads|inner passes/i.test(text)) {
    places.unshift({
      id: "place-caelvarin-inner-passes",
      name: "Caelvarin Inner Passes",
      type: "region",
      region: "Caelvarin",
      summary: "Living forest roads and inner passes where the Company recently cleansed a corrupted Resonance Warden.",
      connectedPlaceIds: ["place-caelvarin", "place-lethryn-vale"],
      notes: [
        "Living forest roads and inner passes where the Company recently cleansed a corrupted Resonance Warden.",
        ...findNearbySentences(text, "inner passes", 2),
      ],
      source: "imported-current-canon",
    });
  }

  return uniqueById(places);
}

function extractItems(text) {
  return extractHintRecords(text, ITEM_HINTS, "item").map((item) => ({
    ...item,
    type: inferItemType(item.name),
    status: inferItemStatus(text, item.name),
  }));
}

function extractInventory(text) {
  const entries = [];

  if (/Mirror Heart #1/i.test(text) && /Sy/i.test(text)) {
    entries.push({
      holderId: "pc-syrelia-vaelora-bluez",
      itemId: "item-mirror-heart-1",
      quantity: 1,
      notes: "Imported from continuity dumps: carried by Sy or tied to Sy's possession.",
    });
  }

  if (/Mirror Heart #2/i.test(text) && /Academy lockbox/i.test(text)) {
    entries.push({
      holderId: "place-city-of-resonance",
      itemId: "item-mirror-heart-2",
      quantity: 1,
      notes: "Secured in Academy lockbox.",
    });
  }

  if (/Mirror Heart #3/i.test(text) && /Highmark/i.test(text)) {
    entries.push({
      holderId: "place-highmark-vale",
      itemId: "item-mirror-heart-3",
      quantity: 1,
      notes: "In Highmark Vale / wrapped for transport depending on latest arc state.",
    });
  }

  return entries;
}

function extractLore(text) {
  const loreHints = [
    "The Six Towers",
    "The Silencing Veil",
    "The Awakened Veil",
    "Runes",
    "Weaving / Threadbinding",
    "Neural Resonance Addendum",
    "Mirror Hearts",
    "Unity magic",
    "Resonant Code",
    "Fifth Age",
  ];

  return loreHints
    .filter((hint) => new RegExp(escapeRegExp(hint), "i").test(text))
    .map((hint) => ({
      id: `lore-${slugify(hint)}`,
      title: hint,
      canon: true,
      notes: findNearbySentences(text, hint, 3),
      tags: ["imported", "world-canon"],
    }));
}

function extractTimeline(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const eventLines = lines.filter(
    (line) =>
      /completed|arrived|founded|stabilized|rescued|recovered|negotiations begin|battle|investigating|preparations/i.test(
        line,
      ) && line.length < 180,
  );

  return uniqueStrings(eventLines).slice(-20).map((line, index) => ({
    id: `event-import-${String(index + 1).padStart(3, "0")}`,
    session: "Imported continuity",
    happenedAt: "Unknown imported order",
    summary: line,
    involvedIds: [],
  }));
}

function extractQuests(text) {
  const questLines = [
    ...findSectionLines(text, ["ACTIVE QUEST THREADS", "CURRENT GOALS", "Next Steps", "Current open options", "Major future threads"]),
    ...text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => /Mission|Buried Force|Mirror Heart|Ridgepeak|Highmark|Construct Development|City Expansion|Caelvarin|Thyraven|Florryn|Lethora|watcher|Warden|Circle/i.test(line)),
  ];

  return uniqueStrings(questLines)
    .filter((line) => line.length > 8 && line.length < 220)
    .filter((line) => !/^(Primary Objectives|Secondary Objectives|Next Steps|Current Goals|Active Quest Threads|Await intelligence:)$/i.test(line))
    .slice(0, 18)
    .map((line, index) => {
      const [title, rest] = splitDashLine(line);
      return {
        id: `quest-${String(index + 1).padStart(3, "0")}-${slugify(title).slice(0, 36)}`,
        title,
        status: /completed|dealt with/i.test(line) ? "completed" : "active",
        stakes: rest || line,
        openQuestions: inferOpenQuestions(line),
        relatedIds: [],
      };
    });
}

function extractRelationships(text) {
  const relationships = [];

  if (/Oskar[\s\S]{0,120}Sy|Sy[\s\S]{0,120}Oskar/i.test(text)) {
    relationships.push({
      id: "rel-oskar-sy",
      sourceId: "pc-oskar-bluez",
      targetId: "pc-syrelia-vaelora-bluez",
      type: "married",
      notes: "Oskar and Sy are newly wed; their bond is central to the campaign tone.",
    });
  }

  if (/Thor[\s\S]{0,120}El|El[\s\S]{0,120}Thor/i.test(text)) {
    relationships.push({
      id: "rel-thor-el",
      sourceId: "pc-thoran-holt",
      targetId: "pc-elendra-myris",
      type: "budding_romance",
      notes: "Thor and El have a soft, visible but not fully declared romance.",
    });
  }

  if (/Joren[\s\S]{0,120}Silva|Silva[\s\S]{0,120}Joren/i.test(text)) {
    relationships.push({
      id: "rel-joren-silva",
      sourceId: "pc-joren-valehart",
      targetId: "npc-silva",
      type: "scouting_partnership",
      notes: "Joren and Silva coordinate naturally with warm professional trust.",
    });
  }

  return relationships;
}

function extractScene(latest, combined) {
  const latestSceneLines = findSectionLines(latest, [
    "Next Session State",
    "Immediate Resume",
    "Current party and location",
    "Current exact scene",
    "CURRENT STATUS MOVING INTO NEXT CHAT WINDOW",
    "Most Recent Scene",
    "NEXT STARTING SCENE",
  ]);
  const immediateSituation = latestSceneLines.join(" ") || "Imported campaign is ready for the next scene.";
  const currentPlaceId = inferCurrentPlaceId(latest, combined);

  return {
    status: "active_scene",
    currentPlaceId,
    nearbyPlaceIds: inferNearbyPlaceIds(latest, currentPlaceId),
    presentPeopleIds: ["npc-sister-nira", "npc-rathar-stonekin", "npc-silva", "npc-kaelrin"].filter((id) =>
      latest.includes(idToLikelyName(id)),
    ),
    presentPartyMemberIds: [
      "pc-oskar-bluez",
      "pc-syrelia-vaelora-bluez",
      "pc-thoran-holt",
      "pc-elendra-myris",
      "pc-joren-valehart",
      "pc-dave",
      "pc-torrin",
      "pc-kestrin",
      "pc-branek-stonewatch",
    ].filter((id) => combined.includes(idToLikelyName(id)) || id === "pc-oskar-bluez"),
    activeQuestIds: [],
    localNotes: latestSceneLines.slice(0, 6),
    immediateSituation,
  };
}

function selectSceneSource(sourceDocuments) {
  const sceneMarkers = [
    "Next Session State",
    "Immediate Resume",
    "Current party and location",
    "Current exact scene",
    "CURRENT STATUS MOVING INTO NEXT CHAT WINDOW",
    "Most Recent Scene",
    "NEXT STARTING SCENE",
  ];

  return [...sourceDocuments]
    .sort((a, b) => canonPriority(a.name) - canonPriority(b.name))
    .find((doc) => sceneMarkers.some((marker) => doc.content.toLowerCase().includes(marker.toLowerCase())));
}

function inferCurrentPlaceId(latest, combined) {
  const text = `${latest}\n${combined}`;
  if (/Caelvarin['’]s inner passes|living forest roads|inner passes/i.test(text)) {
    return "place-caelvarin-inner-passes";
  }
  if (/Caelvarin/i.test(text)) {
    return "place-caelvarin";
  }
  if (/Thyraven/i.test(text)) {
    return "place-thyraven-reach";
  }
  if (/Highmark/i.test(latest)) {
    return "place-highmark-vale";
  }
  return "place-city-of-resonance";
}

function inferNearbyPlaceIds(latest, currentPlaceId) {
  if (currentPlaceId === "place-caelvarin-inner-passes") {
    return ["place-caelvarin", "place-lethryn-vale"];
  }
  if (/Highmark Vault/i.test(latest)) {
    return ["place-highmark-vault", "place-vault-antichamber"];
  }
  return [];
}

function ensureScenePlace(places, scene) {
  if (!scene?.currentPlaceId || places.some((place) => place.id === scene.currentPlaceId)) {
    return places;
  }
  const name = scene.currentPlaceId
    .replace(/^place-/, "")
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
  return [
    ...places,
    {
      id: scene.currentPlaceId,
      name,
      type: "place",
      region: "",
      summary: scene.immediateSituation || "Imported current scene location.",
      connectedPlaceIds: [],
      notes: scene.localNotes ?? [],
      source: "imported-current-scene",
    },
  ];
}

function extractCombat(text) {
  return {
    inCombat: /fight occurred|battle|initiative|multi-target fight/i.test(text),
    round: null,
    initiative: [],
    enemies: /resonance-wraiths|abominations/i.test(text)
      ? [
          {
            id: "enemy-resonance-wraiths",
            name: "Resonance-wraiths and heart-tethered abominations",
            hp: null,
            notes: "Imported from Highmark vault battle summary.",
          },
        ]
      : [],
    conditions: [],
    stakes: "Track real rolls, HP, conditions, and canon consequences when combat or major events occur.",
    turnFormat:
      "For stakes/combat: show character, HP when known, 3-5 options for non-Oskar characters, chosen action, rolls, result, HP/condition updates, and narration.",
    preferences: [
      "Turn-based when stakes rise, especially combat.",
      "Real rolls; no fudging.",
      "The user chooses for Oskar; the AI can choose for others unless asked otherwise.",
      "Continuity always honored.",
    ],
  };
}

function extractStyle(text) {
  const toneLines = findSectionLines(text, ["Tone & Rules", "General Tone for This Arc"]).slice(0, 12);

  return {
    tone: "warm character-driven fantasy with rising mythic stakes, grounded humor, and continuity-first D&D play",
    pacing: "scene-forward with explicit turns when stakes rise",
    narrationRules: uniqueStrings([
      "Continuity always honored.",
      "Resonance magic is mystic, not scientific.",
      "Humor should stay grounded in character voices.",
      "Warmth and relationship texture matter as much as plot mechanics.",
      ...toneLines,
    ]),
    formattingRules: [
      "Use turn-based format when stakes rise, especially combat.",
      "Use real rolls and show results when resolving mechanics.",
      "The user chooses for Oskar; provide options for other characters when appropriate.",
      "Separate mechanical updates from narration when HP, items, quests, or canon changes.",
    ],
  };
}

function extractHintRecords(text, hints, domain) {
  return hints
    .filter((hint) => new RegExp(escapeRegExp(hint), "i").test(text))
    .map((hint) => ({
      id: `${domain}-${slugify(hint)}`,
      name: hint,
      notes: findNotesForHint(text, hint, 3),
      source: "imported-continuity-dumps",
    }));
}

function inferCampaignTitle(sourceDocuments) {
  for (const doc of sourceDocuments) {
    const match = doc.content.match(/VEIL OF THE TOWERS/i);
    if (match) {
      return "Veil of the Towers";
    }
  }

  return null;
}

function findDescriptionForName(text, name) {
  const headingDescription = findMarkdownDescriptionForName(text, name);
  if (headingDescription) {
    return headingDescription;
  }

  const directLine = findCleanLineForName(text, name);
  if (directLine) {
    return directLine;
  }

  const escaped = escapeRegExp(name);
  const patterns = [
    new RegExp(`^\\s*${escaped}\\s+[|—-]\\s+(.+)$`, "im"),
    new RegExp(`^\\s*${escaped}\\s+(.{12,180})$`, "im"),
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return cleanLine(match[1]);
    }
  }

  const nearby = findNearbySentences(text, name, 1);
  return nearby[0] ?? "";
}

function findMarkdownDescriptionForName(text, name) {
  const lines = text.split(/\r?\n/);
  const targetTokens = tokenizeName(name);

  for (let index = 0; index < lines.length; index += 1) {
    const heading = parseMarkdownHeading(lines[index]);
    if (!heading || !headingMatchesName(heading, targetTokens)) {
      continue;
    }

    const paragraph = firstParagraphAfterHeading(lines, index + 1);
    if (paragraph) {
      return paragraph;
    }
  }

  return null;
}

function parseMarkdownHeading(line) {
  const match = String(line).match(/^\s*#{1,6}\s+(.+?)\s*#*\s*$/);
  return match?.[1] ? cleanLine(match[1]) : null;
}

function headingMatchesName(heading, targetTokens) {
  if (targetTokens.length === 0) {
    return false;
  }
  const headingTokens = new Set(tokenizeName(heading));
  return targetTokens.every((token) => headingTokens.has(token));
}

function firstParagraphAfterHeading(lines, startIndex) {
  const paragraph = [];

  for (let index = startIndex; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const line = cleanLine(rawLine);

    if (!line) {
      if (paragraph.length > 0) {
        break;
      }
      continue;
    }

    if (parseMarkdownHeading(rawLine) || looksLikeHeading(line)) {
      break;
    }

    paragraph.push(line);
  }

  return cleanLine(paragraph.join(" ")) || null;
}

function findCleanLineForName(text, name) {
  const lowerName = name.toLowerCase();
  const nameParts = lowerName.split(/\s+/).filter(Boolean);
  const lines = text
    .split(/\r?\n/)
    .map((rawLine) => ({
      rawLine,
      line: cleanLine(rawLine),
    }))
    .filter(({ rawLine, line }) => line && line.length < 360 && !parseMarkdownHeading(rawLine));

  for (const { line } of lines) {
    const lowerLine = line.toLowerCase();
    if (!lowerLine.includes(lowerName) && !nameParts.every((part) => lowerLine.includes(part))) {
      continue;
    }
    const nameIndex = lowerLine.indexOf(lowerName);
    const partIndexes = nameParts
      .map((part) => lowerLine.indexOf(part))
      .filter((partIndex) => partIndex >= 0);
    const firstNameIndex = nameIndex >= 0 ? nameIndex : Math.min(...partIndexes);

    if (firstNameIndex > 80) {
      continue;
    }
    const afterName = nameIndex >= 0
      ? line.slice(nameIndex + name.length)
      : line.slice(Math.max(...nameParts.map((part) => lowerLine.indexOf(part) + part.length)));
    const cleanedAfterName = cleanLine(afterName.replace(/^[\s:|—–-]+/, ""));
    if (cleanedAfterName) {
      return cleanedAfterName;
    }
  }

  return null;
}

function tokenizeName(value) {
  return String(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/["'`]/g, " ")
    .replace(/[^\w\s-]/g, " ")
    .split(/[\s-]+/)
    .filter(Boolean);
}

function findNearbySentences(text, term, count) {
  const index = text.toLowerCase().indexOf(term.toLowerCase());
  if (index === -1) {
    return [];
  }

  const start = Math.max(0, index - 220);
  const end = Math.min(text.length, index + 420);
  const chunk = text.slice(start, end);
  const lines = chunk
    .split(/\r?\n/)
    .map(cleanLine)
    .filter((line) => line.length > 0 && !/^[#=*_ -]+$/.test(line));

  const termLines = lines.filter((line) => line.toLowerCase().includes(term.toLowerCase()));
  return uniqueStrings(termLines.length ? termLines : lines).slice(0, count);
}

function findNotesForHint(text, hint, count) {
  const headingBlock = findHeadingBlock(text, hint, count);
  if (headingBlock.length > 0) {
    return headingBlock;
  }

  const directLine = findDirectLine(text, hint);
  if (directLine) {
    return [directLine];
  }

  return findNearbySentences(text, hint, count);
}

function findHeadingBlock(text, hint, count) {
  const lines = text.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const cleaned = cleanLine(lines[index]);
    const normalizedHeading = cleaned.replace(/[:：]$/, "").toLowerCase();

    if (normalizedHeading !== hint.toLowerCase()) {
      continue;
    }

    const notes = [];
    for (let cursor = index + 1; cursor < lines.length && notes.length < count; cursor += 1) {
      const note = cleanLine(lines[cursor]);
      if (!note) {
        continue;
      }

      if (looksLikeHeading(note) && notes.length > 0) {
        break;
      }

      notes.push(note);
    }

    return notes;
  }

  return [];
}

function findDirectLine(text, hint) {
  const escaped = escapeRegExp(hint);
  const linePattern = new RegExp(`^\\s*${escaped}\\s*(?:[(:].*?[)]?)?\\s*(?:[—-]|:)\\s*(.+)$`, "im");
  const match = text.match(linePattern);
  return match?.[1] ? cleanLine(match[1]) : null;
}

function looksLikeHeading(line) {
  return (
    /^#{1,6}\s/.test(line) ||
    /^[IVX]+\.\s/.test(line) ||
    /^SECTION\s+[IVX]+/i.test(line) ||
    /^\d+\.\s[A-Z]/.test(line) ||
    /^[A-Z][A-Z\s,&/-]{6,}$/.test(line)
  );
}

function findSectionLines(text, sectionNames) {
  const lines = text.split(/\r?\n/);
  const matches = [];
  let collecting = false;
  let blankCount = 0;

  for (const line of lines) {
    const cleaned = cleanLine(line);
    const isRequestedHeading = sectionNames.some((section) => cleaned.toLowerCase().includes(section.toLowerCase()));
    const looksLikeNextMajorHeading = /^#{1,6}\s|^[IVX]+\.\s|^SECTION\s+[IVX]+|^\d+\.\s[A-Z]/.test(cleaned);

    if (isRequestedHeading) {
      collecting = true;
      blankCount = 0;
      continue;
    }

    if (!collecting) {
      continue;
    }

    if (!cleaned) {
      blankCount += 1;
      if (blankCount >= 3) {
        break;
      }
      continue;
    }

    if (looksLikeNextMajorHeading && matches.length > 0) {
      break;
    }

    blankCount = 0;
    matches.push(cleaned);
  }

  return matches;
}

function inferAncestryClass(description) {
  const lower = description.toLowerCase();
  if (lower.includes("dwarf") && lower.includes("cleric")) return "dwarf life cleric";
  if (lower.includes("elven") && lower.includes("weaver")) return "elven weaver-scholar";
  if (lower.includes("half-elf") && lower.includes("ranger")) return "half-elf ranger/scout";
  if (lower.includes("halfling")) return "halfling porter/cook";
  if (lower.includes("rune construct")) return "rune construct";
  if (lower.includes("dwarven mason") || (lower.includes("dwarven") && lower.includes("mercenary"))) {
    return "dwarven mason/mercenary";
  }
  if (lower.includes("elven cartographer")) return "elven cartographer/alchemist";
  if (lower.includes("young lantern guard")) return "young Lantern Guard scout";
  if (lower.includes("older lantern guard")) return "Lantern Guard veteran";
  if (lower.includes("fighter")) return "human fighter";
  if (lower.includes("ranger")) return "human ranger";
  if (lower.includes("scholar")) return "scholar / weaver";
  return description.split(/[.;]/)[0] || "unknown";
}

function extractStats(description) {
  const hpMatch = description.match(/HP\s+(\d+)\s*\/\s*(\d+)/i);
  return {
    hp: hpMatch ? { current: Number(hpMatch[1]), max: Number(hpMatch[2]) } : null,
    abilities: inferAbilities(description),
    spells: inferSpells(description),
  };
}

function inferAbilities(description) {
  const abilities = [];
  if (/cleric/i.test(description)) abilities.push("cleric magic", "grounding runes");
  if (/weaver|resonance/i.test(description)) abilities.push("resonance weaving");
  if (/fighter|frontline/i.test(description)) abilities.push("frontline tactics");
  if (/ranger|scout/i.test(description)) abilities.push("scouting");
  return abilities;
}

function inferSpells(description) {
  const spells = [];
  if (/Guiding Bolt/i.test(description)) spells.push("Guiding Bolt");
  if (/Cure Wounds/i.test(description)) spells.push("Cure Wounds");
  if (/Magic Missile|missiles/i.test(description)) spells.push("Magic Missile");
  return spells;
}

function inferPersonType(description) {
  if (/construct/i.test(description)) return "construct";
  if (/cleric|mage|weaver|ranger|fighter|dwarf|elf|human|half-elf/i.test(description)) return "NPC";
  return "campaign figure";
}

function inferStatus(description) {
  if (/missing/i.test(description)) return "missing";
  if (/recovering|repair/i.test(description)) return "recovering";
  if (/captive|prisoner/i.test(description)) return "captive";
  return "active";
}

function inferLocationId(description) {
  if (/Highmark/i.test(description)) return "place-highmark-vale";
  if (/City of Resonance|city/i.test(description)) return "place-city-of-resonance";
  return null;
}

function inferTags(description) {
  const tags = [];
  if (/resonance|weave|magic|rune/i.test(description)) tags.push("resonance");
  if (/guard|captain|fighter|mercenary/i.test(description)) tags.push("martial");
  if (/diplomat|mayor|council/i.test(description)) tags.push("politics");
  return tags;
}

function inferPlaceType(notes) {
  if (/continent/i.test(notes)) return "continent";
  if (/city|capital|stronghold/i.test(notes)) return "city";
  if (/vault|antichamber|forge|inn|hall/i.test(notes)) return "site";
  if (/mountains|forest|reach|vale/i.test(notes)) return "region";
  return "place";
}

function inferItemType(name) {
  if (/Heart|Shard|Scroll/i.test(name)) return "artifact";
  if (/Rune|Stone/i.test(name)) return "magical tool";
  return "item";
}

function inferItemStatus(text, name) {
  const notes = findNearbySentences(text, name, 3).join(" ");
  if (/carried|possession|wrapped/i.test(notes)) return "held";
  if (/lockbox|vault|safeguarded/i.test(notes)) return "stored";
  return "known";
}

function inferOpenQuestions(line) {
  const questions = [];
  if (/Highmark|Mirror Heart/i.test(line)) questions.push("Will Highmark release custody of the third Mirror Heart?");
  if (/Buried Force|Ridgepeak/i.test(line)) questions.push("What is the entity beneath Ridgepeak and how can it be calmed?");
  return questions;
}

function inferSourceRank(name) {
  const normalized = name.toLowerCase();
  const mainMatch = normalized.match(/\bvott(\d+)\b/);
  if (mainMatch) {
    return Number(mainMatch[1]) * 100;
  }

  const nuanceMatch = normalized.match(/\bvott_n(\d+)\b/);
  if (nuanceMatch) {
    return 700 + Number(nuanceMatch[1]) * 10;
  }

  if (normalized.includes("world")) {
    return 50;
  }

  return 1000;
}

function splitDashLine(line) {
  const parts = line.split(/\s+[—-]\s+/);
  if (parts.length >= 2) {
    return [cleanLine(parts[0]), cleanLine(parts.slice(1).join(" - "))];
  }

  return [cleanLine(line), ""];
}

function idToLikelyName(id) {
  return id
    .replace(/^npc-/, "")
    .replace(/^pc-/, "")
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function cleanLine(line) {
  return String(line)
    .replace(/\t+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[•–-]\s*/, "")
    .trim();
}

function uniqueStrings(values) {
  const seen = new Set();
  return values.filter((value) => {
    const key = value.toLowerCase();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function uniqueById(records) {
  const seen = new Set();
  return records.filter((record) => {
    if (seen.has(record.id)) {
      return false;
    }
    seen.add(record.id);
    return true;
  });
}

function slugify(value) {
  return String(value)
    .normalize("NFKD")
    .replace(/[^\w\s#-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/#/g, "")
    .replace(/[_\s]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
