# LoreKeeper Living World

Updated: 2026-06-16

LoreKeeper's living-world rule:

The app remembers. The provider expresses what is remembered.

This document explains the memory model that keeps long campaigns from feeling like disconnected scenes.

## What Counts As World Memory

Consequences:

- stored in `campaign.consequences`,
- represent things that should matter later,
- can link to people, places, factions, relationships, threads, and goals,
- should be retrievable even many turns after the narration that created them.

NPC memory:

- stored on people records through notes, memory, reputation, history, relationship links, or consequences,
- covers favors, insults, betrayals, debts, promises, rescues, rumors, and public events,
- should change how recurring NPCs respond.

Relationship evolution:

- stored in `campaign.relationships`,
- should represent meaningful shifts such as neutral to friendly, friendly to loyal, distrustful to hostile, hostile to fearful, fearful to respectful,
- should link to current actors, places, factions, consequences, or goals when relevant.
- normalized through `src/engine/relationship-engine.js` for reviewed changes, using the state ladder `hostile`, `fearful`, `distrustful`, `neutral`, `respectful`, `friendly`, `loyal`.

Faction memory:

- stored on faction records and linked consequences/relationships,
- tracks what a faction knows, believes, wants, fears, or blames the party for.

Location memory:

- stored on place records and linked consequences,
- tracks scars, repairs, public history, discoveries, collapses, saved villages, explored mines, and other visible continuity.

## Goal Horizons

Goal horizons are DM-style narrative gravity:

- Long-term: campaign arc, major threat, world stakes, eventual confrontation.
- Medium-term: current chapter, region, mystery, faction pressure, quest chain.
- Short-term: current scene, obstacle, conversation, objective.

LoreKeeper derives horizons from:

- explicit `campaign.goalHorizon` or `campaign.goals`,
- public quest/thread records,
- hidden `dm_only` story-arc quest records,
- current scene goals.

Use existing quest/thread records when possible. Do not create a duplicate roadmap domain unless the existing records cannot express the goal.

## Retrieval Priority

Living world retrieval should prefer:

1. Current scene
2. Active short-term goals
3. Relevant consequences
4. Relevant relationships
5. Active medium-term goals
6. Active threads
7. Long-term goals
8. Recent history

Recent messages matter, but they should not drown out old facts that are directly relevant.

## Provider Contract

Provider requests include:

- `context.goalHorizon`
- `context.livingWorld`
- hidden DM story threads
- scene intent and escalation policy
- active consequences and relationships

The provider should ask:

- Does this serve a short, medium, or long-term goal?
- What changed because of the latest action?
- Who noticed?
- Who cares?
- What would this NPC, faction, or place remember?

The provider should propose changes for durable memory instead of leaving all meaning inside prose.

## Scene Endings

After meaningful scenes, the table should be able to answer:

- What changed?
- Who remembers?
- Which relationship shifted?
- Which place or faction was affected?
- Which goal or thread did this advance, complicate, or close?

If the answer is "nothing," the scene may not need a consequence. But repeated "nothing changed" scenes make the world feel disposable.

## Living World Score

`src/engine/living-world-engine.js` produces an internal score. It asks:

If the same NPC, faction, or place appears again later, would they react differently because of history?

The score is diagnostic guidance, not a player-facing grade.

## Important Files

- `src/engine/living-world-engine.js`: goal horizons, memory projection, score.
- `src/engine/relationship-engine.js`: relationship normalization and durable state transitions.
- `src/engine/consequence-engine.js`: consequence normalization, storage links, scene retrieval.
- `src/engine/scene-engine.js`: current scene retrieval and scene intent.
- `src/context-packs/build-context-pack.js`: DM Goal Horizon and Living World Memory sections.
- `src/model-contract/turn-json-contract.js`: provider JSON request context and continuity rules.
- `src/engine/provider-orchestrator.js`: provider task context for non-contract engine calls.
