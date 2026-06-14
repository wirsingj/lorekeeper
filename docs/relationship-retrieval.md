# Relationship Retrieval

Relationship retrieval is scene-aware.

The app should not dump every relationship into every provider request. It should prefer relationships that can actually affect the current scene.

## Priority Order

1. Relationships explicitly linked by an active consequence.
2. Relationships involving current scene participants.
3. Relationships involving current party members.
4. A small fallback set only when nothing scene-relevant exists.

## Provider Request Shape

Focused provider tasks include:

```ts
readonlyContext: {
  scene,
  activeConsequences,
  relevantRelationships,
  activeThreads,
  activeActor,
  recentMessages,
  combat
}
```

This lets the provider answer the DM questions that matter:

- Who is here?
- What do they want or remember?
- What is tense right now?
- What changed because of the last action?
- Which unresolved thread is relevant?

## Boundary

Relationship notes are readonly context. Provider output may propose relationship updates, but the app must validate and review them before persistence.
