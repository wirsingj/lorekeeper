# Storage

Storage owns durable campaign bundle persistence, import/export, and cache coordination.

- `campaign-bundle.js` serializes a validated campaign into an exportable JSON bundle.
- `sqlite-schema.sql` defines the durable local campaign database shape.
- `sqlite-store.js` creates a real SQLite campaign file using `sql.js`.

The primary storage target is a user-owned `.lorekeeper.sqlite` file. JSON bundles remain useful for
backup, import/export, and debugging.

The local dev server uses `campaign-repository.js` and `review-commit.js` to load the active campaign
from SQLite and commit approved review changes back into it.
