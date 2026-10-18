---
name: yaiml-verify
description: Verify changed work or consequential project claims against requirements and available independent evidence.
---

# yaiml-verify

Read [Using YAIML](../../YAIML_GUIDE.md) for shared context, evidence, authority and retention rules; reuse it and current core memory if already loaded. Identify what must be true and why: accepted requirements, human decisions, invariants, trusted reference examples or an accepted baseline under equivalent conditions. State missing authority or evidence instead of deriving expected answers solely from the candidate.

Select checks that discriminate the relevant failure from intended behavior. Inspect documented commands and their environment before running proportionate, authorized checks. Use source review, data checks, document consistency, examples or manual inspection where appropriate; a non-code project does not need invented tests. Do not add tests that merely mirror implementation. Run required checks and stop expanding after relevant checks pass unless new concerns justify more.

Compare baseline and candidate under equivalent conditions when available; old behavior is not inherently correct. Separate failure, unavailable environment and skipped checks. Preserve attributed reports even when unreproduced; unrelated passes cannot resolve them. Retry or repair within the authorized task, not by redefining acceptance criteria.

Return outcomes with scope, revision/environment where consequential, evidence and limitations. Never describe source-defined tests as passed or old runs as current. Identify relevant existing verification claims and their owners; pass which claims the results resolve, narrow, contradict or leave unchanged to `yaiml-maintain`, respecting read-only scope. In a composed task, return evidence to the active workflow without restarting it.
