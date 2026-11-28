# 05 — Current repo tooling worth keeping (ticket #2 and onward)

Repo `/Users/knsv/repos/mermaid-v13` @ `fa796a943`. Node `24.16.0` (`.node-version`); `engines.node >=22.12.0`; `packageManager: pnpm@10.30.3`.
Keep/drop judgements below are inferences unless a ticket says otherwise.

## Workspace
- `pnpm-workspace.yaml`: `minimumReleaseAge: 4320` (3 days; affects the `mermaid@12` bump job and new deps); packages `packages/*`, `packages/mermaid/src/docs`, `packages/mermaid/src/vitepress`, `tests/*`. The v13 layout needs `tools/*` added and the docs/vitepress entries dropped or kept.
- Current `packages/`: `examples, mermaid, mermaid-example-diagram, mermaid-layout-elk, mermaid-layout-tidy-tree, mermaid-local-editor, mermaid-zenuml, parser, tiny`; `tests/`: `release-verification, webpack`. None are in the v13 package list (DESIGN §2), so they are candidates for deletion in #2.
- Root `package.json` (`version 10.2.4`, private). Scripts to **rewrite**: `"prepare": "husky && pnpm build"` (runs the v12 esbuild on every install, `.esbuild/build.ts`), `"test": "pnpm lint && vitest run"`, `"lint": "eslint --quiet --stats --cache --cache-strategy content . && pnpm lint:jison && prettier --cache --check ."` (drop `lint:jison` once no `.jison` remains), `"dev": "tsx .esbuild/server.ts"`, `"e2e": "pnpm run load:env -- playwright test"`, `changeset:version`/`changeset:publish`.
- Build infra that is v12-specific: `.esbuild/` (`build.ts`, `server.ts` dev server, `jisonPlugin.ts`, `jsonSchemaPlugin.ts`, `dev-explorer/`), `.vite/` (`jisonPlugin.js`, `jsonSchemaPlugin.js`, `server.ts`), `.build/` (`common.ts`, `generateLangium.ts`, `jisonTransformer.ts`, `jsonSchema.ts`, `types.ts`). `jsonSchemaPlugin` and `.build/jsonSchema.ts` (schema YAML → defaults) are prior art for `tools/gen-config` (#7).

## Vitest
- `vitest.workspace.js`: `defineWorkspace(['./vite.config.ts', './packages/mermaid/src/docs/vite.config.ts'])`.
- Root `vite.config.ts`: plugins `jison()`, `jsonSchemaPlugin()`, `@rollup/plugin-typescript`; `test.environment: 'jsdom'`, `globals: true`, excludes `e2e/rendering/**`, `e2e/other/**`, `./tests/**`, `**/__mocks__/**`, `**/generated/`; coverage v8 (`all:false`, `coverage/vitest`); `includeSource: ['packages/*/src/**/*.{js,ts}']`; `define: { 'injected.includeLargeFeatures': 'true', 'injected.profiling': 'false', 'import.meta.vitest': 'undefined' }`.
- For v13 (#2 AC "core tests run in Node with no DOM shim"): use per-package projects with `environment: 'node'` for core/diagram-*; keep jsdom only for the `mermaid` DOM adapter tests. The `define` pattern is a template for the compile-time bench timing flag (#3, R-PERF-5). `vitest ^4.1.11`.

## ESLint (`eslint.config.js`, 280 lines, flat config, eslint ^9.26, typescript-eslint ^8.38)
- Global ignores :17-29 (`**/dist/`, `.claude/`, `**/generated/`, `packages/mermaid/src/config.type.ts`, …). `parserOptions.project` lists `./packages/*/tsconfig.json`. **`globals.browser` is enabled for all files** (:41-46), so the DOM-globals ban (#2) needs `no-restricted-globals` or `no-restricted-properties` scoped to `packages/core/**` and `packages/diagram-*/**`.
- Rules worth keeping (:61-165): `curly`, **`no-console: 'error'`** (:63), `consistent-type-imports`, `no-floating-promises`, `no-misused-promises`, `@typescript-eslint/no-restricted-imports` (:70-81, currently only `fastdom`; extend it for import boundaries), `no-unused-vars` with `^_` ignores, `consistent-type-definitions`, `ban-ts-comment` (description ≥10), `naming-convention` (PascalCase types, no `I` prefix), `@cspell/spellchecker` (:127), `no-only-tests` (:141), `lodash/import-scope` (drop: no lodash in v13).
- `compat/compat` for `packages/*/src/**` against browserslist (:166-182). Root `package.json` `browserslist`: chrome/edge ≥121, firefox ≥123, safari/ios ≥17.4, node ≥22.12.
- **`TSEnumDeclaration` ban** (:236-247) also matches `const enum`, which the reference implementation uses heavily (see 02).
- `no-console` is off for `e2e/**`, `demos/**`, `.esbuild/**` (:185-188) and some scripts (:207-215).
- There is no regex-safety lint yet. #2 needs "no nested quantifiers in regexes applied to user input". `eslint-plugin-regexp` (`regexp/no-super-linear-backtracking`) is a candidate (inference; not installed). `eslint-plugin-unicorn` is installed.

## CSpell
- `cspell.config.yaml` imports `.cspell/cspell.config.yaml`; dictionaries are `.cspell/{code-terms,contributors,libraries,mermaid-terms,misc-terms}.txt`; `ignorePaths` include `**/*.spec.{js,ts}` (checked via eslint), `e2e/platform/**`, `dist`, lockfiles. ESLint runs `@cspell/spellchecker`. `scripts/fixCSpell.ts` sorts the dictionaries. Ported the reference implementation code will need words added (e.g. `kepano`, `lnode`, `ledge`, `cnode`).

## Husky / lint-staged / prettier / changesets
- `.husky/pre-commit`: `NODE_OPTIONS="--max_old_space_size=8192" pnpm run pre-commit` → `lint-staged`.
- `.lintstagedrc.mjs`: `'!(docs/**/*)*.{ts,js,html,md,mts}'` → `eslint --cache --fix`, `prettier --write`; `.cspell/*.txt` → `tsx scripts/fixCSpell.ts`; `**/*.jison` → `pnpm -w run lint:jison` (drop it).
- `.prettierrc.json`, `.prettierignore`.
- `.changeset/config.json`: `baseBranch: "master"`, `access: public`, changelog `@changesets/changelog-github` repo `mermaid-js/mermaid`, `ignore` lists 4 v12 packages. #20 needs pre mode (`changeset pre enter alpha`), the new package names and probably `baseBranch` changed. There are 22 existing changeset files in `.changeset/`; they are v12 changes and are candidates to clear on the branch.
- CI workflows `.github/workflows/`: `test.yml` (unit: `pnpm install --frozen-lockfile`, `pnpm test:coverage`, gantt TZ run, out-of-tree TS build), `lint.yml`, `e2e.yml`, `nightly-e2e.yml`, `e2e-applitools.yml`, `release*.yml`, `build-docs.yml`, `codeql.yml`, `autofix.yml`, … Actions are pinned by SHA (pnpm/action-setup v4.1.0, setup-node v4.2.0 with `node-version-file: '.node-version'`). Use them as the template for the #2 CI skeleton.

## E2E (Playwright)
- `playwright.config.ts`: `testDir: 'e2e'`, `testMatch: '**/*.spec.{js,ts}'`; port from `resolveE2EPort()` (:6-23: `MERMAID_PORT` / CI 9000 / `MERMAID_DEV_PORT` / sha1(cwd)%100 + 9000); `webServer.command = 'pnpm dev'` (or `dev:coverage`); viewport 1440×1024; `snapshotPathTemplate: '{testDir}/__snapshots__/{testFilePath}/{arg}{ext}'`; `import 'dotenv/config'`.
- Page under test: `e2e/platform/e2e.html` loads `e2e/platform/viewer.js`, which imports `./mermaid.esm.mjs` (served by the dev server from `packages/<pkg>/dist`, `.esbuild/server.ts:566-569`, along with `e2e/platform` and `demos`). It decodes the base64 `?graph=` JSON `{code, mermaid}`, calls `mermaid.initialize(graphObj.mermaid)` and `mermaid.render(...)`, and sets `window.rendered = true` (`viewer.js:10-12`). It also registers zenuml, an external example and tidy-tree (`:1-3,90-96`). **For v13, viewer.js has to be cut down** to the v13 `mermaid` API, and the dev server replaced or adapted (inference).
- `e2e/helpers/util.ts` (322): `utf8ToB64` :34, `mermaidUrl(graphStr, options, api)` :48 (forces `handDrawnSeed:1`, architecture/cynefin seeds; `api=true` → `/xss.html?graph=`), **`imgSnapshotTest(page, testInfo, graphStr, options, api, validation)` :73** (defaults fontFamily courier, fontSize 16px), `urlSnapshotTest` :98, `renderGraph` :109, `diagramSvg` = `svg[aria-roledescription]` :121, `assertDiagramNotError` :124, `openURLAndVerifyRendering` :130 (waits for `window.rendered`, :153-165), `verifyScreenshot` :207 (tight crop of the diagram SVG), `assertNoDuplicateIds` :300, `verifyNumber` :317. Also `applitools.ts`, `argos-metadata.ts`, `coverage.ts`.
- `e2e/rendering/mmd-snapshots.spec.ts` (97) + `e2e/helpers/mmd-snapshots.ts` (147): `collectMmdFixtures(DIAGRAMS_DIR='e2e/diagrams', globs?)` :107; tier filter env `MERMAID_E2E_FIXTURE_TIER` (comma list → `*/<tier>/**/*.mmd`); `assertUniqueSnapshotNames` :129; `buildFixtureTree` :82 (nested `test.describe` per folder); fixture front matter `description`/`tags` → Playwright tags (`readFixtureMetadata` :39; its own copy of `FRONT_MATTER_RE`); `FIXED_CLOCKS` for gantt.

### E2E `.mmd` fixtures
- Total `.mmd` under `e2e/diagrams/`: **2150**. Flowchart: **400** in `e2e/diagrams/flowchart/`:
  - `pr-check/` 12, `visual-check/` 146
  - `nightly-check/` 242 = top-level 3 + `classic` 3 + `dagre` 68 + `elk-container-algorithms` 3 + `handdrawn` 50 + `icon` 10 + `redux-color-subgraphs` 16 + `shape-alias` 42 + `shape-themes` 40 + `v2` 7
  - Agentflow has its own 52 (`e2e/diagrams/agentflow`), and `e2e/diagrams/conf-and-directives/` has config/directive cases (relevant to R-COMPAT-6).
- The 158-diagram bench corpus = pr-check + nightly-check/{., classic, dagre, icon, shape-alias, v2} (145) + 13 perf (see 03).
- Perf flowcharts: `e2e/platform/dev-diagrams/performance/flowcharts/` (16 files).
- #2 deletes v12 *sources*. Whether `e2e/diagrams` stays is not stated. The conformance corpus (#4: "the e2e `.mmd` fixtures") and visual baseline (#18) both need them, so keep `e2e/diagrams/flowchart/**` and `e2e/diagrams/conf-and-directives/**` at least (inference).

## Generated-file pipeline to retire or replace
- `packages/mermaid/src/config.type.ts` ← `config.schema.yaml` via `pnpm --filter mermaid types:build-config`. CI checks it with `types:verify-config`. #7 moves the schema and replaces this with `tools/gen-config`.
