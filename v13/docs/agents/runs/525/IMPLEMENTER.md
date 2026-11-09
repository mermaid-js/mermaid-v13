# Implementer brief, spec #525 (architecture)

- Ticket: `gh issue view -R mermaid-js/mermaid-v13 <N>`. Spec: #525 (body and the decision comment; D500–D509 in `v13/docs/DECISIONS.md`). Docs: `v13/docs/{DESIGN,REQUIREMENTS,DECISIONS}.md`. Recipe: `v13/docs/agents/port-diagram/` (README, parser-method, pitfalls, theming, language). Theme contract: `v13/docs/agents/runs/414/CONTRACT.md`.
- Notes: this folder. Read `INDEX.md`, `GAPS.md` (close the items listed for your ticket) and `tickets/<dep>.md` for each blocker.
- Tickets: T0 #590 (compass), T0b #591, T0c #592 (each core ticket is its own PR into `mermaid-v13`, based on `origin/mermaid-v13`, marked ready once CI is green), T1 #594, T2 #599, T3 #607, T4 #614, T5 #618, T6 #619.
- Integration branch: `feature/525_architecture`. Worktree: `/Users/ashishj/repos/mermaid-v13/.claude/worktrees/arch-t<N>` on `feature/<N>_<short>`. Use absolute paths; stay out of other worktrees. Run `pnpm install` first (Volta: `~/.volta/bin`, `VOLTA_FEATURE_PNPM=1`).
- References: v12 source `git show fa796a943:packages/mermaid/src/diagrams/architecture/…`, grammar `git show fa796a943:packages/parser/src/language/architecture/…`, config schema `git show fa796a943:packages/mermaid/src/schemas/config.schema.yaml`. Pele (MIT reference, never the oracle, D325): `/Users/knsv/repos/pele/src/diagrams/architecture/`. Worked examples: packet and radar (Langium), pie (`loadLangiumLexerOracle`), treemap/wardley/xychart/sankey/venn (newest ports).

1. Confirm your base: `git merge-base --is-ancestor feature/525_architecture HEAD` (T0, T0b, T0c: `origin/mermaid-v13`). If that fails, reset onto it.
2. Test-first. Test through `createMermaid().render()` / `renderSync()`, except where the ticket names another seam (T0: `compass(graph)`; T3: the built `LayoutGraph`).
3. Stay in the ticket's scope. Touch shared files minimally and additively (other ports edit the same registry, tables and lists). Where the spec and D-ids don't decide, pick the option most consistent with them and write it in `GAPS.md` under your ticket.
4. Test sources go in `.mmd` fixtures under `e2e/diagrams/architecture/`; rejected or lexer-only inputs in `packages/conformance/corpus/architecture-cases.json`. Never hand-written TS corpus arrays. Files under `generated/` are gitignored: `git add -f`.
5. Machine is shared: run `pnpm check` (and `pnpm e2e` where asked) as `VITEST_MAX_WORKERS=4 lockf /Users/ashishj/repos/mermaid-v13/.tmp/m3-check.lock pnpm check`. Known flakes (don't edit): R-LANG-4 `language-budget*.spec.ts`, `explorer.spec.ts` "/node-render over 1 MiB is a 413", `preprocess/stress.spec.ts` timeouts under load. Stress specs use pie's ratio pattern (`tLarge / Math.max(tSmall, 2)`).
6. Commit with no AI attribution (no Co-Authored-By, no "Generated with"). Never `--no-verify`. Don't push, open PRs, or comment on or close issues.
7. Before reporting, merge the base branch again and re-run `pnpm check`.
8. Write `tickets/<N>.md` (≤ 40 lines): exports, how to use them, test helpers, gz size (and gated core size from `measureCoreSize` in `packages/bench/src/core-size.spec.ts` if core changed), unmet criteria.
9. Reply in ≤ 12 lines: branch, head sha, checks, deviations, unmet criteria.
