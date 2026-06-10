# Campaign State

This folder owns the campaign memory engine primitives.

- `schema.js` defines the top-level campaign shape and validation.
- `sample-campaign.js` provides a working Veil of the Towers style seed campaign.
- `formatters.js` contains helpers for labeling and rendering entities.

The model deliberately treats canon as structured state plus human-readable notes. Provider output
can propose updates, but user review decides what becomes canon.
