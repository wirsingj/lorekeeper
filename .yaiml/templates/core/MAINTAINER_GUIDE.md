---
yaiml-revision: "0.23.a56fdcf631fe8b72"
yaiml: 0.2
role: maintainer
title: Maintainer Guide
purpose: Current working procedures, checks, diagnostics, and recovery.
belongs-here: setup, working procedures, checks, important files, operations, delivery, recovery.
not-here: Product intent, durable architecture, full history.
durability: current-only; remove obsolete procedures and paths.
read-with: SoT; Architecture.
update-when: setup, working procedures, checks, delivery, or recovery changes.
agent-guidance: Verify procedural claims when practical. Mark environment-dependent or unverified procedures.
---
# Maintainer Guide
Adapt headings; omit unused sections; keep procedures actionable/current.
## Setup And Working Procedures
Shortest path from available project materials to useful work, tools, assumptions. Separate performed and documented procedures. Retain consequential action, outcome, date, revision, environment; existence is not a pass.
## Focused Checks And Diagnostics
Check actual inputs and outputs against the brief or requirements: documents, schedules, analyses, processes or software tests. Record procedures and interpretation; access/tool requirements without sensitive values. Retain sanitized outcomes, not logs. Name consequential invariants, independent expectation sources, comparison conditions, evidence gaps; matching outputs alone do not establish intent.
## Important And Dangerous Files
Editing boundaries and important files; no complete inventory.
## Failure, Release, And Recovery Procedures
Recurring symptoms, likely owners, evidence, recovery. Relevant release, rollback, backup/restore procedures and verification limits.
## YAIML Maintenance
Record project-specific setup: memory/discovery locations, shared-guide route, current product release and exact source revision, scope of any explicitly requested source override, local skills/adaptations, partial-update exceptions, host activation evidence and gaps. Keep private reference locations in workspace configuration.
Point to the acquired YAIML_GUIDE.md for ordinary context/evidence/maintenance rules and VERSIONING.md for revision procedures; do not copy those generic rules into project memory. Identify the audit owner and any project-specific retention, authority or coordination constraints. Keep current source notes concise; changes.md owns the audit.
