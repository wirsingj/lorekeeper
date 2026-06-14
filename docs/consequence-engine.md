# Consequence Engine

`ConsequenceEngine` makes consequences first-class campaign data.

The goal is to replace random escalation with natural continuity: who remembers what, what changed, what pressure remains, and what may matter later.

## What It Owns

- creating consequence records
- resolving consequence records
- retrieving active consequences for the current scene
- linking consequences to scenes, participants, threads, and relationships

It does not call the provider and does not write SQLite directly.

## Consequence Record

```ts
type ConsequenceRecord = {
  id: string;
  title: string;
  description: string;
  scope: "scene" | "person" | "party" | "place" | "faction" | "quest" | "world";
  state: "active" | "resolved" | "dormant";
  importance: "low" | "medium" | "high" | "critical";
  sourceSceneId: string | null;
  relatedSceneIds: string[];
  participantIds: string[];
  relatedEntityIds: string[];
  relationshipIds: string[];
  threadIds: string[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  resolution: string;
};
```

## DM Quality Impact

Provider requests now include active consequences. That lets the DM continue from what happened instead of inventing unrelated pressure.

Example:

- Bad: a road scene suddenly gets bandits because the model wants action.
- Better: the miner Garin intimidated spreads a rumor, making guards less cooperative next time.

Consequences are the bridge between action and continuity.
