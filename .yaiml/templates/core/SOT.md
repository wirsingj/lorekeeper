---
yaiml-revision: "0.23.a56fdcf631fe8b72"
yaiml: 0.2
role: sot
title: SOT
purpose: Current project state and direction.
belongs-here: Goals, human asks, current capabilities, risks, verification state, priorities, divergence, useful recent lessons.
not-here: durable architecture, command reference, complete history.
durability: volatile; synthesize and prune aggressively.
read-with: Architecture; Maintainer Guide.
update-when: direction, verified reality, risks, priorities, or useful project lessons change.
agent-guidance: Verify actual work; preserve human intent; mark uncertainty/conflicts; prune stale detail.
---
# SOT
SoT = State Of The. Preserve the established file/location; otherwise use `SOT.md` in the chosen memory home (default: project-root `.yaiml/`). Adapt headings, omit empty sections, retain consequential unknowns. Replace changed facts in place; no session summaries or duplicate facts.
## Purpose And Direction
Identity, human asks, approved decisions, corrections, and relevant decision sources/owners; distinguish intent from implementation.
## Current State And Capabilities
Verified deliverables/capabilities with consequential evidence; separate proposals and released outcomes, label inference/unknowns. Keep unrelated passages stable; summarize completion as current capability.
## Active Risks And Divergence
Unresolved risks, debt, and conflicts among direction, design, deliverables, checks, or contributors. Remove resolved items; preserve accepted risks and decision sources.
## Verification
Replaceable consequential results/gaps; distinguish defined/executed checks. Preserve prior date, revision, environment, limits; edits do not revalidate.
## Immediate Priorities And Open Questions
Next useful actions and shaping questions; link a larger backlog.
## Useful Lessons
Retain only conditions that change future action, active decisions, and rejected approaches worth preventing. The concise change audit belongs in core changes.md; exact diffs belong in Git when available.
