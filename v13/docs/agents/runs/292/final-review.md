# #292 gitGraph: final whole-branch review

Worktree `.claude/worktrees/292-gitgraph-edef1a`, branch `feature/292_gitgraph`, head `72ceaf354`. Scope: `git diff 570624bd0 72ceaf354`, gantt's own code left out. Read only. I wrote scratch probes in the session scratchpad only, nothing in the repo.

## Verdict

The six tickets fit together. The model, layout and renderer contracts agree: lane index, slot and `laneOf` are used the same way end to end. Parent cycles (D264) terminate in LR, TB and BT, with `parallelCommits` on and off. The BT-parallel port matches v12's `setParallelBTPos` for acyclic graphs. A self-parent gets no arrow. Derived ids (D260) are deterministic, and the hash matches Pele's `nextId`. There is one `data-ast` per drawing statement, and the implicit main branch carries `data-id` only. The title (D265) works in all three directions. `useMaxWidth`, `diagramPadding` (with `GIT_CONFIG_IGNORED`), `look` (with `LOOK_REMOVED`), `format: 'ascii'` (throws `UnsupportedFormatError`) and the detector order (timeline → gitGraph → stateDiagram) all behave as specified. The per-family paints match v12's `styles.js` for classic, neo, redux and redux-color. Under `theme: 'auto'` the cherry ink and the branch line colour switch.

I found no blocking correctness bug. The findings below are about claims that do not match the tree, stale or duplicated data, two small output and editor bugs, and documentation.

Checks run here: `npx vitest run packages/diagram-gitgraph packages/mermaid/src/gitgraph.spec.ts packages/conformance/src/gitgraph/render-behaviour.spec.ts packages/conformance/src/git-palettes.spec.ts packages/conformance/src/gitgraph/theme-names.spec.ts` gave 13 files, 444 passed and 12 skipped. `packages/bench/src/core-size.spec.ts` gave 5/5 on the combined tree. The heavy corpus sweeps and `cdn-build.spec.ts` were not run.

## Findings, most severe first

### 1. D331 is not met as claimed: shared `LIGHT_RULES` still define gitGraph-only variables, and one reads `tagBorder` (medium)

- **Where:** `packages/core/src/theme/spec.ts:130-137`:

  ```ts
  commitLabelColor: `ifSet(secondaryTextColor, invert(${BASE_SECONDARY}))`,
  commitLabelBackground: BASE_SECONDARY,
  tagLabelColor: 'primaryTextColor',
  tagLabelBackground: 'primaryColor',
  tagLabelBorder: 'ifSet(tagBorder, primaryBorderColor)',
  ```

- **What is wrong:** all five are `usedBy: ['gitgraph']` only (`vocabulary.ts:400-407`). `tagBorder` is a git-only alias. Commit 1a56cd440 is titled "no shared theme rule names a git variable (D331)", and `tickets/374.md:8` says "No shared rule names a git variable (D331)". Both claims are false.
- **Why it matters:** D331 as gantt recorded it (`runs/293/GAPS.md`) is "no shared rule or palette reads a [diagram-only] variable". `tagLabelBorder: ifSet(tagBorder, …)` breaks even that weaker reading. The rules are also load-bearing: `base` has no rules of its own (R-THEME-5), and `redux`, `redux-color` and `neo` take `tagLabelColor` and `tagLabelBackground` from them. So this is not dead text.
- **Recorded?** `GAPS.md:80` ends with "#369's label rules in `LIGHT_RULES` are left for the maintainer". That makes it a recorded gap, but the ticket handoff and the commit message contradict it.
- **Fix:**
  - Correct `tickets/374.md` and the GAPS line.
  - In the PR body's "For the maintainer", list the five rules and the `tagBorder` read explicitly.
  - Alternatively, move them into the per-theme `gitLabelRules`. That needs a decision on R-THEME-5 for `base`.

### 2. The exported `GIT_PAINT` and `GIT_GEOMETRY` carry per-family values that nothing reads, already out of date with core, keyed by `neo` and `redux` (low-medium)

- **Where:** `packages/diagram-gitgraph/src/render/variables.ts:84-123` and `layout/metrics.ts:245-254`. Both are exported from the package root (`src/index.ts:19,29`).
- **What is wrong:**
  - At runtime only `.name` is read (`paint.ts`, `env.ts:50-61`). The `classic`, `neo`, `redux`, `light` and `dark` values are read only by `layout/fixtures.ts:228`, the `REDUX_GEOMETRY` the layout spec uses.
  - Nothing ties these values to core's `CLASSIC_GITGRAPH`, `NEO_GITGRAPH` and `REDUX_GITGRAPH`, and they have already drifted. `GIT_PAINT.commitLineColor` says classic and neo `'lineColor'`, but since D331 core sets nothing there (`neo-theme.spec.ts` now asserts `currentColor`). `cherryPickInk` says `light: '#ffffff'`, but `default` and the other light classic themes set nothing.
- **Why it matters:**
  - A public, documented table of theme-family values keyed `neo` and `redux` inside the diagram package goes against D331's "the package names no theme" and D152's "the theme carries the values".
  - The layout spec's "redux" is the package's copy, not the `redux` theme. `layout-corpus.spec.ts` does it right with `loadTheme('redux')`.
- **Fix:**
  - Reduce both tables to names (and kinds).
  - In `layout.spec.ts`, take redux geometry from `loadTheme('redux')`.
  - Stop exporting the tables from `index.ts`, or export the names only.

- **Fixed in e7631d094:** `GIT_PAINT` and `GIT_GEOMETRY` are name tables only (`as const`, no per-family values; the `Git*Variable` and `GeometryVariable` types are gone). `layout.spec.ts` lays redux geometry read from `loadTheme('redux')` over `default`.

### 3. Theme docs still say the `dark` and `neutral` git palettes follow the pie colours, which has been wrong since D334 (low-medium, author-facing)

- **Where:**
  - `packages/core/schema/config.schema.yaml:250-251`, generated into `v13/docs/config-reference.md:26`: "`pie2`–`pie8` lightened in `dark` and as given in `neutral`".
  - `v13/docs/MIGRATION.md:473`: "the pie colours in `dark` and `neutral`".
- **What is wrong:** since D334, `dark.ts` and `neutral.ts` derive `git` from `cScale<n>`.
- **Verified:** in `dark`, `themeVariables: { pie3: '#ff0000' }` leaves `git[2]` at `#6a8993`, while `cScale3: '#ff0000'` turns it into `#ff6666`. `neutral` behaves the same way (`#bbbbbb` and `#ff0000`). An author who follows the docs and sets `pie<n>` sees no change.
- **Fix:** say `cScale2`–`cScale8` (v12's `pie<n>`) in the schema reason and MIGRATION.md, then run `gen:config`.

- **Fixed in e7631d094:** the schema reason (`config-reference.md`) and MIGRATION.md say `cScale2`–`cScale8` (v12's `pie2`–`pie8`, D334).

### 4. Hover tells the wrong story for a rejected merge `id:` (low)

- **Where:** `packages/diagram-gitgraph/src/facet/hover.ts:79-80`.
- **Scenario (verified through the service):**

  ```
  commit id:"A"
  branch dev
  commit id:"B"
  checkout main
  merge dev id:"A"
  ```

  Hovering the merge's `"A"` says "A later commit takes this id, so this one is not drawn." In fact the merge is rejected with `GIT_MERGE_DUPLICATE_ID`, and the earlier commit `A` is the one that is drawn. The check `defines && commit.astId !== node.id` treats every non-owning definition as a D264 replacement.
- **Fix:** say "later" only when the owning statement comes after this node. For a `Merge` node whose id belongs to an earlier statement, say that the id is already used and this merge is rejected, or show no commit facts.

- **Fixed in e7631d094:** a merge whose `id:` an earlier commit or merge wrote says "An earlier commit has this id, so this merge is rejected and the earlier commit is drawn." Unit cases in `language.spec.ts`, golden `goldens/gitGraph/hover/merge-taken`.

### 5. Arrow `data-id` is neither unique nor unambiguous (low)

- **Where:** `render/render.ts:205-206` (`'data-id': `${a.from}>${a.to}``), fed by `layout/arrows.ts:54` (one arrow per parent entry).
- **Scenario 1, duplicate (verified):**

  ```
  commit id:"A"
  branch dev
  cherry-pick id:"A"
  ```

  This is accepted by v12 and v13: `dev`'s head is `A`, so the cherry-pick's parents are `[A, A]`. The SVG gets two identical `path.arrow` elements, both `data-id="A>1-3c6ef36"`.
- **Scenario 2, ambiguous (verified):** ids keep `>` as written (D263). `commit id:"ab"` followed by `commit id:"x>y"` gives `data-id="ab>x>y"`. A pair `a>b` → `c` and a pair `a` → `b>c` would both give `a>b>c`.
- **Fix:** skip a parent entry already drawn for the same child. The two v12 paths are coincident, so nothing visible changes. Percent-encode `%` and `>` inside the ids of the arrow `data-id`, as the AST ids already do (`parser.ts` `esc`). If this changes the documented structure, note it in MIGRATION.md.

- **Fixed in e7631d094:** `arrowsOf` skips a repeated parent (one arrow for `[A, A]`); `data-id` percent-encodes `%` and `>` in each id (`a%3Eb>c%25d`). Specs in `layout.spec.ts` and `render-behaviour.spec.ts`; MIGRATION.md's gitGraph SVG row says so. The AST round-trip spec is unchanged and green.

### 6. Test-only scaffolding left over: a hand-built stand-in DB and a stale "once T2" comment (low)

- **Where:**
  - `packages/diagram-gitgraph/src/layout/fixtures.ts:1-5` says "Parser-produced models replace these once T2 (#370) is on the branch", and line 23 is "A tiny stand-in for v12's DB". T2 merged long ago. `layout.spec.ts` still runs only on these hand-built models.
  - `packages/conformance/src/gitgraph/render-api.ts:7-11`: `gitApi` wraps `createMermaid()` in a needless `Promise.resolve`, left over from the stand-in registration.
- **Why it matters:** the stand-in builds models that the real builder rejects. `v12Positions()` cherry-picks the merge `M` without `parent:`, which gives `GIT_CHERRY_PICK_MERGE_PARENT` in v13 and a throw in v12. So some layout specs pin behaviour on unreachable input, and the stand-in's semantics can drift from `GitBuilder`'s.
- **Fix:**
  - Write the fixtures as gitGraph text through `parseGitGraph`. The package has it, and the corpus spec already does this.
  - Keep a hand-built model only for something the parser cannot produce, and say so.
  - Make `gitApi` synchronous, or inline it.

- **Fixed in e7631d094:** the fixtures are gitGraph text through `parseGitGraph` (the stand-in DB and the T2 note are gone; `v12Positions` cherry-picks `M` with `parent:"ZERO"`, which the parser accepts; positions unchanged). `gitApi` is synchronous.

### 7. Config and MIGRATION wording is inaccurate in three places (low)

- **`gitGraph.rotateCommitLabel`** (`config.schema.yaml:1968-1975`): the reason says "LR commit ids at −45 degrees". TB and BT ids rotate too (`layout/labels.ts:107-109`, as in v12), and the 40 px lane pitch applies in every direction. Fix: "commit ids at −45 degrees (LR, TB, BT), with 40 px more between the lanes".
- **`gitGraph.nodeLabel.width`, `.height`, `.x`, `.y`** are still `pending` (`config-reference.md:577-580`), while their parent is `ignored` because v12 never read it. Fix: mark them `ignored` too.
- **`MIGRATION.md:678`** (hand-drawn) still says "Gantt, pie, … and gitGraph will do the same once they are ported". gitGraph is ported now. This text is outside the diff but stale because of it.

- **Fixed in e7631d094:** `rotateCommitLabel` reason names LR, TB and BT; `nodeLabel.width`/`height`/`x`/`y` are `ignored`; MIGRATION.md's hand-drawn "Not sketched" names the ported self-drawn types as not sketched (D301, D305). `gen:config` rerun.

### 8. The size on the combined gantt and gitGraph tree is not in the run notes (low, process)

- **Where:** `INDEX.md`, "Wave 2 merge order", asks to "measure both core gates on the combined tree" after the gantt merge. The size table's last row is still T5 #374, from before f7089b7e2 and 72ceaf354.
- **What I checked:** `core-size.spec.ts` passes on 72ceaf354 (5/5). I did not run `cdn-build.spec.ts`.
- **Fix:** add a row with both measures for the combined tree before `gh pr ready`.

### 9. Per-branch colour is switched by a flag, not by the palette being non-empty; D152 wants the latter (low, for the PR body)

- **Where:** `render/paint.ts:125-126`. `plain()` uses `gitPaletteColors`. `redux` carries a non-empty `git` palette (`NEO_GIT` in `specs/redux.ts`), but the flag makes it draw every branch in `nodeBorder`.
- **Why it matters:** D152 says "Per-item colour is switched on by the theme carrying a non-empty palette, never by theme name". The flag is not a theme name, and the redux palettes must stay non-empty for mindmap's shared `git0` contract, so the choice holds up. But it departs from D152's wording, and GAPS (#373) lists the flag only as a Choice, not as a departure from D152.
- **Fix:** add one line to "For the maintainer". No code change.

## Checked, no finding

- **Model, layout, renderer:**
  - `GitLane.index` → slot → `scene.slots[...]` is used the same way by lanes, bullets and arrows.
  - A merge's second-parent colour and the colour of leftward or upward reroutes follow v12's `drawArrow`.
  - `findLane` (depth > 5, gap 10, shrink 1/5) and `shouldRerouteArrow` match v12.
  - The lanes taken include branch lines only with `showBranches`, which is v12's quirk.
  - The bounds use transformed label and tag corners and arrow vertices plus half the stroke. The quarter arcs stay inside them.
- **Cycles (D264):** `A`, `B`, `A` with `parallelCommits` in LR, TB and BT renders with arrows `A>B` and `B>A`, a single `data-ast` `c:A@2`, and no hang.
- **Ids (D260):** derived ids avoid every `commit` and `merge` `id:` written in the text (a recorded choice).
- **Facet:** an empty `id:""` produces no rename or references occurrence, because the service drops empty names. Renaming to an existing id is refused. Main is filtered from symbols, and renaming to `main` is refused.
- **Theme names (D152, D153):** no string for a theme name or `look` appears in the package's runtime code.
- **D266:** `neo` and `neo-dark` spread `NEO_GITGRAPH`, which is classic geometry plus `gitNodeColors`.
- **D267:** the slot rules match v12's `calcColorIndex` for bullets. `borderColorArray` is switched on by non-emptiness.
- **Theme cost:** the alias renames after the gantt merge (glb, gtk, gtr) are unique (`theme-inventory.spec.ts`).
