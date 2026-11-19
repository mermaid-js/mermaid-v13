# Agent guide: Mermaid v13

Read this before your first edit. It holds the rules that are easy to break without knowing them, and links to the rest.

## What this branch is

Mermaid v13 is a rewrite of Mermaid, developed on the branch `mermaid-v13` of `mermaid-js/mermaid-v13`. The v12 code is not in the tree: v12 is a test oracle, installed from npm in `packages/conformance` (R-ARCH-9). To read v12 source, use `git show fa796a943:packages/mermaid/src/diagrams/<type>/…`.

The pipeline is `text → preprocess → detect → parse → layout → render → SVG string`. Every stage is a pure function of its inputs, and the resolved config is passed into each stage (DESIGN §1).

## Read first

| Need | Where |
| --- | --- |
| Requirements, by R-id | [v13/docs/REQUIREMENTS.md](v13/docs/REQUIREMENTS.md). The glossary is in §3. |
| How v13 is built | [v13/docs/DESIGN.md](v13/docs/DESIGN.md). Packages are in §2, the plugin contract in §12, testing in §13. |
| Decisions, by D-id | D1 to D632 are rows in [v13/docs/DECISIONS.md](v13/docs/DECISIONS.md), which is closed. Later ones are one file each in [v13/docs/decisions/](v13/docs/decisions/README.md). A later decision replaces an earlier one. |
| ADRs | [v13/docs/adr/](v13/docs/adr/) |
| Changesets and releases | [v13/docs/RELEASING.md](v13/docs/RELEASING.md) |
| Porting a diagram type | [v13/docs/agents/port-diagram/](v13/docs/agents/port-diagram/README.md), also as the `port-diagram-v13` skill |
| Issue tracker and labels | [docs/agents/issue-tracker.md](docs/agents/issue-tracker.md), [docs/agents/triage-labels.md](docs/agents/triage-labels.md) |
| How to use the domain docs | [docs/agents/domain.md](docs/agents/domain.md) |

Use the names these documents use (parser kit, `SvgWriter`, `LayoutModel`, extension plugin). Cite R-ids, D-ids and ADR numbers in issues, commits and PRs.

## Layout of the repository

```
packages/core              @mermaid-js/core: pipeline, parser kit, measurer, layout, SvgWriter, theme, config
packages/diagram-<type>    one package per diagram type: parser, model, layout, renderer, ./language facet
packages/shared            @mermaid-js/shared: code that several diagram types use and core does not need
packages/mermaid           the public API, the Registry, the DOM adapter, plugin discovery, bundles
packages/conformance       (private) parity against v12, corpus runners, per-type suites in src/<type>/
packages/bench             (private) size and speed gates
packages/plugin-*, layout-elk, language-*, bundler-plugin   optional plugins and editor tooling
tools/                     generators (gen-config, gen-grammar, gen-metrics), check-deps, release, eslint rules
e2e/                       Playwright specs; e2e/diagrams/<type>/**/*.mmd is the corpus
v13/docs/                  requirements, design, decisions, migration notes, references
```

## Rules that eslint and the checks enforce

- **Dependency directions** (DESIGN §2, rule `mermaid/import-boundaries`): `core` imports nothing outside itself. `shared` imports only `core`. A `diagram-*` package imports only `@mermaid-js/core` and `@mermaid-js/shared` subpaths and never another `diagram-*` package. `mermaid` imports only `core` and `diagram-*`, never `shared`. Relative imports stay inside their package.
- **No DOM** (R-ARCH-1): `core`, `shared` and `diagram-*` use no browser global and no `node:` module. Take what you need as a parameter. Tests run in plain Node with no DOM shim.
- **No clock** (D270): `core`, `shared` and `diagram-*` never call `Date.now()` or `new Date()` without arguments. Use `ctx.now`.
- **No global config, no `console`** (R-ARCH-5, R-ERR-4): the config arrives as an argument. Problems are reported as diagnostics.
- **No enums.** Use a union type. Type imports use `import type`.
- **Code in the `./language` facet** of a diagram package never imports rendering code (R-LANG-8).
- **Dependencies:** `pnpm check:deps` and `pnpm check:licenses` gate what a published package may depend on. Ask before adding a runtime dependency.
- **Readability limits** (complexity, function and file length, nesting): old violations are listed in `eslint-suppressions.json`. New ones fail. Do not add entries to that file.

## Rules the tools cannot check

- **SVG goes through `SvgWriter`** (DESIGN §7). A renderer never builds markup from strings.
- **A diagram package never checks a theme name or `look`.** Every difference between themes is a theme variable (D152).
- **v12 decides syntax.** What v12 accepts, v13 accepts, with the same meaning. When a v12 spec and the v12 runtime disagree, the runtime wins.
- **Generated files are never edited by hand.** They live in `generated/` folders and in generated documents such as `v13/docs/config-reference.md`. Change the source, then run `pnpm regen`. On a merge conflict in a generated file, take either side and run `pnpm regen`.
- **Do not copy code between diagram packages.** A helper that a second diagram type needs moves to `packages/shared` (or to `core` when every type needs it), and both import it. Where the copies would differ, the difference is a parameter. A shared subpath is one file, or one family of files that always load together: the CDN build splits by file, so a barrel makes every importer load everything behind it. See [packages/shared/README.md](packages/shared/README.md).
- **Add files instead of editing shared lists.** A diagram type is found from its own files; see [shared-files.md](v13/docs/agents/port-diagram/shared-files.md).
- **Timing tests assert ratios**, never absolute times.
- **Escalate decisions.** If your change contradicts DESIGN, REQUIREMENTS or a D-id, or changes a v12 default or v12 semantics, stop and ask the maintainer. An answer becomes a new decision file, `v13/docs/decisions/D<n>.md` (D636). Never add a row to DECISIONS.md.
- **Never loosen a gate** (a size or speed limit, a lint rule, a test bar, a workflow) to make a change pass. Report the failure instead.

## Commands

Use pnpm. Node 22.12 or newer; `.node-version` names the version CI uses.

```bash
pnpm install          # once per checkout or worktree
pnpm dev              # dev server with the diagram explorer
pnpm test             # every unit test (vitest, no build needed)
pnpm check:static     # eslint (sharded), prettier, cspell, knip, tsc, dependency, licence, config and grammar checks, side by side
pnpm check            # check:static, then test: the full gate. Most of its time is the unit suite
pnpm e2e              # Playwright: visual baseline, browser and dev explorer specs
pnpm regen            # run every generator
```

### The per-package check

While you work on one diagram package, run this instead of `pnpm check`. It takes well under a minute. Replace `pie` with your type:

```bash
pnpm vitest run packages/diagram-pie            # the package's tests
pnpm vitest run packages/conformance/src/pie    # conformance for that type
pnpm --filter @mermaid-js/diagram-pie typecheck
pnpm --filter @mermaid-js/conformance typecheck
pnpm eslint --quiet packages/diagram-pie packages/conformance/src/pie
```

- The vitest argument is a path filter, so `packages/conformance/src/pie` also runs the type's top-level specs such as `pie-layout-literals.spec.ts`. The conformance folder uses the type's id, which is not always lower case (`treeView`).
- For another package, use its folder and its name: `pnpm vitest run packages/core`, `pnpm --filter @mermaid-js/core typecheck`, `pnpm eslint --quiet packages/core`.
- Run `pnpm prettier --check <files>` on files that eslint does not cover, such as Markdown.
- If you changed a schema, a grammar file, a manifest or a `workspace.yaml`, run `pnpm regen` and commit what it writes.

The per-package check does not replace the full gate. Specs that cover every type at once (parity, corpus, manifests, registry), knip and the dependency checks only run in `pnpm check`. CI runs it on every PR.

### The pre-push hook

`git push` runs `tools/pre-push/cli.ts`, which checks what the push changes since it left `mermaid-v13`. It does not run the unit suite or the build: CI does.

- A push that changes only documentation (`*.md`, `docs/`, `v13/docs/`) runs Prettier on those files. Markdown that code reads (snapshots, fixtures, a docs file that source code names) does not count as documentation.
- Any other push runs these at the same time and reports every failure: ESLint and Prettier on the changed files; cspell, knip and the typecheck over everything; `check:deps`, `check:licenses` and the generated-file check; and CI's structural audit, which is `fallow audit` without coverage and runs no tests. CRAP findings are warnings there and do not fail the push; the nightly fallow run gates on them (D640).
- Each check's log is in `node_modules/.cache/pre-push/`. To run some checks again: `pnpm exec tsx tools/pre-push/cli.ts typecheck knip`.
- `PRE_PUSH_FULL=1 git push` runs the full `pnpm check` instead. Run it, or `pnpm test`, before a push that changes shared code if you do not want to wait for CI to find a failing test.

## Tests

- Test through the public seam, `createMermaid().render()` or `renderSync()`, unless the area has its own seam (lexer parity, layout invariants).
- Specs are `*.spec.ts` files beside the source. Do not commit `.only`.
- A change to rendered output needs a `.mmd` fixture under `e2e/diagrams/<type>/` that shows it. That can be a fixture that already exists. Before you add one, read [Visual tests](#visual-tests). The corpus and the visual baseline find fixtures there. Put test sources in fixtures, not in string lists inside a spec.
- `packages/conformance/src/yaml-tree.spec.ts` pins the YAML read of each fixture with front matter or shape data, one `<id> <count> <hash16>` line per fixture in `src/__snapshots__/yaml-tree/<folder>.txt`. A new fixture passes unpinned and is listed in the output. It fails when a pinned fixture's read changes or a pinned fixture is gone. Regenerate with `pnpm vitest run packages/conformance/src/yaml-tree.spec.ts -u`; no other run writes the files.
- A change that differs from v12 on purpose is listed, with its reason, in the type's divergences (`packages/conformance/divergences/`) and in the type's fragment under `v13/docs/migration/`.

## Visual tests

### How they work

- **Every fixture is a screenshot.** `e2e/rendering/mmd-snapshots.spec.ts` photographs each `.mmd` file under `e2e/diagrams/<type>/<tier>/`. Nothing lists them. Screenshots are taken in Chromium only and compared by Argos (project `mermaid/mermaid-v13`, D631). The dev explorer (`pnpm dev`) shows the same fixtures that CI photographs.
- **Tiers.** `pr-check` and `baseline` (about 1,300 fixtures) are photographed on PRs and on every push to `mermaid-v13`. That push build is the baseline that PRs are compared with. `nightly-check` and `visual-check` (about 2,200 more) are photographed only by the nightly build, `nightly` (`visual-nightly.yml`).
- **A PR photographs only what it changes** (D632). The `visual` job renders all fixtures to SVG in Node twice, once on the PR and once on its base. It photographs only the fixtures whose SVG differs and uploads them as an Argos subset build. If nothing differs, Argos is told to skip and the status is still green. Changed fixtures in the nightly tiers are listed in the job summary and photographed that night.
- **Full runs.** Every fixture in the PR tiers is photographed when the PR changes the page, the snapshot harness, the Playwright config, the DOM adapter, `package.json` or the job itself. The same happens when the comparison fails, and on a PR with the label `visual: full`. A PR that changes only docs, tests or tools photographs nothing.
- **Report only.** The job and the Argos status are not required checks. A maintainer approves the differences in Argos. Before you mark a PR ready, open its Argos build and check that your change explains every changed or added image. Give the count in the PR body ("4 added, 0 changed"). A difference you cannot explain is a bug to fix, not one to approve.
- **Behaviour specs take no screenshots.** The browser, dev explorer and platform specs run in the `e2e` jobs. A spec that asserts behaviour does not also take a screenshot.

### Before you add a visual test

Every fixture costs time on every later run. Each push to `mermaid-v13` photographs the PR tiers again, the nightly photographs everything, and the unit corpus and render-property tests read every `.mmd` file. There are about 3,500 fixtures. Most changes are already shown by one of them, so add a fixture only for something no existing image shows.

1. **See which fixtures your change already affects.** Hash the fixtures before your change and after it, then compare. A run takes about 10 seconds. The command runs in `packages/dev`, so give it absolute paths outside the checkout:

   ```bash
   h=/tmp/visual-hashes && mkdir -p "$h"
   pnpm --silent --filter @mermaid-js/dev visual:hashes "$h/before.json"   # before the change, or with it reverted
   pnpm --silent --filter @mermaid-js/dev visual:hashes "$h/after.json"    # with the change
   jq -rs '.[0] as $a | .[1] | to_entries[] | select($a[.key] != .value) | .key' "$h/before.json" "$h/after.json"
   ```

   If that lists fixtures that show what you changed, the change is already covered. Do not add one. The `pr-check` and `baseline` entries in the list are what the PR's Argos build will show. A change in shared code can reach several types. A one-pixel change to the pie legend spacing changed 53 fixtures, two of them flowcharts that embed a pie.
2. **If nothing changes, extend before you add.** Search the type's folders (`rg -l '<keyword>' e2e/diagrams/<type>`) for a fixture on the same subject. If the new case fits there and the image stays readable, add it to that fixture.
3. **Only then add a file.** Put it next to the fixtures on the same subject. `pr-check` and `baseline` are photographed on every push, so do not put a fixture there only to get it photographed on your PR. A regression case belongs in `nightly-check`. Two paths that flatten to the same snapshot name (`a/b-c.mmd` and `a/b/c.mmd`) fail at registration.
4. **Do not use a picture to test a number.** A position, an attribute, a class or a warning is asserted in the package's specs, not in a screenshot.
5. **Say what covers it.** The PR body names the fixtures that show the change, or says why none of them could.

## Issues, branches and pull requests

- Issues are in `mermaid-js/mermaid-v13`. Pass `-R mermaid-js/mermaid-v13` to every `gh` call, because a checkout can have several GitHub remotes.
- Claim a ticket by assigning it to yourself before any other write.
- Base your branch on `mermaid-v13`. A PR targets `mermaid-v13` and its body says `Resolves #<issue>`.
- Open the PR as a draft while the work is in progress. Mark it ready when it is finished and CI is green. Do not merge it; the maintainer merges.
- A PR that changes a published package adds a changeset: `pnpm changeset`, bump type `patch`, a one-line summary written for users (RELEASING §3). Never edit a `version` field or a CHANGELOG by hand.
- Do not edit `.github/workflows` unless the ticket is about them.

## Skills

Shared skills are committed under `.claude/skills/`:

- `port-diagram-v13`: points at the port recipe in `v13/docs/agents/port-diagram/`.
- `release-alpha`: the manual alpha release, as described in RELEASING.md.

The rest of `.claude/` is local and ignored by git.
