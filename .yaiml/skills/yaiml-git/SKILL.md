---
name: yaiml-git
description: Carry out requested Git work such as reviewing changes, committing, branching, syncing or resolving conflicts while preserving project context and existing work.
---

# yaiml-git

Read [Using YAIML](../../YAIML_GUIDE.md) for shared authority, evidence and maintenance rules; reuse current context. Select the Git action the user requested and follow the project's branch/review policy. An upgrade or ordinary editing task does not itself request a commit, push, pull, branch switch or history rewrite. Reuse authorization already given for the specific action; do not ask again merely because this skill was selected.

Inspect the repository root, status, staged and unstaged changes, current branch or detached/unborn state, and relevant upstream information. Distinguish the working tree, index, local commits and remote state. A branch name, newer timestamp or remote default does not establish which content the human wants. When the human identifies the latest working files as canonical, include their uncommitted work in that understanding; use older commits as comparison/provenance, not replacements. Do not impose production/release assumptions or formal branch ceremony on an informal project.

For review/status requests, explain consequential changes and divergence without mutating them. For a requested commit, inspect the intended diff and existing staged work; stage only the authorized files or hunks. Keep unrelated changes intact, including within a shared file. Reconcile affected YAIML memory and run checks appropriate to the change before finalizing the commit. Describe the resulting behavior and relevant validation in its message; report the commit and remaining worktree state. Do not include secrets, local snapshots or generated output merely because they are untracked.

For branch creation or switching, establish the intended starting state. Preserve dirty files and index intent; use an appropriate isolated checkout when necessary and authorized. Do not silently stash, discard or move work to make a switch succeed. Branch cleanup, destructive resets and rewriting shared history need the specific human scope that covers their consequences.

For sync, pull, merge or rebase, inspect the actual target and common ancestor where available. Fetch relevant remote state when needed for the requested action and access is authorized. Choose the repository's established integration strategy; if divergent intent leaves a consequential choice unresolved, prepare the comparison before asking. A clean textual merge still needs meaning review. Resolve conflicts by preserving independent contributions and current human direction, then recheck affected behavior and memory; never select whole files by side as a shortcut. Stop dependent integration on an unresolved decision while continuing independent authorized work.

For YAIML conflicts, compare claims by responsibility: SoT current state and decisions, Architecture boundaries, Maintainer procedures and verification. Preserve each claim's evidence and authority; a newer timestamp alone does not resolve conflicting intent. Reconcile summaries with their detailed owners after integration so a clean merge cannot leave contradictory project memory. A semantic merge tool may assist comparison, but its output still needs this evidence and authority review.

For a requested push, verify the destination, branch, outgoing commits and expected remote state. A rejection is evidence to inspect, not permission to force or retry blindly. Preserve current work on access failures or changed remote history and report the precise blocker. Publication, deployment and unrelated repository changes remain separate actions.

Finish with what ran, resulting branch/commit state, verification scope and anything unresolved. Use `yaiml-maintain` for material project understanding; a routine Git action alone does not require a memory diary. No new Git wrapper, hosting service or background process is required.
