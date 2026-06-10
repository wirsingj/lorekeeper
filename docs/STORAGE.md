# Storage

Lorekeeper should persist campaign memory in a durable, user-owned SQLite file. Browser databases can
be useful for cache and extension working state, but the main campaign should live in a local
`.lorekeeper.sqlite` file that the user can back up, move, inspect, and export.

## Storage Goals

- User-owned `.lorekeeper.sqlite` campaign files.
- Durable state that survives browser cleanup.
- Exportable and importable campaign bundles.
- Structured data plus human-readable notes.
- Review history for proposed and approved canon updates.
- Recovery path from raw imported responses.

## Campaign Memory Model

Lorekeeper must explicitly model and persist:

- people, characters, and NPCs
- player party members
- factions and organizations
- places, regions, and maps
- items, artifacts, and inventory
- world lore and canon notes
- timeline and session events
- active quests and unresolved threads
- relationships between characters, factions, and places
- party location and scene state
- combat style preferences
- combat turn format
- D&D 5e-lite rules profile and stat tracking
- character stats, HP, abilities, and spells when available
- encounter state, enemies, initiative, and conditions
- writing tone and campaign style rules
- provider prompt templates
- recap and context-pack templates

## Canon and Review

Canon should be stored as structured state plus human-readable notes. The model can propose updates,
but proposals do not become canon until the user reviews them.

The storage layer should keep:

- raw imported provider response
- extraction attempt metadata
- proposed state changes
- user edits
- approval or rejection decisions
- committed canonical state
- timestamps and session references

This creates an audit trail and allows the user to correct the campaign record when model extraction
is incomplete or wrong.

## Context Packs

The storage/query layer should support focused context packs rather than one giant campaign dump.

Examples:

- current scene context
- active party context
- nearby people and places
- relevant lore
- current inventory
- unresolved plot threads
- combat state if in combat
- relationship notes
- campaign style and formatting rules

## Primary Storage Target: Local SQLite File

The main storage path is one SQLite file per campaign.

Recommended extension: `.lorekeeper.sqlite`

The SQLite database should store:

- campaign metadata
- structured canon records by domain
- full-text search index for focused context retrieval
- relationships between people, factions, places, and items
- D&D 5e-lite character and encounter records
- sessions and timeline events
- provider prompt/response runs
- review batches and proposed changes
- approved canon commits
- assets and file references
- imported source documents when applicable

This lets Lorekeeper be the durable framework around provider output. The provider can improvise, but
the SQLite file is the campaign's source of truth.

## Browser Storage Role

Browser storage may keep cached state, selected tab metadata, UI preferences, and temporary working
copies. It should never be the only trusted home for canon.

## Secondary Formats And Options

### IndexedDB

Pros:

- Available in browsers and extensions.
- Good for local app cache and structured records.
- Works without prompting for file handles.

Cons:

- Can be cleared by browser cleanup tools.
- Harder for users to inspect directly.
- Should not be the only trusted long-term storage.

Recommended role: local cache, working copy, and extension convenience.

### OPFS

Pros:

- File-like browser storage.
- Useful for SQLite WASM and larger local data.
- Better fit for app-managed storage than plain IndexedDB records.

Cons:

- Still browser-owned storage.
- User visibility and backup behavior can be unclear.
- Browser support and extension constraints need investigation.

Recommended role: possible local working store, especially if SQLite WASM is chosen.

### File System Access API

Pros:

- Can write user-owned campaign folders or bundles.
- Better backup and inspection story.
- Fits the requirement that campaign data be exportable/importable.

Cons:

- Browser support varies.
- Permission and handle persistence need careful UX.
- Extension compatibility must be tested.

Recommended role: preferred durable storage path when available.

### SQLite WASM / sqlite-wasm / sql.js

Pros:

- Strong query model for structured campaign memory.
- Good fit for relationships, timeline events, and context-pack retrieval.
- Portable database files may work well inside campaign bundles.

Cons:

- Adds complexity.
- Persistence backend matters.
- Schema migrations must be designed early.

Recommended role: primary MVP storage implementation path for browser-first local files.

### Plain JSON Campaign Folder

Pros:

- Easy to inspect, diff, back up, and repair.
- Works well for early scaffolding.
- Friendly to export/import.

Cons:

- Querying relationships and timeline data may become awkward.
- Large campaigns can become slow without indexing.
- Requires careful schema/version design.

Recommended role: backup, migration, and human-readable export format.

## Backup Strategy

Campaign bundles should support manual export from day one. Later versions can add automatic backups
to a user-selected folder.

A campaign bundle should eventually include:

- campaign manifest
- structured canon state
- human-readable notes
- original source documents, such as continuity dumps copied between provider chats
- prompt and recap templates
- imported responses
- reviewed diffs
- maps or attachment references
- schema version

## Imported Continuity Dumps

Existing campaign folders may contain hand-built text files intended to be pasted into new provider
chat sessions. Lorekeeper should ingest these as first-class source documents.

The first importer should:

- read UTF-8 `.txt` and `.md` files
- preserve the raw text with filename, modified time, and source order
- index image, document, and video files as campaign assets
- extract first-pass structured state with source references
- mark extracted state as review-oriented until the user approves it
- treat later dump files as stronger evidence than earlier snapshots during future merge logic

This keeps the user's old continuity workflow intact while giving Lorekeeper something structured to
query.

## Browser Storage Risk

Browser cleaners, profile resets, extension reinstallations, and sync issues can wipe local browser
storage. Lorekeeper should treat browser-owned storage as convenient, not sacred.
