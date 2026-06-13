# Combat Engine

Combat is app-owned. The provider can narrate combat, choose NPC intent, and suggest companion actions, but it does not own initiative, dice, HP, resources, or turn advancement.

## Combat Lifecycle

1. Combat starts with participants and enemies.
2. App rolls or accepts initiative.
3. App sets `currentTurnId`.
4. Active actor declares an action.
5. App resolves mechanics and creates roll records.
6. App applies validated effects.
7. Provider may narrate the resolved result.
8. App advances to the next combatant.

## Combat Action Record

```ts
type CombatActionRecord = {
  turnId: string;
  actorId: string;
  actionType: "attack" | "spell" | "dash" | "dodge" | "disengage" | "help" | "hide" | "ready" | "improvise";
  targetIds: string[];
  declaredText: string;
  rolls: RollRecord[];
  effects: StateEffect[];
  narration?: string;
};
```

## UI Expectations

- Show combat mode clearly.
- Show round and active actor.
- Show every combatant in initiative order, including enemies and temporary foes.
- Show visible roll breakdowns for attacks, checks, saves, damage, healing, and resource spends.
- Do not block player input on an enemy turn without showing that the DM/NPC turn is resolving.

## Provider Boundary

Provider narration should receive a resolved `CombatActionRecord`, not a request to invent state changes. If provider narration fails, the app still has the mechanical outcome and can continue.
