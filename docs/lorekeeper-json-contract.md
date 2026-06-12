# LoreKeeper JSON Contract

LoreKeeper now has two provider contracts:

- `turn-json-v1`: preferred for local/desktop providers such as Ollama.
- Legacy sidecar response: kept for browser provider bridge compatibility.

## Standalone Turn Contract

The desktop/local model path is:

`APP -> JSON request -> MODEL -> JSON response -> APP`

The app owns formatting, persistence, validation, and canon updates.

### Input Envelope

```json
{
  "lorekeeperRequest": "turn-json-v1",
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
      "Write a strong, specific scene beat with useful choices."
    ]
  },
  "responseFormat": {
    "type": "json_only",
    "schema": {
      "lorekeeperResponse": "turn-json-v1",
      "table": [
        {
          "speaker": "DM or party member name",
          "role": "dm|party",
          "text": "player-facing table chat text"
        }
      ],
      "choices": {
        "prompt": "question for the player",
        "options": [
          {
            "id": "1",
            "text": "clear action option"
          }
        ],
        "allowOther": true
      },
      "mechanics": [
        {
          "type": "check|attack|save|damage|status|none",
          "actor": "character or creature name",
          "roll": "optional dice formula or result",
          "dc": null,
          "outcome": "success|failure|mixed|pending|none",
          "label": "short roll/check/combat label",
          "text": "brief player-facing mechanics"
        }
      ],
      "proposedChanges": [
        {
          "operation": "add|update|remove|note",
          "domain": "party|people|factions|places|items|inventory|lore|timeline|quests|relationships|scene|combat|style",
          "targetId": null,
          "summary": "compact canon update",
          "data": {},
          "confidence": "low|medium|high",
          "reason": "why this should become canon"
        }
      ]
    },
    "rules": [
      "Return valid JSON only.",
      "Use proposedChanges: [] when no canon changed.",
      "Use party for PCs and trusted companions; people for NPCs.",
      "Every named add/update should include data.name or data.title.",
      "Choices must be separate objects, not a paragraph."
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
  "context": {
    "summary": "compact campaign premise",
    "scene": {
      "status": "active",
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
        "level": null,
        "abilities": [],
        "skills": [],
        "notes": []
      }
    ],
    "tableVoices": [
      {
        "id": "character-id",
        "name": "Character Name",
        "voice": "brief personality/voice guidance",
        "agency": "primary player character or companion agency rule"
      }
    ],
    "sections": [
      {
        "kind": "current_scene",
        "title": "Current Scene",
        "entries": ["compact facts"]
      }
    ]
  }
}
```

### Output Envelope

```json
{
  "lorekeeperResponse": "turn-json-v1",
  "table": [
    {
      "speaker": "DM",
      "role": "dm",
      "text": "The player-facing scene beat."
    },
    {
      "speaker": "Roderic Vale",
      "role": "party",
      "text": "\"I'll watch the door.\""
    }
  ],
  "choices": {
    "prompt": "What does Evelynn do?",
    "options": [
      {
        "id": "1",
        "text": "Ask the rider who sent him."
      },
      {
        "id": "2",
        "text": "Signal the crew to prepare an ambush."
      }
    ],
    "allowOther": true
  },
  "mechanics": [
    {
      "type": "check",
      "actor": "Evelynn",
      "roll": "d20 + WIS/Insight",
      "dc": 13,
      "outcome": "pending",
      "label": "Insight check",
      "text": "Roll if Evelynn studies whether the rider is bluffing."
    }
  ],
  "proposedChanges": [
    {
      "operation": "add",
      "domain": "people",
      "targetId": null,
      "summary": "Three armed riders entered The Bent Coin looking for the cloaked contact.",
      "data": {
        "name": "Three Armed Riders",
        "role": "armed pursuers",
        "locationId": "the-bent-coin"
      },
      "confidence": "high",
      "reason": "Directly introduced in the scene."
    }
  ]
}
```

## Legacy Sidecar Contract

Browser/provider bridge output still supports two parts:

1. Player-facing narration.
2. One fenced update block.

```json lorekeeper_updates
{
  "proposedChanges": [
    {
      "operation": "add|update|remove|note",
      "domain": "party|people|factions|places|items|inventory|lore|timeline|quests|relationships|scene|combat|style",
      "targetId": null,
      "summary": "",
      "data": {},
      "confidence": "low|medium|high",
      "reason": ""
    }
  ]
}
```

## Rules

- Narration comes first.
- The update block comes last.
- No prose after the update block.
- Use `proposedChanges: []` when nothing important changed.
- Every added or updated named record should include `data.name` or `data.title`.
- Use `party` for player characters and trusted companions.
- Use `people` for NPCs.
- SQLite canon wins over provider chat memory.

## Parser Behavior

The parser:

- extracts fenced `json lorekeeper_updates` blocks
- falls back to any fenced JSON containing `proposedChanges`
- falls back to inline JSON objects containing `proposedChanges`
- strips update JSON before rendering player-facing narration
- recovers complete changes from partial JSON when possible
- never throws parser errors into the UI turn loop

## Validation

Allowed operations:

- `add`
- `update`
- `remove`
- `note`

Allowed domains:

- `party`
- `people`
- `factions`
- `places`
- `items`
- `inventory`
- `lore`
- `timeline`
- `quests`
- `relationships`
- `scene`
- `combat`
- `style`
- `rules_profile`

Invalid changes are marked rejected and are not committed.

## Review Workflow Direction

Current prototype behavior auto-approves valid extracted changes for fast iteration. The target desktop workflow is:

1. Import provider response.
2. Parse and validate proposed changes.
3. Show a reviewable diff.
4. Let the user edit, approve, or reject.
5. Commit approved changes to SQLite.

This keeps model proposals from silently becoming canon.
