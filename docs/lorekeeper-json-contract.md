# LoreKeeper JSON Contract

Provider output has two parts:

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

