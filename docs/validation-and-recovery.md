# Validation And Recovery

LoreKeeper validates model I/O at runtime.

The current runtime validator lives in:

`src/model-contract/turn-json-contract.js`

It validates both:

- `LorekeeperTurnRequest`
- `LorekeeperTurnResponse`

## Response Recovery

The parser handles:

- valid JSON
- markdown-wrapped JSON
- text before or after JSON
- malformed JSON
- partial output
- request id mismatch
- missing required fields
- invalid enum values

If the response cannot be safely validated, LoreKeeper:

- keeps the raw output available in provider metadata
- reports a contract warning in provider status
- renders a recoverable status message when needed
- drops proposed changes
- does not commit canon changes
- does not corrupt campaign state

## Proposed Changes

Model `proposedChanges` are proposals only.

They are validated against allowed operations/domains/importance/visibility. Invalid changes are rejected or quarantined. Major changes must set `flags.requiresReview: true`.

Current desktop behavior stores proposed changes as a pending review batch. The next UX step is a dedicated approve/reject/edit review panel.

## Table Rendering

The player-facing chat view is rendered from `response.table`.

Entries with `visibility: "dm_only"` are not rendered as player-facing table messages.

Missing table visibility defaults to `table`; unknown visibility values fail validation. The v1 visibility enum is intentionally small: `table`, `party`, and `dm_only`.

Choices are rendered from `response.choices`, not inferred from prose.

Mechanics are rendered from `response.mechanics`, with suggested checks preferred when the app has not provided exact stats.

## Test Coverage

`npm test` covers:

- request building
- fast mode request trimming
- combat mode request shaping
- missing stats
- valid structured responses
- no proposed changes
- markdown-wrapped JSON recovery
- text-wrapped JSON recovery
- malformed/partial JSON
- invalid role
- invalid kind
- invalid table visibility
- invalid operation
- invalid domain
- request id mismatch
- missing choices while awaiting player
- major proposed change review requirement
- `dm_only` table visibility
