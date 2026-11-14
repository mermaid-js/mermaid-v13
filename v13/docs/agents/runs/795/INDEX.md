# Run notes, spec #795 (classic-theme parity under `themeVariables` overrides)

Integration branch `feature/795_classic-theme-parity` (from `mermaid-v13` at 10fc67ba3). Draft PR: #826.

Covers #761, #758, #771, #772, #773, #407, #434. The five maintainer decisions are settled on the recommended option (comment on #795, 2026-11-14): pin v12's literals; gantt option (a); restore ER's `tertiaryColor` label fill; regenerate the `base` baselines; D-ids from the next free block after D567. T7 records them.

| Ticket | Issue | Branch | Blocked by | State |
| --- | --- | --- | --- | --- |
| T0 override oracle | #796 | `feature/796_theme-override-oracle` | — | merged (ff 5b00902b2); 723 listed differences; core 98,706 B gz, untouched |
| T1 `base` derives by rule | #797 | `feature/797_base-derived-rules` | #796 | merged (ff 3e84d8ae7); core 98,706 → 98,739 B gz |
| T2 named themes pin `mainBkg` | #798 | `feature/798_classic-pin-mainbkg` | #796, #797 | merged (ff 519aaf0be); core 98,739 → 98,740 B gz |
| T3 ER row ink, label fill | #799 | `feature/799_er-row-ink` | #797 | merged (ff 2e9f4349b); core untouched; follow-up: fallow complexity in `drawRows` |
| T4 block composite colours | #800 | `feature/800_block-composite` | #797 | merged (ff); `blockCompositeClusterPaint` flag, classic only; redux/neo byte-identical |
| T5 gantt contrast | #801 | `feature/801_gantt-contrast` | #797 | merged (ff b9bb3aea7); core untouched; ER contrast rows folded into `theme-contrast.spec.ts` |
| T6 reproduce #407, #434 | #802 | `feature/802_theme-qa-repro` | #797, #798 | merged (ff 7ba9d4371); #407 fixed by T1; #434 split (#391, by-design, #827); comments posted |
| T8 `base` error and note colours | #825 | `feature/825_base-error-note` | #797, #798 | merged (ff); core 98,740 → 98,731 B gz |
| T7 decisions, MIGRATION, docs | #803 | `feature/803_theme-parity-records` | all | in progress |

T1, T2 and T8 (filed from T0's list) are the core tickets; they merge one at a time. T3, T4, T5 run in parallel after T1. T3 and T5 both extend the R-THEME-9 contrast spec: additive rows only; the second to merge takes the first's.

## Pointers

- Theme engine: `packages/core/src/theme/spec.ts` (`ThemeSpec`), `theme.ts` (`createTheme`, `source()` treats `spec.base` as literals), `dsl.ts` (rule DSL), `vocabulary.ts` (shared rules, `mainBkg: primaryColor`), `specs/*.ts` (one per theme; `specs/palettes.ts` holds `BASE_SECONDARY`).
- v12 oracle: `packages/conformance/src/oracle.ts` (`loadOracle()`), the model spec `packages/conformance/src/theme-palettes.spec.ts`. v12 source: `git show fa796a943:packages/mermaid/src/themes/theme-{base,default,dark,forest,neutral}.js`.
- Diagram tables: `packages/diagram-{er,block,gantt}/src/theme/table.ts`; `packages/conformance/src/diagram-themes.ts` (`DIAGRAM_TABLES`); gantt's v12 comparison `packages/conformance/src/gantt/theme.spec.ts`.
- Contrast check (R-THEME-9): `grep -rln "R-THEME-9" packages/*/src`.
- Recipe: `v13/docs/agents/port-diagram/theming.md`, `shared-files.md` (generated files: run `pnpm regen`, never hand-edit `theme-variables.md`, `MIGRATION.md`).
- Core size: `packages/bench/src/core-size.spec.ts`, limit in `packages/mermaid/size-budget.json` (99,328 B gz). Plan B: a core ticket may raise it up to 102,400 B rather than block, and must flag it.
