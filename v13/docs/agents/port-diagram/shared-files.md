# Adding a diagram touches only your own files

Until wave 3, every port edited the same ~60 shared files: package lists, table rows and per-type lines in shared specs. Each merge of `mermaid-v13` then conflicted with every other open port, 24 to 54 files per merge in wave 2. Now each of those entries lives in a file of the type's own, and the shared code finds it. A port **adds** files; it never edits a shared list.

## The two rules

1. **Never add a diagram to a shared list.** If a shared file seems to need your type's line, find its place in the table below. If it is not there, ask; don't add the line.
2. **Never edit or hand-merge a generated file.** Run `pnpm regen` after adding or changing any input below, and commit what it writes. On a merge conflict in a generated file, take either side (`git checkout --theirs <file>`) and run `pnpm regen`. Generated files: `pnpm-lock.yaml`, the `@mermaid-js/diagram-*` entries of every package.json, `packages/mermaid/THIRD_PARTY_NOTICES`, `v13/docs/RELEASING.md`'s package rows, `*.gen.ts`, `*/generated/*`, both editor adapters' `src/grammars.ts`, `v13/docs/{MIGRATION,config-reference,format-matrix,theme-variables}.md` and `packages/language-service/goldens/no-diagram/`.

`pnpm regen` runs, in order: `tools/workspace/sync-cli.ts` (package.json diagram dependencies, RELEASING rows, mermaid's notices), `pnpm install`, `gen:registry`, `gen:config`, `gen:theme`, `gen:grammar`, both adapters' `gen`, and the `no-diagram` completion golden. `pnpm check` fails when any of them is stale.

## Where each entry goes

| You need | Put it in | Read by |
| --- | --- | --- |
| The manifest: type, id, detectors, formats, `language`, config `section` | `packages/diagram-<type>/package.json` `mermaid` (as before) | `gen:registry`, and the package lists of `mermaid`, `language-service`, `language-server`, `conformance`, `bench` and `gen-grammar` (`pnpm regen`) |
| Config defaults for your section | `configDefaults: true` in `packages/diagram-<type>/workspace.yaml` | `gen:config` (was `SECTION_OWNERS`) |
| Grammar targets (one per `grammar/<g>.ebnf`) | `grammars:` in `workspace.yaml` (railroad: four entries) | `gen:grammar` (was `GRAMMARS`) |
| Language-bundle renderer dirs | `languageBundle: { renderer: [...] }` in `workspace.yaml` | `bench/src/language-bundle.spec.ts` (was `PACKAGES`) |
| RELEASING.md row | `release: { summary, install }` in `workspace.yaml` | `pnpm regen` |
| Ported upstream code: licence credits | `credits: { upstreams, files }` in `workspace.yaml`, plus `notices/mermaid.txt` (the section mermaid's notices carry, since its CDN build bundles you) | `check:licenses` (was `UPSTREAMS`, `REQUIRED_CREDITS`, `BUNDLED_CREDITS`); `pnpm regen` assembles `packages/mermaid/THIRD_PARTY_NOTICES` |
| Theme names built at run time; not drawn yet; core rows listed ahead; table exemptions | `theme: { dynamicReads, notDrawnYet, listedAhead, someThemes, authorOnly }` in `workspace.yaml` | theme specs (was hardcoded in `theme-used-by.spec.ts`, `theme-tables.spec.ts`) |
| Which core theme variables you read | nothing: core rows' users come from a scan of your sources | `gen:theme` (was core `vocabulary.ts` `usedBy`) |
| MIGRATION.md section(s) | `v13/docs/migration/<type>.md`, starting with `## ` | `gen:config` |
| Parity suite | `packages/conformance/src/<type>/suite.ts`, `export const parity = [...]` | `src/registry.ts` (was `PARITY_SUITES`) |
| jison / Langium lexer / v12 harvest rows | `packages/conformance/src/<type>/tables.ts`, `export const jison \| langium \| harvest = { <name>: … }` | `src/tables.ts` (was `JISON_TYPES`, `LANGIUM_LEXERS`, `HARVESTS`, and the smoke spec's list) |
| Divergences | `packages/conformance/divergences/<type>.json` | `loadDivergences(DIVERGENCES_DIR)` (was `divergences.json`) |
| Outline (hand-drawn hook) cases | `packages/conformance/src/<type>/outline.ts`, `export const outline` | outline specs |
| YAML front-matter digests | written by `CI= vitest run packages/conformance/src/yaml-tree.spec.ts` to `src/__snapshots__/yaml-tree/<folder>.txt` | yaml-tree spec |
| Hand-drawn: sketched or not | `e2e/diagrams/<folder>/hand-drawn.txt`, first line `sketched` or `unsketched` | hand-drawn and dev specs (was `TYPES`, `UNSKETCHED`, the dev adapter's list) |
| A test only your type needs in a shared spec | its own spec file, e.g. `packages/plugin-hand-drawn/src/<type>.spec.ts` | vitest |
| Editor first-paint sample, adapters-agree document | `packages/diagram-<type>/grammar/<type>.sample.mmd`, `<type>.agree.mmd`, then `vitest run packages/language-service-codemirror -u` (writes `src/__highlights__/<id>.txt`) | highlighter, adapters-agree and e2e language specs (were `DOCS` / `TYPE_DOCS`) |
| v12 spec harvest | run `pnpm --filter @mermaid-js/conformance harvest:v12 <type>`; add no script | — |
| Build config; what conformance imports from your package for tests (token names, invariants, a render harness) | `tsconfig.build.json`: a copy of `DIAGRAM_BUILD_CONFIG` (`tools/workspace/published-files.ts`); `src/testing.ts`, exported as `"./testing": { "mermaid-source": "./src/testing.ts" }` and no other condition. Import test support only from specs and `testing.ts`, never from a barrel a published entry loads | `published-files.spec.ts`: the build compiles exactly what the published entries reach, so test support is never in the tarball (#816); the release drops `./testing` from the published manifest |
| Per-type bench CLI | `packages/bench/src/cli/language-<type>.ts`, run with `pnpm --filter @mermaid-js/bench exec tsx --conditions=mermaid-source src/cli/language-<type>.ts`; add no script | — |

`workspace.yaml` is not published (it is not in the package's `files`), and an unknown key in it fails every tool that reads it (`tools/workspace/diagrams.ts`), so a typo cannot silently drop you from a table.

What still is a shared edit, by design: a change to shared code itself (a new core primitive in a T0, a new field on an oracle descriptor, a core theme row that moves from a package to core, the hand-written top of MIGRATION.md). Those are features, not list rows; they conflict rarely and are merged as code.

## Before T5: a package with no manifest yet

Until T5 adds the `mermaid` manifest, your `packages/diagram-<type>` is a **pre-manifest** package. Give it a `workspace.yaml` from T1 on (an empty one, a comment only, is enough), and the workspace tools count it (`workspaceDiagrams()` in `tools/workspace/diagrams.ts`):

- `pnpm regen` adds it to `packages/conformance`'s devDependencies (and to `tools/gen-grammar`'s once a spec there imports it), and, once its package.json exports `./language` (T6 before T5), to `packages/language-service`'s devDependencies, so a test-only `UNLISTED_FACETS` row can import its facet;
- `gen:grammar` reads its `grammars:`;
- the theme scan reads its sources (set `theme: { notDrawnYet: true }` until it draws), and the licence check its `credits:`.

It stays out of everything that registers or publishes a diagram until the manifest lands: the generated registry, detectors and facets (so the type is still `UNSUPPORTED_DIAGRAM`), gen-config's sections (`configDefaults` waits for T5), the `mermaid` and `bench` dependencies, the language service's peers and the language server's dependencies, the RELEASING rows and mermaid's notices. Do not add the manifest early to get any of this: it gives the type a registry loader before it has a plugin. A `diagram-*` folder with neither a manifest nor a `workspace.yaml` is not counted at all (`tools/workspace/pre-manifest.spec.ts`).

## Moving an in-flight port (do this on your next merge of `mermaid-v13`)

1. Merge `mermaid-v13`. For every conflicted file in the table above, and every generated file, take theirs (`git checkout --theirs <file>`).
2. Move what you had added in those files to your own files, per the table:
   - package.json diagram dependencies, RELEASING row, knip and eslint list entries: **delete**; `pnpm regen` adds the dependencies and the row from `release:` in your `workspace.yaml`; knip and eslint use globs now.
   - `SECTION_OWNERS` row → `configDefaults: true`; `GRAMMARS` entry → `grammars:`; bench `PACKAGES` row → `languageBundle:`; licence rows → `credits:` and `notices/mermaid.txt`. All in your `workspace.yaml`; create it from a neighbour's.
   - `PARITY_SUITES` entry → `src/<type>/suite.ts`; `JISON_TYPES` / `LANGIUM_LEXERS` / `HARVESTS` rows → `src/<type>/tables.ts` (a jison type's smoke-list line goes; requirement's `NOT_LEXED` becomes `notLexed: [...]` on its row); `divergences.json` entries → `divergences/<type>.json`; `DIVERGENCES_FILE` → `DIVERGENCES_DIR` in your own specs.
   - `NOT_DRAWN_YET` / `LISTED_AHEAD` / `DYNAMIC_READS` entries → `theme:` keys in your `workspace.yaml` (`dynamicReads`, `notDrawnYet: true`, `listedAhead`). Do not list your type on any core `usedBy`; keep only a real move of a row into core.
   - MIGRATION.md sections → `v13/docs/migration/<type>.md`.
   - Lines in shared specs (type lists, `TYPE_DOCS`, per-type `it`s): drop the list lines; samples → `grammar/<type>.sample.mmd` / `.agree.mmd`; a type-only `it` → your own spec file; your `goldens/<id>/completions/empty.*` → delete.
   - Hand-drawn: add `e2e/diagrams/<folder>/hand-drawn.txt`.
3. Not at T5 yet? Make sure your package has a `workspace.yaml` (see above), or `pnpm regen` drops your conformance dependency.
4. Run `pnpm regen`, then `CI= vitest run packages/conformance/src/yaml-tree.spec.ts` and `vitest run packages/language-service-codemirror -u`, and review what they wrote.
5. Run your scoped checks, then `pnpm check`.

Per in-flight port:

| Port | Moves on its next merge |
| --- | --- |
| usecase (#624) | parity suite and harvest row → `conformance/src/usecase/`; `NOT_DRAWN_YET` and `LISTED_AHEAD` (`actorBkg`, `actorBorder`) → `theme:` in `diagram-usecase/workspace.yaml` (core keeps `usedBy: ['usecase']` on those two rows); config/grammar/release keys → `workspace.yaml`; MIGRATION section → `migration/usecase.md`. Its `harvest-v12.ts` file-name change is shared code: merge it as code. |
| treeView (#627) | parity suite and Langium row → `conformance/src/treeView/`; its new `capture: 'langium'` descriptor field is shared code; grammar/config/release → `workspace.yaml`. |
| ishikawa (#626) | parity suite and jison row → `conformance/src/ishikawa/`; `GRAMMARS` → `grammars:`; config/release → `workspace.yaml`; theme-used-by list line → drop. |
| requirement (#629) | parity suite and jison row (with `notLexed`) → `conformance/src/requirement/`; `GRAMMARS` → `grammars:`; release/config → `workspace.yaml`. |
| block (#623) | parity suite and jison row → `conformance/src/block/`; release/config → `workspace.yaml`. |
| c4 (#622) | parity suite and jison row → `conformance/src/c4/`; release/config → `workspace.yaml`. |
| agentflow (#632) | parity suite and jison row → `conformance/src/agentflow/`; `NOT_DRAWN_YET` → `theme.notDrawnYet: true` in its `workspace.yaml`; `GRAMMARS` → `grammars:`; release/config → `workspace.yaml`. |
| architecture (#631, wave 4) | parity suite and Langium row → `conformance/src/architecture/`; divergences → `divergences/architecture.json`; release/config → `workspace.yaml`. |
| railroad (#633, wave 4) | four Langium rows and the harvest row → `conformance/src/railroad/tables.ts`; four `grammars:` entries (`railroad`, `railroadEbnf`, `railroadAbnf`, `railroadPeg`); release/config → `workspace.yaml`. |
| eventmodeling (#625, wave 4) | parity suite and jison row → `conformance/src/eventmodeling/`; `NOT_DRAWN_YET` → `theme.notDrawnYet: true` in its `workspace.yaml`; `GRAMMARS` → `grammars:`; release/config → `workspace.yaml`. |
| swimlane (`feature/528_swimlane`, wave 4) | a layout engine plus flowchart's `swimlane-beta` registration: no diagram package of its own, so nothing moves except any MIGRATION section (→ `migration/flowchart-swimlane.md`). Its `LAZY_LAYOUTS` row and flowchart registration are shared code: merge them as code. |
