---
name: yaiml-to-do
description: Complete the next requested number of feasible project priorities, then verify and maintain memory.
---

# yaiml-to-do

Read [Using YAIML](../../YAIML_GUIDE.md) for shared context, evidence, authority and retention rules; reuse it and current core memory if already loaded. Accept a positive item count and optional scope from natural language or a host invocation such as `/yaiml-to-do 10`. With no count, do the next feasible priority. Clarify an unusable count only if context cannot resolve it. Use the existing SoT or its linked project backlog; never create a competing task system.

1. Read ordered priorities, dependencies, acceptance criteria and the implementation scope authorized by the request. Reconcile preceding audit findings with approved direction. Identify independently grounded expected outcomes before making changes. Resolve only consequential ambiguities; do not ask again for implementation already requested.
2. Select up to the requested count of feasible original items. Respect dependencies and human ordering. Skip blocked items only where independent work remains useful; report why. Do not split one item into artificial completions, invent tasks to fill the count, or treat the number as worker count.
3. Carry each item through implementation and appropriate checks, using `yaiml-verify` at meaningful checkpoints. For non-code projects, verify the relevant document, analysis, process or deliverable. A command's existence or a reported plan does not establish success. If a check fails, diagnose/fix within scope; keep remaining failures visible.
4. Use `yaiml-maintain` before finishing to replace stale state, remove completed priorities and retain current capability, unresolved risks and useful lessons. Preserve human decisions and contributor conflicts.

Report completed original items, partial/blocked work, actual/unrun checks and the next actionable priorities. Stop at the requested count or exhausted feasible scope; further work is not automatic. Publication, destructive operations and delegation retain their existing authority requirements.
