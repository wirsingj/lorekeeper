# LoreKeeper JSON Contract

LoreKeeper's desktop/local model loop uses explicit application-owned contracts:

`App -> LorekeeperTurnRequest -> Model -> LorekeeperTurnResponse -> App`

The model must return valid JSON only. No markdown, no fenced code block, and no prose outside JSON.

SQLite remains canon. A model response can only propose state changes; LoreKeeper validates those changes and keeps them behind review instead of treating model output as truth.

## Request: `LorekeeperTurnRequest`

```json
{
  "type": "lorekeeper.turn.request",
  "schemaVersion": 1,
  "requestId": "turn-lxyz12-abcd12",
  "meta": {
    "intent": "generate_next_tabletop_turn",
    "campaignId": "campaign-id",
    "campaignTitle": "Campaign Name",
    "system": "D&D 5e-lite",
    "canonSource": "SQLite campaign state in this request",
    "instructionPriority": [
      "Never contradict canon context.",
      "Do not decide the primary player character's major choices.",
      "Parenthetical player text is meta direction, not in-world speech.",
      "Write a strong, specific scene beat with useful choices.",
      "Return valid JSON only."
    ]
  },
  "responseFormat": {
    "type": "json_only",
    "schema": {
      "type": "lorekeeper.turn.response",
      "schemaVersion": 1,
      "requestId": "same-id-from-request",
      "table": [
        {
          "speaker": "DM",
          "speakerId": null,
          "role": "dm|player|party|npc|system",
          "kind": "narration|dialogue|action|mechanics|status|aside",
          "visibility": "table|dm_only|party",
          "text": "player-facing table chat text"
        }
      ],
      "sceneStatus": {
        "mode": "social|exploration|combat|downtime|travel",
        "danger": "none|tense|immediate|combat",
        "awaitingPlayer": true
      },
      "choices": {
        "prompt": "question for the player",
        "options": [{ "id": "1", "text": "clear action option" }],
        "allowOther": true
      },
      "mechanics": [
        {
          "type": "suggested_check|save|attack|damage|initiative|resource_note|status|none",
          "actorId": "optional actor id",
          "actor": "character or creature name",
          "ability": "optional ability",
          "skill": "optional skill",
          "roll": "optional dice formula or result",
          "dc": null,
          "reason": "why this mechanic is relevant",
          "outcome": "success|failure|mixed|pending|none",
          "label": "short roll/check/combat label",
          "text": "brief player-facing mechanics"
        }
      ],
      "flags": {
        "requiresReview": true,
        "startsCombat": false,
        "endsScene": false,
        "containsSecretInfo": false
      },
      "proposedChanges": [],
      "warnings": []
    },
    "rules": [
      "Return valid JSON only.",
      "Do not use markdown.",
      "Do not wrap the response in a code fence.",
      "Use proposedChanges: [] when no canon changed.",
      "Use party for PCs and trusted companions.",
      "Use people for NPCs.",
      "Every named add/update should include data.name or data.title.",
      "Choices must be separate objects, not a paragraph.",
      "Do not silently change HP, inventory, relationships, quests, or major canon.",
      "If stats are missing, suggest a pending check instead of inventing exact math."
    ]
  },
  "user": {
    "raw": "full user prompt pass-through",
    "inWorld": "non-parenthetical in-world action/speech",
    "meta": ["parenthetical meta instructions"],
    "actionIntent": "combat_action|skill_or_scene_check|social_action|movement_or_exploration|freeform_table_action",
    "requestedRolls": [
      {
        "type": "explicit_dice|skill_check",
        "formula": "d20+3",
        "skill": "perception",
        "reason": "why LoreKeeper inferred this roll request"
      }
    ]
  },
  "generation": {
    "mode": "normal|fast|combat|summary",
    "responseMode": "turn|continue|resolve_check|resolve_combat|summarize",
    "maxTableEntries": 8,
    "maxChoices": 6,
    "allowMechanics": true,
    "allowProposedChanges": true,
    "tone": "engaging D&D-style adventure with strong continuity and player agency"
  },
  "context": {
    "summary": "compact campaign premise",
    "scene": {
      "status": "active",
      "mode": "social|exploration|combat|downtime|travel",
      "danger": "none|tense|immediate|combat",
      "currentPlaceId": "place-id",
      "presentPeopleIds": [],
      "presentPartyMemberIds": [],
      "activeQuestIds": []
    },
    "party": [
      {
        "id": "character-id",
        "name": "Character Name",
        "role": "ancestry/class/table role",
        "hp": null,
        "maxHp": null,
        "level": null,
        "abilities": [],
        "skills": [],
        "conditions": [],
        "resources": [],
        "notes": []
      }
    ],
    "tableVoices": [
      {
        "id": "character-id",
        "name": "Character Name",
        "voice": "brief personality/voice guidance",
        "agency": "primary_player_character|companion|npc|dm"
      }
    ],
    "sections": [
      {
        "kind": "current_scene|recent_history|relevant_lore|active_threads|nearby_entities|combat_state|style_rules",
        "title": "Current Scene",
        "entries": ["compact facts"]
      }
    ]
  }
}
```

## Response: `LorekeeperTurnResponse`

```json
{
  "type": "lorekeeper.turn.response",
  "schemaVersion": 1,
  "requestId": "same-id-from-request",
  "table": [
    {
      "speaker": "DM",
      "speakerId": null,
      "role": "dm",
      "kind": "narration",
      "visibility": "table",
      "text": "The tavern door opens, and the room goes quiet."
    },
    {
      "speaker": "Roderic Vale",
      "speakerId": "roderic-vale",
      "role": "party",
      "kind": "dialogue",
      "visibility": "table",
      "text": "\"I'll watch the door.\""
    }
  ],
  "sceneStatus": {
    "mode": "social",
    "danger": "tense",
    "awaitingPlayer": true
  },
  "choices": {
    "prompt": "What does Evelynn do?",
    "options": [
      { "id": "1", "text": "Ask the rider who sent him." },
      { "id": "2", "text": "Signal the crew to prepare an ambush." }
    ],
    "allowOther": true
  },
  "mechanics": [
    {
      "type": "suggested_check",
      "actorId": "evelynn",
      "actor": "Evelynn",
      "ability": "WIS",
      "skill": "Insight",
      "roll": "",
      "dc": 13,
      "reason": "Determine whether the rider is bluffing.",
      "outcome": "pending",
      "label": "Insight check",
      "text": "Roll if Evelynn studies whether the rider is bluffing."
    }
  ],
  "flags": {
    "requiresReview": true,
    "startsCombat": false,
    "endsScene": false,
    "containsSecretInfo": false
  },
  "proposedChanges": [
    {
      "operation": "add",
      "domain": "people",
      "targetId": null,
      "importance": "normal",
      "visibility": "player_visible",
      "summary": "Three armed riders entered The Bent Coin looking for the cloaked contact.",
      "data": {
        "name": "Three Armed Riders",
        "role": "armed pursuers",
        "locationId": "the-bent-coin"
      },
      "confidence": "high",
      "reason": "Directly introduced in the scene."
    }
  ],
  "warnings": []
}
```

## Validation Rules

Allowed table roles: `dm`, `player`, `party`, `npc`, `system`.

Allowed table kinds: `narration`, `dialogue`, `action`, `mechanics`, `status`, `aside`.

Allowed table visibility values: `table`, `dm_only`, `party`.

Allowed mechanic types: `suggested_check`, `check`, `save`, `attack`, `damage`, `initiative`, `resource_note`, `status`, `none`.

Allowed operations: `add`, `update`, `remove`, `note`.

Allowed domains: `party`, `people`, `factions`, `places`, `items`, `inventory`, `lore`, `timeline`, `quests`, `relationships`, `scene`, `combat`, `style`.

Allowed importance values: `minor`, `normal`, `major`.

Allowed proposed change visibility values: `player_visible`, `dm_only`, `system_only`.

Major proposed changes require `flags.requiresReview: true`.

When validation fails, LoreKeeper quarantines proposed changes, renders a recoverable status, and reports a contract warning.

## Contract Review Decisions

These notes capture the v1 review choices so the contract stays stable and lean.

- `generation.responseMode`: accepted in v1. This separates the task type from context size. `generation.mode` controls budget/shape; `responseMode` tells the model whether the app wants a normal turn, continuation, check resolution, combat resolution, or summary.
- Human-readable choice IDs: deferred to v1.1 as app-owned presentation. The model may return simple ids such as `"1"`, and the UI can render richer labels later without spending model tokens.
- Table entry visibility: accepted in v1 with the small enum `table|dm_only|party`. Player-specific audiences are a multiplayer v1.1 feature.
- Speaker entity references: kept as optional `speakerId` in v1. The app should fill or resolve stable ids where possible, but the model is not required to invent ids.
- `flags.hasProposedChanges`: rejected as a model field. The app derives it from `proposedChanges.length` to avoid drift.
- `responseConfidence`: rejected for v1. Per-change confidence plus `warnings` is enough signal without adding noisy self-scoring.
- Renaming `mechanics` to `suggestedMechanics`: rejected for v1. The field remains `mechanics`; entries are suggestions unless the request explicitly asks the model to resolve a provided roll/combat event.
- `contextUsed`: deferred to v1.1 as app-generated debug instrumentation. The provider should not echo retrieval bookkeeping into every response.
- Replacing the embedded `responseFormat.schema` with only `schemaVersion`: deferred to provider-layer optimization. The full schema/rules stay in v1 prompts because local models benefit from the extra structure.

## Legacy Bridge Compatibility

The browser bridge can still ingest the older player-facing prose plus fenced `json lorekeeper_updates` block. That path remains compatibility/debug behavior while the desktop/local model path uses the strict JSON contract.
