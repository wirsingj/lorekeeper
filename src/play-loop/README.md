# Play Loop

The play loop is the orchestration layer between LoreKeeper input and provider output.

`session-turn.js` turns a raw player message into:

- a focused context pack
- a provider-ready table DM prompt
- a turn object that can later receive an imported provider response

Later this should connect to the provider bridge, state extraction, review diffs, and SQLite commits.
