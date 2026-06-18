# Provider Bridge

The provider bridge defines how LoreKeeper treats ChatGPT, Claude, and similar provider tabs as
visible AI execution surfaces.

- `contracts.js` defines adapter metadata and bridge run state.
- `manual-workflow.js` models the first copy/import workflow before DOM automation exists.

Adapters must require explicit provider tab selection and must not read credentials or unrelated
tabs.
