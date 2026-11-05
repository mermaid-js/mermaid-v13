# Implementer brief — spec #265 (render speed: exact fixes and bench reporting)

- Ticket: `gh issue view -R mermaid-js/mermaid-v13 <N>`. Spec: `gh issue view -R mermaid-js/mermaid-v13 265`. Docs: v13/docs/{DESIGN,REQUIREMENTS,DECISIONS}.md (D200–D209 in the last section of DECISIONS). This is not a diagram port: no parser or oracle steps.
- Notes: this folder. Read INDEX.md and tickets/<dep>.md for each blocker.
- Base: T0 (#271) and T1 (#272) branch from `mermaid-js/mermaid-v13` and get their own draft PR into it; T1 is cut from T0's branch while T0 is unmerged. Every other ticket branches from `feature/265_render-speed`. Branch names: `feature/<N>_<short>`. Work in a worktree of your own; stay out of the main checkout and other worktrees. Run `pnpm install` first.
- Machine: this spec's timing is judged on the reference machine (D208). One ticket at a time there. Do not start a second session while one is building, testing or timing.
- Constraints: **no change to rendered output** (D200). Don't edit `.github/workflows/*`. Don't add root package.json scripts (ask). New D-ids only in D200–D209 and only via the maintainer: escalate instead. `core` and `diagram-*` gain no Node imports (R-ARCH-1).

1. Use the Skill tool with `tdd`. Write the unit spec first and see it fail.
2. Stay in the ticket's scope. Escalate anything that contradicts DESIGN, REQUIREMENTS or a D-id in your reply instead of deciding it.
3. Identity gate (from T0 on): every bench fixture byte-identical to the base ref. A sub-change that fails is dropped and named in the handoff, not kept with a snapshot update.
4. `pnpm check` until green.
5. Binding A/B, fix tickets only, when nothing else runs on the machine (`uptime` load under 3):

   ```bash
   pnpm --filter @mermaid-js/bench bench --renderers v13,v13-base,pele --base <base sha> --mode report
   ```

   From `packages/bench/dist/reports/latest.json`, report three ratios (head to Pele, base to Pele, head to base) as sums of warm time over: all common fixtures, the 14 largest (`perf/*` plus `pele/flowchart-500`), and the tiny set (fixtures Pele renders in under 0.5 ms in the same run). Put the table in the PR description. Report ratios, not milliseconds.
6. Commit with no AI attribution (no Co-Authored-By, no "Generated with"). Push only to the `mermaid-js` remote. Open a **draft** PR and mark it ready (`gh pr ready`) once it is done: criteria met, CI green, mergeable. Never merge, and never mark the integration PR ready before INDEX.md's finish rule holds.
7. Write `v13/docs/agents/runs/265/tickets/<N>.md` in your branch (≤ 40 lines): what changed, the A/B table, anything dropped under the identity gate, unmet criteria. Commit it.
8. Reply in ≤ 12 lines: branch, head sha, PR, checks, the head-to-base ratio, deviations, unmet criteria.
