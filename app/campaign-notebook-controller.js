import { isHiddenStoryThread } from "../src/context-packs/story-threads.js";
import { labelEntity } from "../src/campaign-state/formatters.js";

export function buildCampaignNotebookProjection(campaign = {}) {
  return {
    people: buildPeopleNotebookSection(campaign),
    places: buildPlacesNotebookSection(campaign),
    things: buildThingsNotebookSection(campaign),
    quests: buildQuestNotebookSection(campaign),
  };
}

export function buildPeopleNotebookSection(campaign = {}) {
  const records = collection(campaign.people).map((person) => ({
    domain: "people",
    record: person,
    title: person.name,
    subtitle: person.role || person.type || "person",
    body: detailLines([
      person.summary,
      ...(person.notes ?? []),
      person.locationId ? `Location: ${labelEntity(campaign, person.locationId)}` : "",
      person.relatedIds?.length ? `Related: ${person.relatedIds.map((id) => labelEntity(campaign, id)).join(", ")}` : "",
    ]),
  }));

  return {
    count: records.length,
    records,
    emptyText: "NPCs and contacts the table meets will appear here.",
  };
}

export function buildPlacesNotebookSection(campaign = {}) {
  const currentPlaceId = campaign.scene?.currentPlaceId;
  const records = [...collection(campaign.places)]
    .sort((a, b) => {
      if (a.id === currentPlaceId) return -1;
      if (b.id === currentPlaceId) return 1;
      return String(a.name ?? "").localeCompare(String(b.name ?? ""));
    })
    .map((place) => ({
      domain: "places",
      record: place,
      title: place.name,
      subtitle: place.id === currentPlaceId ? `${place.type || "place"} / current` : place.type || place.region || "place",
      body: detailLines([
        place.summary,
        place.region ? `Region: ${place.region}` : "",
        ...(place.notes ?? []),
        place.connectedPlaceIds?.length
          ? `Connected: ${place.connectedPlaceIds.map((id) => labelEntity(campaign, id)).join(", ")}`
          : "",
      ]),
    }));

  return {
    count: records.length,
    records,
    emptyText: "Current and discovered locations will appear here.",
  };
}

export function buildThingsNotebookSection(campaign = {}) {
  const items = collection(campaign.items);
  const records = [
    ...items.map((item) => ({
      id: item.id,
      domain: "items",
      record: item,
      title: item.name,
      subtitle: item.type || "item",
      body: detailLines([item.summary, ...(item.notes ?? [])]),
    })),
    ...collection(campaign.inventory).map((entry) => {
      const item = findRecord(items, entry.itemId);
      return {
        id: entry.id || entry.itemId,
        domain: "items",
        record: {
          ...(item ?? {}),
          id: item?.id ?? entry.itemId,
          name: entry.name || item?.name || entry.itemId,
          type: item?.type || "inventory",
          summary: detailLines([entry.notes, item?.summary]),
          notes: item?.notes ?? [],
        },
        title: entry.name || item?.name || entry.itemId,
        subtitle: `${entry.quantity ?? 1} carried by ${entry.carriedBy || entry.holderId || "party"}`,
        body: detailLines([entry.notes, item?.summary, ...(item?.notes ?? [])]),
      };
    }),
    ...collection(campaign.assets).map((asset) => ({
      id: asset.id,
      domain: "assets",
      record: asset,
      title: asset.name,
      subtitle: asset.kind || "asset",
      body: detailLines([asset.path, ...(asset.notes ?? [])]),
    })),
  ].sort((a, b) => String(a.title ?? "").localeCompare(String(b.title ?? "")));

  return {
    count: records.length,
    records,
    emptyText: "Items, clues, handouts, and assets will appear here.",
  };
}

export function buildQuestNotebookSection(campaign = {}) {
  const records = collection(campaign.quests)
    .filter((quest) => quest.status !== "completed")
    .filter((quest) => !isHiddenStoryThread(quest))
    .slice(0, 8)
    .map((quest) => ({
      domain: "quests",
      record: quest,
      title: quest.title,
      subtitle: quest.status || "thread",
      body: detailLines([
        quest.stakes,
        ...(quest.openQuestions ?? []).map((question) => `Open: ${question}`),
        quest.relatedIds?.length ? `Related: ${quest.relatedIds.map((id) => labelEntity(campaign, id)).join(", ")}` : "",
      ]),
    }));

  return {
    count: records.length,
    records,
    emptyText: "Open quests and unresolved story threads will appear here.",
  };
}

function collection(value) {
  return Array.isArray(value) ? value : [];
}

function findRecord(records, id) {
  return records.find((record) => record.id === id) ?? null;
}

function detailLines(values) {
  return values
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join(" ");
}
