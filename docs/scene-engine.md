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

## Scene Intent Pack

`buildSceneIntentPack(campaign)` converts retrieval into a provider-ready intent packet:

- current scene facts
- active consequences
- relevant relationships
- active threads
- recent scene events
- escalation policy
- provider/app ownership boundaries

The intent pack is not a prompt gimmick. It is app-owned scene state that tells the provider what kind of beat is appropriate.

## Escalation Policy

`deriveEscalationPolicy(campaign)` chooses one of:

- `none`: let the scene breathe; use atmosphere, relationships, and ordinary consequence.
- `soft`: apply social pressure, suspicion, rumor, memory, or a grounded next beat.
- `moderate`: escalate only through an active consequence or established tension.
- `hard`: combat or immediate danger is already active; resolve current combatants and do not invent unrelated threats.

This is meant to prevent random-encounter behavior. After a small fight, the next good beat is usually a witness, favor, fear, rumor, or cleanup consequence, not a fresh monster.
