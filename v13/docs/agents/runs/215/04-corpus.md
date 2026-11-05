# 04 — ELK corpus (`e2e/diagrams/**`)

Selector grep: `grep -rlE "layout:\s*['\"]?elk|^\s*elk:|elk\.|flowchart-elk|defaultRenderer:\s*['\"]?elk" e2e/diagrams --include=*.mmd` → **79 files** (matches the spec).

## Counts per type

| Type (folder → v13 type) | Files | Where | Selector |
| --- | --- | --- | --- |
| ER (`er-diagram` → `er`) | 43 | all `er-diagram/visual-check/` (`*-elk-layout.mmd` and others) | `layout: elk` |
| Requirement (`requirement`) | 24 | all `requirement/nightly-check/*-elk-layout.mmd` | `layout: elk` — **no v13 package yet**, skipped by discovery until it lands |
| Flowchart (`flowchart` → `flowchart-v2`) | 6 | see below | `layout: elk` ×4, `elk.box` ×1, `elk.rectpacking` ×1 |
| State (`state-diagram-v2` → `stateDiagram`) | 4 | `nightly-check/elk/` ×3, `pr-check/` ×1 | `layout: elk` |
| Class (`class-diagram` → `classDiagram`) | 2 | `nightly-check/` ×1, `nightly-check/handdrawn/` ×1 | `layout: elk` |

Runnable with today's packages: 55 (ER 43, flowchart 6, state 4, class 2).

## Files outside ER/requirement

- `flowchart/pr-check/3-layout-elk-subgraphs.mmd`
- `flowchart/visual-check/subgraph-titles-wider-than-children.mmd`
- `flowchart/visual-check/should-keep-the-true-entry-on-top-when-a-back-edge-feeds-it-79.mmd` — the **only** corpus file setting an `elk.*` key (`elk: keepEntryNodeOnTop: true`).
- `flowchart/nightly-check/elk-container-algorithms/elk-subgraph-with-box-algorithm.mmd` — the **only** per-container `grp@{ algorithm: elk.box }` (`:18`) → `ELK_ALGORITHM_IGNORED` fixture.
- `flowchart/nightly-check/elk-container-algorithms/elk-box-layout-with-edges.mmd` — `layout: elk.box` (no edge routing).
- `flowchart/nightly-check/elk-container-algorithms/elk-rectpacking-layout-with-edges.mmd` — `layout: elk.rectpacking`.
- `state-diagram-v2/nightly-check/elk/elk-composite-entry-default-centering.mmd`, `elk-start-end-edge-centering.mmd`, `elk-notes-keep-their-layout.mmd`
- `state-diagram-v2/pr-check/composite-with-a-loop-starts-on-its-start-state.mmd`
- `class-diagram/nightly-check/should-render-a-full-class-diagram-using-elk.mmd`, `class-diagram/nightly-check/handdrawn/hd-should-render-a-full-class-diagram-using-elk.mmd`

## What the corpus does not cover

- No `flowchart-elk` header, no `defaultRenderer: elk`, no per-type `flowchart.layout`/`class.layout` key: stories 2 and 3 need new fixtures.
- 12 of the 13 `elk.*` keys appear nowhere (only `keepEntryNodeOnTop`). Names `elk.stress`, `elk.force`, `elk.mrtree`, `elk.sporeOverlap`, `elk.radial`, `elk.layered` appear in no fixture. E4's per-key specs carry that coverage, ported from `develop:…/elk/__tests__`.
- No math in any ELK fixture.

## How the mmd-snapshot spec picks up baselines

- Runner `e2e/rendering/mmd-snapshots.spec.ts`: `discoverMmdFixtures({ tiers: MERMAID_E2E_FIXTURE_TIER })` `:18`, unique-name check `:20`, one `test()` per fixture in a folder tree `:39-86`, `imgSnapshotTest(page, testInfo, asHostText(source), { screenshotPath: 'diagrams/<rel path>' })` `:81-83`.
- Which fixtures run: `e2e/helpers/mmd-snapshots.ts:44-46` `SUPPORTED_TYPES` = registry rows with a `load` (`packages/mermaid/src/generated/registry.gen.ts` `FIRST_PARTY`); folder → type map `packages/dev/src/fixture-discovery.ts:25-65` (`katex` → `flowchart-v2` `:42`, `requirement` `:49`); per-file exceptions `:71`; `discoverMmdFixtures :115`. All tiers (`pr-check`, `nightly-check`, `visual-check`) run unless narrowed.
- Baselines: `e2e/helpers/util.ts:204-268` `verifyScreenshot` — crops to the diagram SVG; with `RUN_VISUAL_TEST=true` writes PNGs for Argos to `SCREENSHOT_DIR ?? e2e/screenshots` (`:222-252`); otherwise Playwright `toHaveScreenshot`, **writing the baseline on first run if missing** (`:254-261`). Path template `playwright.config.ts:97` `{testDir}/__snapshots__/{testFilePath}/{arg}{ext}`; `e2e/__snapshots__/` and `e2e/screenshots/` are gitignored (`.gitignore:33-35`). So "baselines from the ELK corpus" (E5) = local first-run PNGs / Argos, nothing committed.
- Consequence: with ELK not installed the 55 runnable ELK fixtures already snapshot today as `layered` (no warning, `builtIn()` in `packages/mermaid/src/registry.ts:93-94`). Installing the plugin changes those images → E5 must regenerate them.
- Unit-level corpus readers use the same folders: `packages/conformance/src/corpus.ts:19` `corpusFromDir`, e.g. `flowchart-layout.spec.ts:29-32`.
