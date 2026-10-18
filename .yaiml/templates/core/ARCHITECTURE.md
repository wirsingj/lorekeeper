---
yaiml: 0.2
role: architecture
title: Architecture
purpose: Durable system shape, boundaries, invariants, and intended architecture.
belongs-here: Current/intended architecture, ownership boundaries, data flow, invariants, debt, retired approaches.
not-here: current priorities, command reference, complete file inventory.
durability: durable; update when architecture changes materially.
read-with: SoT; Maintainer Guide.
update-when: boundaries, responsibilities, invariants, target architecture, or architectural debt change.
agent-guidance: Separate current, intended, transitional, uncertain, obsolete architecture; accidental implementation is not design.
---
# Architecture
Adapt headings; omit unused sections. Distinguish intended boundaries from accidental implementation.
## System Model And Components
Major components, responsibilities, data flow; no directory inventory.
## Boundaries And Invariants
Ownership of decisions, data, state, UI, integrations, and domain logic. Preserve lasting rules and decision sources.
## Current And Intended Architecture
Separate verified implementation, declared design, transitions, violations, and unresolved questions.
## Danger Zones
Fragile boundaries, concentrated responsibilities, generated outputs, sensitive modules; link maintainer procedures.
## Decisions And Retired Approaches
Retain useful rationale/rejected designs; prevent their accidental return; prune obsolete detail.
