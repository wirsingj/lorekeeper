---
yaiml-revision: "0.24.835a3cca49fadd16"
role: revision-guide
title: Revisions And Change Records
purpose: Connect file revisions, project changes and YAIML releases without losing concurrent contributions.
not-here: Project facts, automatic merge decisions, identity proofs or an executable versioning service.
durability: Durable method; preserve recorded lineage and project retention policy.
update-when: Revision, migration, integration or audit responsibilities change.
agent-guidance: Record actual changes and evidence; never invent missing history or infer authority from a stamp.
---
# Revisions And Change Records

For routine completion, read **Complete One Iteration** only. Read the other sections when interpreting versions, establishing tracking, changing retention or integrating concurrent work. Reuse rules already current in context.

## Three Separate Versions

| Identity | Meaning and owner |
| --- | --- |
| YAIML product release | Published guidance generation in [RELEASE.md](RELEASE.md), with an exact source commit or disclosed snapshot recorded by the adopter |
| Discovery version | The layout label in `yaiml.yml`; preserve it during ordinary content edits |
| Project revision | `x.y.z`: YAIML release major, project-local iteration counter, random change tag |

For example, `0.27.1f463a82b7dc905e` is project iteration 27 using YAIML major 0. It is not product release 0.27, a verification date, or [Semantic Versioning](https://semver.org/). A random final component does not satisfy SemVer's numeric patch rule. Product releases use numeric major/minor/patch labels; document revisions use this separate convention.

Use a fresh 16-character lowercase hexadecimal tag from available cryptographic randomness for each iteration. This short identifier is UUID-like, not a full [UUID](https://www.rfc-editor.org/rfc/rfc9562.html), timestamp, signature or guaranteed unique value. Check known records for collisions. If randomness is unavailable, report revision assignment incomplete instead of fabricating an identifier. No particular language, installed package or service is required.

## Complete One Iteration

One coherent material change is one iteration, including a confirmed conversational decision or new evidence that changes understanding. Multiple draft writes share its revision. Read-only, tentative and unchanged work creates none.

[Change Records](CHANGE_RECORDS.md) owns pending context, ownership, consolidation and recovery. Derive local heads from pending records plus the consolidated head. Each material task writes one record; when ownership permits, consolidate current memory in that same iteration. Overlap or uncertain ownership defers consolidation, without a mode switch.

1. Inspect the final task diff and existing audit heads; reread concurrent edits. Preserve unrelated work; select immediate or deferred consolidation under the record procedure.
2. Allocate `x.y.z`: applied YAIML release major; one above the highest known **local** counter; a fresh 16-character lowercase hex tag from available cryptographic randomness. Retain the counter across major upgrades; upstream resource counters do not raise it. Quote the revision; use decimal integers without fixed width or floating-point rounding. Check known tag collisions; if generation fails, report incomplete assignment.
3. Stamp changed YAIML-managed Markdown only: `yaiml-revision: "x.y.z"` in memory headers, under `metadata` in skill frontmatter, or `<!-- yaiml-revision: x.y.z -->` on plain entry pages outside copyable payloads. Untouched files and unmodified acquired resources retain their stamps. A newly instantiated template gets a local stamp; preserve legal notices exactly. Code/configuration receive no injected headers.
4. Create one concise `<revision>.md` in the audit's record directory: revision, parent(s), date, intent/decision source, changed facts/owners, outcome, **all affected paths** including the record, and actual checks/limits. Identify renames/deletions. If consolidating, include snapshot and audit-receipt paths and incorporated IDs; otherwise leave their factual contents unchanged. Finalize after checks. Do not predict a commit hash or claim another contributor's work.
5. Compare the entry/stamps with the final diff against the pre-task state, including writes completed before a partial failure. List only actually changed paths as affected; put inspected or copied-but-unchanged resources in verification scope, not that list. Preserve previous entries; subsequent corrections get linked revisions. Report incomplete writes or failed checks honestly.

Managed Markdown means declared memory, owned YAIML guidance/templates/skills and entry routes, not every Markdown file in the project. Source stamps are scoped by provenance; local adaptations use local stamps and retain their source note. Missing tracking uses **Adopt From Older YAIML**; divergent heads use **Concurrent Work And Integration**. Those procedures own the exceptional cases.

## Core Change Record

Default to `.yaiml/changes.md`; reuse an existing equivalent audit owner, preserve its entries and retention, or choose a nonconflicting path. Keep SoT, Architecture and Maintainer Guide current and concise. The fourth core role owns a durable audit of changes, not a transcript, command log or second backlog. It locates retained per-change records and identifies those already incorporated. There is one workflow; immediate versus deferred consolidation follows current ownership, not a saved mode.

Each retained record identifies its revision, parent revision(s), date, intent/authorized decision source, concise outcome, affected paths and consequential verification/limitations. Include old and new paths for renames, and mark deletions. An exact commit can be added when known; do not predict the hash of a commit containing the entry. Git supplies exact diffs and ancestry when available; a revision ID is a lookup aid, not a content hash. Without Git, retain the record and state the evidence limits.

Read the header/receipt, pending records and relevant prior evidence during normal orientation, not the entire accumulated audit. Preserve entries by default. Corrections after a completed iteration get a new linked entry; do not silently rewrite past outcomes. Compression of current memory does not erase the audit. Archive, redact or consolidate records only under the project's explicit retention/privacy authority, preserving traceability and never assuming Git alone satisfies it. Exclude sensitive content from the start.

## Concurrent Work And Integration

Two branches may both produce counter 28 with different tags and the same parent. Neither counter, tag, timestamp nor file order selects the winner. Keep both entries and independent changes. Before integration compare the actual branches and common ancestor, resolve meaning through project authority, and recheck the combined result.

A completed reconciliation creates a revision with a counter above both known lineages and both heads as parents. Stamp files whose final content changed through reconciliation; unchanged imported files retain their existing stamps. Keep imported entries/records intact and list them as incorporated in the receipt, without duplicating their histories. A plain fast-forward retains the existing lineage and needs no synthetic iteration.

Reverts are new changes linked to the reverted revision. Squashing or cherry-picking Git commits must preserve the audit IDs and record consequential integration decisions. If identical IDs describe different changes, retain both claims and resolve the collision with a fresh ID and explicit mapping; do not overwrite one. Interrupted work remains incomplete until the actual files and record agree; a later session repairs the gap without inventing past evidence. These records can inform a future semantic Git tool; no automatic merger or tamper-proof audit is implemented.

## Adopt From Older YAIML

Init/refresh establishes the fourth role and revision tracking in place, without resetting mature knowledge or relocating files. Preserve existing version labels and prior records. If an older local sequence has clear semantics, retain its mapping; otherwise create an explicitly prospective baseline at counter 1 and state that earlier iterations are unknown. Never reinterpret `yaiml: 0.2` or discovery `version` as a file counter.

Establish the record directory/receipt under [Transition And Recovery](CHANGE_RECORDS.md#transition-and-recovery), retaining inline entries without rewriting them. For each existing managed artifact, inspect its role, header and actual path; preserve its body, legacy labels and header-field order while adding the baseline stamp in a compatible location. Include local custom skills and YAIML routes; newly acquired, unmodified upstream resources retain their source stamps instead. Record the exact stamped paths, exceptions, preserved audit owner and source release/commit in the baseline entry. Check that no project knowledge disappeared and every changed path is covered. A repeated updater run must leave that baseline and untouched stamps unchanged, rather than start again at 1.

Keep the older discovery shape: add the changes role where compatible (`core.changes` in the current shape, `documents.changes.path` in the recognized legacy shape). When a consumer cannot accept an added role, use an explicit host/maintenance pointer and report that limitation; do not rewrite its format or claim compatibility without checking. A reader that ignores the new role can retain its original functionality without providing audit support; report those separately.

Check known consumers against the actual stamped documents and map. Recognition, role discovery and automated writer support are separate capabilities: a tool may read the original roles yet miss the audit or write without advancing revisions. Preserve working read routes; identify unsupported writes and their required repair or authorized reconciliation before describing the integration as ready. A passing older reader suite alone does not establish these capabilities.
