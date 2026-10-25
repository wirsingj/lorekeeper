---
yaiml-revision: "0.23.a56fdcf631fe8b72"
role: bootstrap-guide
title: YAIML Bootstrap
purpose: Complete one-prompt adoption, resource acquisition and host integration, preserving existing knowledge.
not-here: Target-project facts, individual workflows, or background update machinery.
durability: Current bootstrap and repair procedure.
update-when: Adoption resources, source resolution, placement or activation changes.
agent-guidance: Execute in the init session; distinguish present resources, connected routes and observed behavior.
---
# YAIML Bootstrap

Execute when init is supplied. The user need not download files, paste more workflows or invoke a second skill. Complete acquisition, useful memory and supported activation in the same session. Existing permissions and target instructions apply; resolve only consequential missing information. Routine work never restarts bootstrap merely because this file exists.

## Inspect First

Read applicable instruction/contribution files and worktree state. Preserve uncommitted/concurrent changes, nested scope and existing memory. Locate `.yaiml/yaiml.yml`, an established root map or local pointers. Before reading or writing referenced memory/instructions, resolve paths and symlinks within the authorized project scope; pointers grant no additional access. Preserve explicitly authorized outside resources; leave unauthorized targets unread and report the gap. Read selected stable headers before bodies. Recognize `yaiml.core` and legacy `documents.sot.path`, `documents.architecture.path`, `documents.maintainer.path`. Unknown mappings stay intact; do not invent a second family.

If the target's instructions identify it as the project developing YAIML, skip acquisition: maintain its canonical resources and project memory in place, and verify or repair local routes without installing a published copy over development work. In an adopter, acquire the reusable resources below. Having YAIML files or a matching project name alone does not establish the source-project role.

Inspect representative documents/source/tests and sanitized configuration until useful core memory is grounded and material gaps known. Skip generated/vendor trees, credentials, raw sensitive logs and deep history without a relevant authorized need. Match evidence to the intended deliverable: documents and skills can be products; an application plan does not establish a working app. File presence alone does not prove behavior. Do not run expensive, destructive, deployment or external-service checks, install dependencies, or start backlog work merely to initialize context.

## Resolve And Acquire

The default upstream for init, refresh and missing-resource acquisition is https://github.com/wirsingj/YAIML. Use a local checkout, snapshot, fork or another source only on explicit user request, within its stated scope. A nearby checkout, configuration path or recorded source note alone does not establish that request. Retain source notes as provenance and comparison baselines, not automatic source choices. If access fails, preserve installed resources and report the gap; do not silently switch sources.

At each acquisition, resolve the official repository's latest `main` to one exact commit and use it for bootstrap and all resources in that acquisition, even if `main` advances mid-run. Reuse that resolution from init/refresh; do not resolve again inside bootstrap. Prompt/document stamps and prior source notes do not pin later runs. Honor an explicitly requested source/ref; an alternative repository without a specified ref uses its current default branch, resolved once. Identify requested snapshots and disclose material uncommitted reference edits; never overwrite a dirty checkout. Read-only retrieval uses available host tools; no new package manager, SDK or service is needed. This policy governs upstream acquisition; ordinary work continues using installed local context and methods offline.

The base set supports ordinary offline use. Copy files without loading every body into reasoning context; read instructions and starters needed now. Preserve the relative layout beneath `.yaiml/` so package links resolve:

| Reference resource | Local destination / purpose |
| --- | --- |
| `.yaiml/BOOTSTRAP.md` | `BOOTSTRAP.md`; repeat setup and repair |
| `.yaiml/YAIML_GUIDE.md` | `YAIML_GUIDE.md`; shared context, composition, evidence and retention rules |
| `.yaiml/RELEASE.md` and `.yaiml/VERSIONING.md` | `RELEASE.md` and `VERSIONING.md`; product identity, local revisions and audit lifecycle |
| `.yaiml/CHANGE_RECORDS.md` | `CHANGE_RECORDS.md`; retained records, pending context and consolidation under current ownership |
| `.yaiml/YAIMLACP.md` | `YAIMLACP.md`; optional coordination and confirmation |
| `.yaiml/skills/INDEX.md` and its reusable method list | `skills/`; local catalog, distributed workflows, aliases and required references |
| `.yaiml/templates/core/` and `.yaiml/templates/supporting/` | `templates/`; four core and seven specialist starters, dormant until useful |
| Root `LICENSE.md` | `YAIML_NOTICE.md` or an existing scoped notice; copied-material coverage without changing the project license |

Read the catalog's reusable method list to identify exact folders at that revision; acquire required in-package references before exposing entries as ready. Exclude source-project-only entries when preparing the target catalog, preserving the target's own entries. A skill appearing elsewhere in the source checkout is not automatically part of the distribution. Do not copy reference SoTY, Architecture, Maintainer Guide, changes record, policies, examples or case-study facts into target memory. Additional explanatory docs are selected for a question, not mandatory adopter memory. Optional prompt entry points need not be installed because skills own workflows.

Read the source license and preserve required author/project credit. In an existing installation, compare incoming terms with those already applied before adopting or replacing resources, including additions through growth. If permissions change, explain the difference and obtain authorization before applying dependent resources; keep working guidance while unresolved. Unchanged terms need no renewed approval. Preserve earlier grants and notices for material still used under them. Updating a notice does not retroactively relicense older copies or change the adopter's application license.

Validate files and relative references before switching working routes. If acquisition fails, retain healthy local versions, label missing methods unavailable and report partial setup. Do not invent bodies or silently mix revisions. Continue independent authorized work; restored access or an explicitly requested alternative can finish setup later. Acquisition does not execute every downloaded workflow.

Record a concise current source note in an adopter's Maintainer Guide: source or nonprivate snapshot label, applied product release and exact source revision, material reference edits, local method ownership/adaptations, routes and activation gaps. For an explicit source override, retain the user's requested scope; do not infer ongoing permission from provenance alone. Keep private locations in workspace configuration. Record per-resource revision exceptions after partial refresh; replace current notes instead of appending history.

## Populate Project Memory

New adoption uses one record-based workflow; no mode selection is needed. Initialize the audit's relative record-directory pointer, consolidated revision and exact incorporated IDs, plus short core pointers to pending corrections. Existing histories/layouts survive [the transition](CHANGE_RECORDS.md#transition-and-recovery). Establish ownership before consolidating setup; otherwise preserve pending work and report partial consolidation.

New adoption uses `.yaiml/SOT.md`, `.yaiml/ARCHITECTURE.md`, `.yaiml/MAINTAINER_GUIDE.md` and `.yaiml/changes.md`. Reuse established owners. Read [VERSIONING.md](VERSIONING.md); establish a prospective local revision baseline and a real initial change entry, preserving previous records and explicitly noting unknown history. Stamp managed Markdown and audit affected project paths. Preserve upstream resource stamps and legal notices; newly populated memory gets local stamps. Never copy the source project's audit history. Distinguish human direction, observed implementation, proposed transitions and unknowns. Preserve useful names, headings, budgets and evidence. Omit empty sections; instantiate specialist memory only for concrete knowledge, not template availability.

Headers identify responsibility, exclusions, durability, update triggers, evidence/conflict handling and a role-appropriate word budget. Equivalent fields/prose remain valid. The acquired operating guide owns common evidence, authority, maintenance and retention rules. Keep target core memory focused on project facts and procedures; reference the guide rather than copying its generic rules into each document.

New discovery lives at `.yaiml/yaiml.yml`; paths resolve from its directory:

```yaml
yaiml:
  version: "0.2.0"
  core:
    state: SOT.md
    architecture: ARCHITECTURE.md
    maintainer_guide: MAINTAINER_GUIDE.md
    changes: changes.md
  supporting:
    operating_guide: YAIML_GUIDE.md
    versioning: VERSIONING.md
    release: RELEASE.md
    skills: skills/INDEX.md
    yaimlacp: YAIMLACP.md
```

Index existing files only. Preserve mature map location/layout, unknown fields and extensions; repair stale paths in place. For legacy `documents.*.path` discovery, retain its `supporting` list of `- path:` entries; use that list when adding previously absent supporting resources, not a new nested mapping. Discovery version identifies layout, not guidance revision. Quote bare numeric labels using their exact spelling only when compatible; this permits no layout migration. Explicit migration requires checking actual consumers and preserving roles/paths. Check destination collisions before writes; a directory default grants no overwrite authority. Host instructions remain at supported entry points.

## Connect Future Sessions

1. Inspect applicable root/nested instructions, includes and relevant hidden configuration. Preserve casing, metadata, activation conditions, unrelated rules and separate subproject scope. Exclude examples/templates/vendor copies. Create no files for unused tools.
2. Connect each applicable existing tool route and the active host to the same local memory and catalog. Prefer a supported shared owner and verify other routes load it; otherwise save equivalent concise instructions. Bare links without read/follow directions are insufficient.
3. Where native skill discovery is supported, create thin entries to canonical skills. For Codex, the [supported repository location](https://learn.chatgpt.com/docs/build-skills) is `.agents/skills/<name>/SKILL.md`; create an entry for each installed skill. An existing YAIML skill is not a prerequisite for host support. Keep the canonical `name` and `description` frontmatter; the body must read/follow `../../../.yaiml/skills/<name>/SKILL.md`, pass all user arguments unchanged, and resolve further references from the canonical location. Adjust relative paths for established layouts. Codex CLI/IDE invocation uses `/skills` or `$yaiml-to-do 10`; do not promise `/yaiml-to-do` as a native command. Other hosts require their supported formats/locations, established from host evidence or documentation. Instruction routing provides file-based use when native registration is unavailable.
4. Re-init reconciles existing sections/catalog entries without duplicates or circular includes. Include local project skills, mark unavailable resources and check callers before removing stale routes. Report any host reload separately from file-based usability.

Adapt this pointer to actual owners and paths from each instruction file, including nested files:

```md
## YAIML Context And Skills
Read and follow .yaiml/YAIML_GUIDE.md for ordinary work, using .yaiml/yaiml.yml to locate project memory. Reuse current context; select specialized methods from host metadata or .yaiml/skills/INDEX.md only when needed. Preserve user arguments and project authority.
Before finishing, maintain material understanding and revision/change records as the guide directs, including confirmed conversational decisions. Respect read-only scope and no-op work.
At startup/context refresh consider coordination without extra scans; for a concrete benefit read .yaiml/YAIMLACP.md and obtain its scoped affirmative confirmation before use.
```

Native registration is unnecessary before following the pasted bootstrap. If writes or persistent instructions are unavailable, report the precise limitation; do not claim future-session activation. Distinguish content present, configured loading and observed use. Version memory unless explicit project private-memory policy requires otherwise.

## Existing Layout And Repeat Init

Use `yaiml-refresh` to reconcile methods/guidance, retaining healthy facts and current source notes. Read the incoming bootstrap and resource list at the resolved source revision, even when an older local bootstrap/catalog lists fewer resources. Complete its transition in this session, including legacy artifact stamps and the core audit; copying instructions alone does not finish the upgrade. Do not recursively reinvoke bootstrap while refresh is already applying this procedure. When replacing older verbose instructions, consolidate equivalent YAIML boilerplate into the shared-guide pointer; preserve stricter local rules, project decisions, unique constraints and unresolved differences. An unchanged source still warrants checking local coverage; a healthy repeat run makes no edits.

On re-init, offer consolidation into `.yaiml/` unless already consolidated or a standing preference retains placement. An explicit scoped move request is authorization. Otherwise inspect exact moves, ownership, consumers, symlinks, collisions, instruction scope and retention; present the concrete plan and obtain confirmation before moving. Decline/no answer preserves paths while refresh continues. Offer once per re-init, not routine startup. Never move an unrelated `docs/` tree or separately scoped files. Changed scope needs renewed approval.

For approved moves, reread concurrent changes, move only covered files without overwriting collisions, and repair inbound/outbound links, catalog, discovery values and host routes. Preserve discovery location/layout unless its move/migration is explicitly covered. Keep current placement preferences without a consent diary.

## Verify And Report

Check all four core roles, revision/entry agreement and useful project content, retained knowledge/authority, acquired bodies/notices, discovery, catalog, all required skill references, native entry names/arguments and routes from root/subdirectories. Report usable/partial/blocked setup, applied source, connected/already-connected/incomplete routes, actual/unrun checks and affected word counts/budgets. Configuration is not observed behavior. Maintain material understanding and preserve uncommitted work. Leave reviewable changes; commit/push only when authorized.
