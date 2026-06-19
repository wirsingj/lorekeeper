import { labelEntity } from "../src/campaign-state/formatters.js";
import { buildSceneRetrieval } from "../src/engine/scene-engine.js";

export function buildSceneIntelligenceProjection(campaign = {}) {
  const retrieval = buildSceneRetrieval(campaign);
  const scene = retrieval.scene;
  const tensions = scene?.tensions ?? campaign.scene?.tensions ?? [];
  const consequences = retrieval.activeConsequences;
  const hasFirstClassScene = Boolean(
    campaign.scene?.activeSceneId || (campaign.scenes ?? []).some((record) => record.status === "active"),
  );
  const hasDetails = Boolean(hasFirstClassScene || tensions.length || consequences.length);
  return {
    visible: hasDetails,
    title: scene?.title || "Current scene",
    tensionText: tensions.length ? `Tension: ${tensions.slice(0, 2).join("; ")}` : "",
    consequenceText: consequences.length
      ? `Consequence: ${consequences.slice(0, 2).map((consequence) => consequence.title).join("; ")}`
      : "",
  };
}

export function buildSceneNotebookProjection(campaign = {}) {
  const retrieval = buildSceneRetrieval(campaign);
  const scene = retrieval.scene;
  const records = [];

  if (hasSceneNotebookDetails(scene, campaign)) {
    const location = scene.locationId ? labelEntity(campaign, scene.locationId) : "";
    records.push({
      title: scene.title || "Current scene",
      subtitle: location || scene.type || "scene",
      body: detailLines([
        scene.immediateSituation,
        scene.whyHere ? `Why here: ${scene.whyHere}` : "",
        ...(scene.tensions ?? []).slice(0, 3).map((tension) => `Tension: ${tension}`),
        ...(scene.unresolvedQuestions ?? []).slice(0, 3).map((question) => `Open: ${question}`),
      ]),
    });
  }

  for (const consequence of retrieval.activeConsequences.slice(0, 3)) {
    records.push({
      title: consequence.title || "Consequence",
      subtitle: consequence.scope || consequence.importance || "consequence",
      body: detailLines([
        consequence.description,
        consequence.status ? `Status: ${consequence.status}` : "",
      ]),
    });
  }

  for (const thread of retrieval.activeThreads.slice(0, 3)) {
    records.push({
      title: thread.title || "Open thread",
      subtitle: thread.status || "thread",
      body: detailLines([
        thread.stakes,
        ...(thread.openQuestions ?? []).slice(0, 2).map((question) => `Open: ${question}`),
      ]),
    });
  }

  for (const relationship of retrieval.relevantRelationships.slice(0, 2)) {
    records.push({
      title: `${labelEntity(campaign, relationship.sourceId)} / ${labelEntity(campaign, relationship.targetId)}`,
      subtitle: relationship.type || "relationship",
      body: detailLines([relationship.summary, relationship.notes]),
    });
  }

  return {
    count: records.length,
    records,
    emptyText: "Scene focus, consequences, and active threads will appear here as play creates them.",
  };
}

function hasSceneNotebookDetails(scene, campaign) {
  const hasFirstClassScene = Boolean(
    campaign?.scene?.activeSceneId || (campaign?.scenes ?? []).some((record) => record.status === "active"),
  );
  return Boolean(
    hasFirstClassScene
    || (scene?.title && scene.title !== "Unframed scene")
    || scene?.locationId
    || scene?.immediateSituation
    || scene?.whyHere
    || scene?.tensions?.length
    || scene?.unresolvedQuestions?.length,
  );
}

function detailLines(values) {
  return values
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join(" ");
}
