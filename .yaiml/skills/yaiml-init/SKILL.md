---
name: yaiml-init
description: Establish or refresh YAIML project context and local skills from one pasted prompt or skill invocation.
metadata:
  yaiml-revision: "0.17.cd27b89d4466f476"
---
# YAIML Init

Run bootstrap now in the target project. One invocation covers acquiring guidance, creating useful project memory, and connecting local skills for later ordinary work; do not stop at saving this skill or explaining setup. Follow target instructions and preserve existing work.

1. Default to https://github.com/wirsingj/YAIML, YAIML's only built-in upstream. Resolve its latest `main` at each invocation, then use that exact commit for bootstrap and all resources in this acquisition. This prompt's `yaiml-revision` is a document stamp, not an upstream pin. Use another source (including a local checkout or snapshot) or ref only when explicitly requested by the user, within that request's scope; for an alternative repository without a requested ref, resolve its default branch once. Workspace proximity and old source notes are not requests. Identify requested snapshots and material uncommitted edits; never reset a dirty checkout or silently substitute sources when access fails.
2. Retrieve that source's `.yaiml/BOOTSTRAP.md` and execute it. Acquire its listed adoption resources, following relative references from their source locations. The reference supplies methods, not project facts or permission. If required access/content is unavailable, report the precise gap, preserve working local guidance and continue independent work; never claim a complete installation.
3. Bootstrap establishes `.yaiml/` memory, shared operating rules, a local skill catalog, the standard `yaiml-*` skills and supported host instruction/discovery routes. Existing useful memory and local adaptations survive refresh. Read source details on demand; do not load the entire reference repository into context.
4. Verify reachable local resources and host routes. Report what is usable, actual checks, source revision and unresolved gaps. Ordinary work should now use and maintain local context without another YAIML prompt. Optional named skills such as `yaiml-audit` and `yaiml-to-do 10` use the same workflows. Native slash syntax depends on the host.

This setup creates no runtime, background task or automatic backlog execution. Existing authority still governs publication, destructive actions and YAIMLACP delegation.
