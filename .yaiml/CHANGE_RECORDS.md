---
yaiml-revision: "0.21.07ad3d8af566e501"
role: change-record-guide
title: Change Records And Current Memory
purpose: Preserve intent and evidence while choosing when shared memory can be consolidated.
not-here: A mode switch, automatic code merger, global worker detector or lock service.
durability: Shared procedure; preserve project authority, established paths and audit retention.
update-when: Recording, consolidation, recovery or retention procedures change.
agent-guidance: Reuse current context; routine recording is in VERSIONING. Read integration/recovery detail only when relevant.
---
# Change Records And Current Memory

Every material iteration has one retained record. Current memory combines the core snapshots with pending corrections. Consolidate during ordinary work when ownership permits; defer during overlap. There is no single-user/team mode and no extra user prompt for routine maintenance.

## Read Current Context

The existing `changes.md` locates the record directory (default `changes/` beside it), consolidated revision and exact incorporated record IDs. Retain older inline audit entries. Enumerate filenames and read only IDs absent from the receipt, then relevant snapshots. If the receipt lists missing records or its incorporation state is unclear, report incomplete context and follow recovery below; absence of pending filenames alone proves nothing. With no pending IDs, use current owners and actual artifacts for ordinary handoff or verification-status questions. Read a specific incorporated record only for missing/disputed evidence or an explicit history trace; do not bulk-read history to re-prove current summaries. Reuse loaded context. Parallel counters may match, so numeric/time cutoffs are insufficient.

For a large history, use existing file tools to compare the full receipt and filenames locally, bringing only pending paths, missing IDs and necessary header facts into context where practical. Truncated output is not a complete comparison. Report incomplete access/comparison rather than assuming no pending work; this does not authorize deleting history or replacing exact IDs with a numeric cutoff.

Incorporated means accounted for, including a correction explicitly superseded or reversed by a later recorded decision; it does not mean every historical assertion remains in effect. Keep that earlier ID incorporated so it cannot reappear as pending work.

Compose pending corrections by stated scope and human authority with actual artifacts. A retained baseline or later filename cannot undo another contributor's approved change. Preserve unresolved claims and recompute derived facts. Core-only readers cannot claim current context while records are pending. Short pointers in the core headers/openings locate this audit; they need no edits per pending change.

## Record Once

Use [the iteration steps](VERSIONING.md#complete-one-iteration). One `<revision>.md` is both the audit and memory correction: revision/parents/date; purpose and decision source; changed facts and their owners; all affected paths including the record itself; actual checks and limits. Aim for 100–200 words, expanding for necessary authority/evidence. Use code spans for historical paths. Avoid duplicate audit narratives, full replacement snapshots, unchanged constraints and transcripts.

Confirmed conversation-only decisions follow the same procedure. Tentative, read-only and unchanged work writes nothing. Completed records are immutable; corrections get linked new records. A task that also consolidates uses the same iteration, not another ritual revision. Later consolidation of completed pending records gets its own record and links all consumed heads.

## Decide Whether To Consolidate

Use existing task ownership and coordination context, without scans of unrelated projects or automatic worker launches. An ordinary task with established sole ownership of this working copy can consolidate at completion. Known parallel contributions to the same project memory, a designated integration writer, ambiguous ownership or unexplained changes require deferral. Separate branches do not by themselves establish sole ownership of shared project memory.

Before consolidation, reread affected snapshots, receipt and pending filenames against the state used for this task. If they changed, reorient and reconcile under the actual ownership; do not overwrite another writer. A clean Git status, lack of lock files or a quiet reread does not prove exclusivity. This convention cannot discover silent contributors across hosts or make comparison-and-write atomic; use existing coordination to establish ownership. If that remains uncertain, preserve work in a record and report pending consolidation.

When deferring, leave factual snapshots and the shared receipt unchanged. Repair current navigation immediately after moves/deletions, including links in snapshots, discovery and routes; stamp/audit focused repairs and preserve concurrent edits. This may cause structural conflicts but prevents unusable guidance. Keep historical records intact. Broad compression queues only a concise synthesis request and preservation concerns; it does not copy replacement snapshots.

## Consolidate And Check

With sole ownership, apply pending corrections and the current task to their existing owners, using actual artifacts and authority. Remove superseded claims and needless repetition; preserve constraints, contrary evidence and unresolved decisions. Update verification passages and affected headers, including setup evidence. Recompute combined claims and run relevant checks. A normal task may consolidate existing pending work without a separate request, within its project-memory scope; that does not authorize unrelated code integration.

Finalize the iteration record with all affected paths, including `changes.md`, imported records, moves and deletions. Stamp changed managed Markdown. Verify the record against the final diff. Update the consolidated revision and exact incorporated set only after snapshots, evidence and record agree; include the current record. Do not append the same narrative to `changes.md`. Retain incorporated records as history and skip their bodies during ordinary reading. Report necessary growth and any incomplete consolidation outside memory.

For requested Git integration, inspect the actual target/common ancestor and every consumed head through [yaiml-git](skills/yaiml-git/SKILL.md). A clean merge does not resolve meaning. Preserve imported records and prior audit exactly, reconcile artifacts within scope, then perform the same consolidation. Preparation for a commit/MR can do this with established sole ownership; it grants no commit or publication permission by itself.

## Transition And Recovery

An upgrade preserves existing memory, record directories, receipts and inline history. Establish missing record pointers prospectively; retain the recognized local heads/counter from the inline audit rather than resetting them. The receipt identifies incorporated per-change files, not every historical inline entry. Include existing record IDs only after confirming their corrections are represented in current snapshots or explicitly superseded/reversed with traceable outcomes; ambiguous records stay pending. Do not split or rewrite old entries. An old `maintenance-mode` flag is retired after its rules are reconciled, preserving stricter local authority; it does not erase pending work or make an uncertain receipt complete. Applied-source notes identify the transition and exceptions. Unchanged refresh is a no-op.

After interruption, compare records, snapshots and receipt with actual changes. Report incomplete work until they agree; a receipt cannot manufacture past checks. Missing records, divergent receipts or identical IDs with different bytes require preserving both claims and explicit repair. Reverts are new linked records. Archive/redact only under retention/privacy authority; do not discard history merely because the exact incorporation list grows. Sustained growth and competing consolidators need evaluation; no automatic pipeline is supplied.
