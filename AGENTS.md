# Instructions For Agents

Use YAIML as LoreKeeper project memory, not as a replacement for these instructions.

Before meaningful work:

1. Read `yaiml.yml`.
2. Read the stable header of each declared core YAIML document before its body.
3. Read the core YAIML documents declared in `yaiml.yml`:
   - SoT for current product state, direction, risk, uncertainty, and priorities.
   - Architecture for durable system shape, ownership boundaries, and invariants.
   - Maintainer Guide for commands, diagnostics, package/release notes, and failure playbooks.
4. Load supporting YAIML documents only when the current task touches their domain.
5. Verify task-relevant claims against repository reality. Do not treat inference as verified implementation.

Before finishing material work, update affected YAIML documents when project state, risks, commands, or architecture changed. Prune stale or repeated memory before adding more, while preserving current facts, human direction, evidence limits, and unresolved conflicts.

Phrases such as "update YAIML", "updated YAIML", "check new YAIML", or "refresh YAIML" mean: compare this repository's local YAIML scaffolding against a human-provided, workspace-provided, or team-approved YAIML reference, refresh compatible convention prompts/templates/guidance/pointers, and preserve LoreKeeper-specific project memory.

Phrases such as "clean up YAIML", "compress YAIML", "compact project memory", "prune project memory", or "prune SoT" mean: remove stale or repetitive memory while preserving current truth, evidence, direction, uncertainty, and governed retention. See `docs/MAINTAINER_GUIDE.md` for local YAIML maintenance.
