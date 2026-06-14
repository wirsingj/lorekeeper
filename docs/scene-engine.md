# Scene Engine

`SceneEngine` makes the active scene an app-owned concept instead of an implied prompt detail.

## What It Owns

- current scene record
- scene transitions
- scene type
- location
- participants
- scene goals
- tensions
- unresolved questions
- active consequence links

The provider may narrate a scene, but the app decides what the current scene is and which context is relevant.

## Scene Record

```ts
type SceneRecord = {
  id: string;
  type: "rp" | "social" | "exploration" | "combat" | "travel" | "downtime";
  title: string;
  locationId: string | null;
  participantIds: string[];
  partyMemberIds: string[];
  peopleIds: string[];
  threadIds: string[];
  consequenceIds: string[];
  goals: string[];
  tensions: string[];
  unresolvedQuestions: string[];
  whyHere: string;
  immediateSituation: string;
  status: "active" | "resolved" | string;
  startedAt: string;
  endedAt: string | null;
  updatedAt: string;
};
```

`campaign.scene` remains the lightweight current projection used by older renderer code. `campaign.scenes` is the first-class history of scene records.

## Lifecycle

1. `transitionScene` resolves the previous active scene.
2. A new scene record is normalized and stored.
3. `campaign.scene` is updated as the current projection.
4. Retrieval can ask for scene participants, tensions, consequences, relationships, threads, and recent events.

## Retrieval

`buildSceneRetrieval(campaign)` returns the compact set the DM needs:

- current scene
- participants
- active consequences
- relevant relationships
- active threads
- relevant recent events

This is intentionally smaller than the whole campaign. It helps the provider behave like a long-running DM by making the current pressure and continuity visible.
