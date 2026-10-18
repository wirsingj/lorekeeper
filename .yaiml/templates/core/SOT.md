---
yaiml: 0.2
role: sot
title: SOT
purpose: Current engineering state and direction.
belongs-here: Goals, developer asks, current capabilities, risks, test/verification state, priorities, divergence, useful recent lessons.
not-here: durable architecture, command reference, complete history.
durability: volatile; synthesize and prune aggressively.
read-with: Architecture; Maintainer Guide.
update-when: direction, verified reality, risks, priorities, or useful engineering lessons change.
agent-guidance: Verify implementation; preserve human intent; mark uncertainty/conflicts; prune stale detail.
---
# SOT
SoT = State Of The. Preserve the established file/location; otherwise use `SOT.md` in the chosen memory home (default: project-root `.yaiml/`). Adapt headings, omit empty sections, retain consequential unknowns. Replace changed facts in place; no session summaries or duplicate facts.
## Purpose And Direction
Identity, human asks, approved decisions, corrections, and relevant decision sources/owners; distinguish intent from implementation.
## Current State And Capabilities
Verified checkout capabilities with consequential evidence; separate proposals/deployment, label inference/unknowns. Keep unrelated passages stable; summarize completion as current capability.
## Active Risks And Divergence
Unresolved risks, debt, and conflicts among direction, design, code, tests, or contributors. Remove resolved items; preserve accepted risks and decision sources.
## Verification
Replaceable consequential results/gaps; distinguish defined/executed checks. Preserve prior date, revision, environment, limits; edits do not revalidate.
## Immediate Priorities And Open Questions
Next useful actions and shaping questions; link a larger backlog.
## Useful Lessons
Retain only conditions that change future action, active decisions, and rejected approaches worth preventing. Routine history belongs in Git.
