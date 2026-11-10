# Run notes, spec #519 (M5b ishikawa, `@mermaid-js/diagram-ishikawa`)

Integration branch `feature/519_ishikawa` (from `mermaid-v13` at 521fb76ee). Draft PR: #626.

| Ticket | Issue | Blocked by | State |
| --- | --- | --- | --- |
| T1 lexer parity gate | #580 | #285 (merged) | merged (ff 40d678fff; package entry 1,803 B gz, no core change) |
| T2 grammar, parser, model, AST | #581 | #580 | merged (ff a2cab0f30; package entry 4,178 B gz, no core change) |
| T3 fishbone layout | #582 | #581 | merged (ff 8deb7a764; package entry 7,154 B gz, no core code change) |
| T4 SVG renderer | #583 | #582 | merged (ff ff665803f; package entry 8,478 B gz; core 94,412 B gz unchanged) |
| T6 language facet | #584 | #581 | merged (ff 9b751af9f; package entry 8,758 B gz, `./language` 5,984 B gz; core unchanged) |
| T5 integration | #585 | #583, #584 | merged (ff b6c536108; package entry 8,784 B gz, `./language` 6,010 B gz; core 94,431 B gz, +19) |
| T7 ASCII outline (optional) | #586 | #585 | merged (ff 62a6acd3e; text path 7,258 B gz, `./ascii` 1,032 B gz; core 94,448 B gz, +15) |

- `01-v12-ishikawa.md`: pointer notes on v12's grammar, DB, renderer, specs, docs page and the corpus.
- `02-v13-seams.md`: pointer notes on the plugin contract, `custom` ports, conformance wiring and the seams T1–T7 touch.
- `IMPLEMENTER.md`: the brief every ticket agent reads.
- `GAPS.md`: unmet criteria and choices per ticket.
- `tickets/<n>.md`: handoffs.

## Wave 3

block #521, c4 #522, agentflow #523, usecase #517, treeView #518, ishikawa #519 and requirement #520 run in parallel on AI-Max: at most one ticket agent at a time here. Shared lists conflict (registry, detectors, `SECTION_OWNERS`, `HARVESTS`, `JISON_TYPES`, knip, theme vocabulary lists, adapter regex, language goldens' `empty.out`, licence tables, MIGRATION.md, RELEASING.md): when `mermaid-v13` moves, merge it, keep every side's rows, regenerate generated files, the lockfile and goldens.

## Core size (R-PERF-8, D546 limit 98,304 B gz, `measureCoreSize`)

| After | Core gz | Δ |
| --- | --- | --- |
| base (521fb76ee) | 93,891 | — |
| T1–T4, T6 (base moved to 1a78e25d7) | 94,412 | 0 (base moves only) |
| T5 (registry row) | 94,431 | +19 |
| T7 (`ascii` format) | 94,448 | +15 |

## Worktrees

Ticket worktrees live at `/Users/knsv/repos/mermaid-v13/.claude/worktrees/t<N>`, never inside the integration worktree: `knip --no-gitignore` in the pre-push `pnpm check` scans nested worktrees and fails (it blocked the first push).

## #637 migration (per-diagram shared files)

After T6 merges, **and only once the coordinator says the shared fix for ports without a `mermaid.plugin` manifest has merged** (without it `pnpm regen` drops ishikawa from conformance's devDependencies, `gen:grammar` skips its `workspace.yaml` grammars and `theme-used-by.spec.ts` fails; don't add the manifest early or patch `tools/workspace/diagrams.ts`), and before T5 starts, merge `mermaid-v13` once (with #637, 18b902dcb) per `v13/docs/agents/port-diagram/shared-files.md` "Moving an in-flight port": parity suite and the `JISON_TYPES` row → `packages/conformance/src/ishikawa/{suite,tables}.ts` (the smoke-list line goes); `GRAMMARS` → `grammars:` and config/release → `packages/diagram-ishikawa/workspace.yaml`; the theme-used-by list line goes; **the ishikawa entries on core `usedBy` lists (`TEXT_USERS`, `lineColor`/`mainBkg`/`textColor`, added by T3/T4) are removed**; any divergences → `divergences/ishikawa.json`. Then `pnpm regen`, `CI= vitest run packages/conformance/src/yaml-tree.spec.ts`, `vitest run packages/language-service-codemirror -u`, scoped checks, full `pnpm check` on slot A, push. T5 then writes its MIGRATION rows to `v13/docs/migration/ishikawa.md` and its hand-drawn fixture list to `e2e/diagrams/ishikawa/hand-drawn.txt`.

## Final review

Whole-branch `/code-review` (standards and spec, 2026-11-10) found no hard violation; its findings (clamp warning text, ASCII title on an empty body, migration and ascii.md wording, stale comments, five single-source helpers, an unreachable hover branch, the bench ascii guard) are fixed in c2edcf93a. SVG, ASCII, warnings, `parse()` and hovers are byte-identical over 1,169 corpus sources before and after, apart from the two intended fixes.
