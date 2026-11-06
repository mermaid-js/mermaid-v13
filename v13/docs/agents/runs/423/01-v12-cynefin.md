# 01 — v12 cynefin pointer notes (#423)

Additions to the spec (#423), not a restatement. Read v12 with `git -C /Users/knsv/repos/mermaid show mermaid@12.2.0:<path>`.
The v13 repo has v12 history too: `fa796a943` (the `V12` constant of `harvest-pie.ts`) holds the same cynefin
sources byte for byte (mermaid 12.2.0, parser 2.0.1). Only the two `cynefin.md` doc pages differ: they gain a
`description:` front matter and a ```` ```warning ```` fence. The spec's v12 line citations were all checked and hold.

## 1. Grammar and tokens (`packages/parser/src/language/`)

- `cynefin/cynefin.langium:4-15` entry, `:17-20` DomainBlock, `:22-24` DomainItem, `:26-28` Transition, `:30` DOMAIN_NAME.
- `common/common.langium:6` EOL, `:8-10` TitleAndAccessibilities, `:14-16` ACC_DESCR/ACC_TITLE/TITLE, `:22` STRING,
  `:29` NEWLINE, `:31-34` hidden WHITESPACE/YAML/DIRECTIVE/SINGLE_LINE_COMMENT.
- `cynefin/tokenBuilder.ts:5` passes `['cynefin-beta']` to `common/tokenBuilder.ts:9-28`, which appends
  `(?:(?=%%)|(?!\S))` at `:24`. `cynefin/module.ts:34-37` wires `CynefinTokenBuilder` + `CommonValueConverter`;
  `:40` `createCynefinServices` returns key `Cynefin`. `parse.ts:110-113` lazy-loads it.
- Value converter `common/valueConverter.ts:44-70`. It uses `common/matcher.ts:4,9,14`, which are *different*
  regexes from the terminals (no `[\t ]*` prefix, no `%%` lookahead). Single line: `.trim()` + `[\t ]{2,}`→space (`:59`).
  `accDescr {}`: the per-line trims at `:63-67`. STRING goes through Langium's default converter (unescape).
- **The token order, dumped from 2.0.1's `Lexer.definition`** (Chevrotain takes the first match, not the longest):
  `cynefin-beta:` (plain string) · `cynefin-beta` (bounded) · `-->` · `:` · DOMAIN_NAME · ACC_DESCR · ACC_TITLE · TITLE ·
  STRING · NEWLINE · WHITESPACE (skipped) · YAML · DIRECTIVE · SINGLE_LINE_COMMENT (hidden).
  WHITESPACE comes *after* TITLE/ACC_*, so their `[\t ]*` prefix swallows the indentation of every indented line:
  `  title X` lexes as TITLE `"  title X"`, not as WS + TITLE. No token has `LONGER_ALT`.
- Probe (`lex('---\ntitle: FM\n---\ncynefin-beta\n complex "a#9829;" %% c\n')`): the input reaching Chevrotain is
  `cynefin-beta\n complex "aﬂ°°9829¶ß" %% c\n\n` (front matter cut, entity encoded, `\n` appended). The last
  NEWLINE image is clipped to `""` by `langium-lexer.ts` `lexWith`, and the comment is in `hidden`.

## 2. DB (`packages/mermaid/src/diagrams/cynefin/cynefinDb.ts`, 96 lines) and the model-parity adapter

| Getter | Shape (probed through the conformance oracle) |
| --- | --- |
| `getDomains()` `:30` | `Map<DomainName, {name, items: {label}[]}>`: insertion order = first block, value = last block (`:43` `Map.set`). Only declared names. |
| `getTransitions()` `:32` | `{from, to, label}[]`. `label` is **present as `undefined`** for none or `""` (`:67`). Self-loops filtered (`:55-63`). |
| `getDiagramTitle/getAccTitle/getAccDescription` | `commonDb.ts:28-30` / `:16-18` / `:22-24`, each through `sanitizeText`. The oracle swaps DOMPurify for identity (`conformance/src/oracle.ts:40-49`), so only the regex parts count. |
| `getConfig()` `:71-76` | `cleanAndMerge({...DEFAULT_CONFIG.cynefin, ...getConfig().cynefin})`, giving exactly `{useMaxWidth:true,width:800,height:600,padding:40,showDomainDescriptions:true,boundaryAmplitude:8,seed:0}`. No `useWidth` key. |

- Populated by `cynefinParser.ts:8-12`: `populateCommonDb` (`common/populateCommonDb.ts:5-13`, each `if (ast.x)`, so an empty
  value never overwrites), then `setDomains(ast.domains)` and `setTransitions(ast.transitions)`. Item labels are **not** sanitised.
- Types: `types.ts:4-34`. Detector `cynefinDetector.ts:10`, v12 diagram type `'cynefin'` (use it for `v12Types`). Model the adapter on `conformance/src/pie/v12.ts:32-41` (`decodeEntities` from `../flowchart/v12.ts`) and on
  `pie/v13.ts:27-34` (`parsePieForParity` strips the front-matter title before parsing). Normalise `label: undefined` and an absent label to the same value.
- The v13 `CynefinModel` is already committed (`packages/diagram-cynefin/src/model.ts`, 3a60684cb). Its `domains` is an array (v12 uses a Map).

## 3. Renderer (`cynefinRenderer.ts`, 436 lines; `styles.ts`, 95)

**DOM order** (`draw` `:71-434`). `svg` gets `title` (`:105-107`), `desc` (`:108-110`) and `g[transform=translate(padding, padding)]` (`:112`).
Inside the `g`:
1. `g.cynefin-backgrounds`: 4 `rect.cynefinDomain`, in the order **complex, complicated, chaotic, clear** (`:119`).
2. `g.cynefin-boundaries`: fold, horizon (seed + 100, `:146`), cliff.
3. `path.cynefinConfusion` (a direct child of the root `g`).
4. `g.cynefin-labels`: 4 quadrant labels, then `Confusion`.
5. `g.cynefin-subtitles`: drawn **only if** `showDomainDescriptions`. Model then practice per quadrant, then `Disorder`.
6. `g.cynefin-items`: always drawn, even when empty. Domains in the order of `:233` (quadrants, then confusion). Each item is a bare `g`
   (no class), translated, holding `rect` (inserted before the text, `:292`) and then `text.cynefinItemText`.
7. `g.cynefin-arrows`: drawn only if there are transitions. Per transition, `path.cynefinArrowLine` and then an optional `text.cynefinArrowLabel`.
8. `text.cynefinTitle`, if a title is set.

The `defs > marker#cynefin-arrow-${id}` (`:353-367`) is appended to the svg, after the root `g`, only when there are transitions.
The label text is `name[0].toUpperCase() + rest` (`:178`). Text anchors: labels and subtitles use
`dominant-baseline: middle`, item text uses `central` (`:273`), arrow labels use **`auto`** (`:417`) and the title uses `middle`.

**Metrics table** (renderer line unless marked; `S:` = styles.ts, `B:` = cynefinBoundaries.ts):

| Constant | Value | Line |
| --- | --- | --- |
| quadrant fill-opacity | 0.4 | :130 |
| ellipse rx, ry | 0.15·w, 0.15·h | :158-159 |
| ellipse fill-opacity | 0.5 | :165 |
| quadrant label dy (desc / none) | −30 / 0 | :175 |
| confusion label dy | −10 / 0 | :186 |
| subtitle dy (model, practice) | −10, +5 | :202, :211 |
| `Disorder` dy | +8 | :222 |
| item height, x-padding | 26, 10 | :230-231 |
| confusion items start | cy + 22 / cy + 14 | :255 |
| quadrant items start | cy + 25 / cy + 15 | :258 |
| item step gap | +4 (step 30) | :263, :309 |
| width fallback | `len·7` (drop it) | :277, :322 |
| badge rx/ry | 4 | :298-299, :341-342 |
| item / overflow fill-opacity | 0.95 / 0.6 | :301 / :345 (and S:46, S:55) |
| `MAX_CONFUSION_ITEMS` | 3 | :69 |
| marker viewBox, refX, refY, size | `0 0 10 10`, 9, 5, 6×6, `auto-start-reverse` | :359-364 |
| head path | `M 0 0 L 10 5 L 0 10 z` | :366 |
| curve normal offset | 0.15·len | :396 |
| arrow label dy | −6 | :415 |
| title y | −padding/2 | :429 |
| subtitle / arrow-label size | itemFontSize − 1 | S:41, S:84 |
| title size | domainFontSize + 2 | S:88 |
| item / overflow stroke-width | 1 | S:48, S:57 |
| overflow dash | `3 2` | S:58 |
| boundary dash | `6 3` | S:63 |
| ellipse stroke, dash | 1.5, `4 2` | S:71-72 |
| fold/horizon segments | 7 | B:60, B:102 |
| amplitude fallback | 0.015·w / 0.015·h (dead: the config default is 8) | B:59, B:101 |
| fold jitter / control multipliers | 17 / 31, +7, ×1.5 | B:65, B:75 |
| horizon jitter / control multipliers | 23 / 37, +11, ×1.5 | B:107, B:117 |
| cliff amplitude, top | 0.03·w, 0.5·h | B:139, B:137 |
| cliff fractions and x factors | .2/.55/.75, .85/.95/1; +1, −1.5, +.5, −1, +.3 | B:144-149 |

- Colours: fills are attributes (`:129,164,300,344`) from `getCynefinDomainColors` (`:61-66`). Strokes and fonts are CSS (`S:29-93`).
  Both merge `theme-default.getThemeVariables()` under the *current* computed `themeVariables` (`cleanAndMerge`), which is the fallback the spec names.
- Measurement: `getBBox()` on the item text *after* the class CSS applies (`:279-284`). The font family is the root `#id` style, the size is `S:51`.
  `+N more` likewise (`:322-329`). Every text is `.text()`, so nothing is parsed.
- Size: `configureSvgSize(svg, totalHeight, totalWidth, useMaxWidth ?? true)` (`:101`) plus `viewBox 0 0 W H` (`:102`). The arrow line runs centre to centre (`:385-405`), so the head tip lands on the target's label, and complex↔clear crosses the ellipse.

## 4. Boundaries (`cynefinBoundaries.ts`, 169 lines)

- `seededRandom(seed: number): number` `:5-10`. It is **stateless**: one mulberry32 step used as a hash, not a stream.
  `(seed + 0x6d2b79f5) | 0` truncates a fractional seed and wraps int32 (`seed + 100` with `2³¹−1` wraps). Port it with the same int ops.
- `hashString(str): number` `:15-23` (Java-style `h*31 + c`, `|0`). It can return 0, and 0 is then used as is.
- `resolveSeed(configuredSeed: number|undefined, id: string): number` `:32-41`. A finite non-zero seed is used as is.
  Otherwise (0, undefined, NaN, ±Infinity) the result is `hashString(id)`, where `id` is the SVG element id (`:115`).
- `generateFoldPath(w, h, seed, amp?)` `:52-84`; `generateHorizontalBoundary(w, h, seed, amp?)` `:94-126` (both `cp*y`
  or both `cp*x` sit at the segment midpoint); `generateCliffPath(w, h)` `:135-151`; `generateConfusionPath(cx, cy, rx, ry)`
  `:161-169`, which is two `A rx,ry 0 1,1` half arcs plus `Z`. v13's `PathBuilder` has `curveTo`/`quadTo`/`arcTo` (`core/src/svg/path.ts:11-23`).
- The v13 default `ctx.idPrefix` is `defaultIdPrefix` = FNV-1a of text + config + options (`mermaid/src/config-snapshot.ts:122-136`),
  read through the getter at `mermaid/src/api.ts:678-681`. So D362 ("hash `idPrefix`") is in effect a hash of the source unless `options.id` is given: two identical diagrams on one page get the same waves.

## 5. Specs, docs and examples

- `cynefin.spec.ts` (191 lines), **27 `it`**:
  - DB, 11 (`:22-103`): empty, set domains, transitions with and without label, self-loop filter, only self-loops, null blocks, clear, multiple domains, multiple items, config object. Helpers `block()`/`tx()` `:15-20` (`tx` passes `label ''`).
  - Boundaries, 10 (`:105-163`): seededRandom deterministic and in [0, 1); hashString consistent and distinct; fold valid and deterministic; horizon valid; cliff valid; confusion valid and with the given centre and radii.
  - resolveSeed, 6 (`:165-190`): non-zero; 0; undefined; explicit seed ignores the id; ids differ; NaN/Infinity.
- `cynefin.integration.spec.ts` (275 lines), **15 `it`, 16 `parser.parse` strings**. They call `cynefinParser` directly, so the text skips v12 preprocessing:
  Basic 5 (domains; all five; empty; multiple items; `%%` comments) · Transitions 3 (labelled; no label; multiple) · Accessibility 3
  (accTitle; accDescr; title) · Complex diagram 1 · Self-loops 2 (drop and keep; all self-loops) · Re-parse after clear 1 (2 parses).
- `packages/mermaid/src/docs/syntax/cynefin.md`, **8 fences**:
  - `:23` ```` ```md ````, the full syntax template;
  - `:64` and `:76`, two **fragments with no header** (items only, transitions only): parity cases that v12 rejects, or skip them;
  - `:93`, `:118`, `:144`, three ```` ```mermaid-example ```` blocks;
  - `:169` (front-matter `config.cynefin`) and `:216` (acc), two full diagrams in plain ```` ``` ````.

  Pie's harvest regex (```` ```mermaid(?:-example)?\n ````) catches **only 3**, so widen it for cynefin.
  The generated `docs/syntax/cynefin.md` has 11 fences: the 3 examples are each doubled as `mermaid`.
- `packages/examples/src/examples/cynefin.ts`: 2 `code:` strings (`:11` Incident Response, the default; `:38` Product Strategy).
- The docs claim "self-loops silently ignored" and "deterministic: same input same diagram". Both are false in v12 (`log.warn`, id hash).

## 6. v13 seams

- **The package skeleton exists** (`packages/diagram-cynefin/`, commit 3a60684cb). It has only the `.` export and no `mermaid` manifest.
  Copy `./language` and `./testing` and the manifest from `packages/diagram-pie/package.json:13-29,47-58`.
  Pie's layout: `src/{plugin,index,testing,language,labels,model}.ts`, `parser/{tokens,lexer,parser,convert,detect,ast}.ts`, `layout/{metrics,layout,types,invariants,fixtures}.ts`,
  `render/{render,paint}.ts`, `facet/`, `generated/`, `v12-specs/{adapter,*.spec}.ts`, `scripts/port-v12-specs.ts`, `grammar/pie.ebnf` + `grammar/generated/`.
  Quadrant has **no `metrics.ts`**: it takes lengths from config, and its literals spec allows halves and quadrant numbers.
- Plugin object: `diagram-pie/src/plugin.ts:17-29` (`labels` D178, `layout`, `render`, `configDefaults` from `generated/config-defaults.ts`). Contract: `core/src/pipeline/types.ts:129-168`. `DiagramParseContext.preprocessed` is at `:37-44`, and `RenderContext.idPrefix` at `:60`.
- D218: `diagram-pie/src/parser/parser.ts:219-220` (`this.title || this.pre.frontMatter?.title`).
- D225 text: `diagram-pie/src/layout/layout.ts:34-51`. Fonts come from `ctx.theme.value('fontFamily')` and `ctx.theme.number(...)`, and each text goes through
  `layoutLabel(text, font, Infinity, ctx.measurer, {inline, markdown?})` from `@mermaid-js/core/text`, drawn with `w.label(box, x, y, attrs)` (`render/render.ts:49-53`).
  The root `svg` and its `title`/`desc` ids: `render/render.ts:110-140`.
- Layout literals: the specs live in **conformance**, not in the package: `packages/conformance/src/pie-layout-literals.spec.ts`
  (its `ALLOWED` table `:9-15`) and `quadrant-layout-literals.spec.ts`. Add `cynefin-layout-literals.spec.ts` beside them.
  Pie's table: `diagram-pie/src/layout/metrics.ts:21-75`.
- Lexer oracle: `conformance/src/langium-lexer.ts:32-34` (`LANGIUM_LEXERS`, currently only `pie`), `loadLangiumLexerOracle` `:133`.
  The cynefin row works as the spec writes it (probed). Map token names with `LANGIUM_NAMES`, as in `diagram-pie/src/parser/tokens.ts:42-56`.
- Pie conformance suite `conformance/src/pie/`: `corpus.ts` (the gate set: e2e + harvest + quirks + CRLF/commented copies), `lexer-parity.spec.ts`,
  `parity.spec.ts`, `probe.spec.ts`, `stress.spec.ts` / `parser-stress.spec.ts` (8n/n ratio, a bar of 24×), `layout-corpus.spec.ts`,
  `render.spec.ts` (includes UnsupportedFormatError), `render-api.ts`, `theme.spec.ts` (all 11 themes), `service-symbols.spec.ts`, `v12.ts`, `v13.ts`,
  `grammar/{differential,grammar-lexer,sentences}.spec.ts`, `pie-grammar.ts`, `reference.ts`.
- `PARITY_SUITES`: `conformance/src/registry.ts:17-73`. Pie's row is `:59-63`. Imports go at `:1-11`.
- Harvest: `conformance/src/cli/harvest-pie.ts` (70 lines, `V12='fa796a943'`, `FILES` at `:16-20`, the literal filter at `:59`, docs at `:63-67`).
  Its script is `harvest:pie` (`conformance/package.json:15`), and the jison types use `cli/harvest.ts`.
  Corpus naming: `corpus/<type>-v12-specs.json` and `corpus/<type>-cases.json`.
- Generators (root `package.json:27-31`): `gen:config`, `gen:theme`, `gen:registry`, `gen:grammar`.
  - Add `cynefin: 'packages/diagram-cynefin'` to `SECTION_OWNERS` (`tools/gen-config/src/generate.ts:35-43`), or no defaults are generated.
  - Add a `GRAMMARS` row in `tools/gen-grammar/src/generate.ts:23` (pie's row is `:107-116`). The path is `packages/diagram-${type}`, so use type `cynefin`.
  - The detection-order row is `tools/gen-config/src/registry.ts:63`. Generated output: `mermaid/src/generated/registry.gen.ts:105`, `detectors.gen.ts:41`, `language-service/src/generated/facets.gen.ts:111`.
- Other wiring that pie and quadrant needed:
  - workspace deps in `mermaid/package.json:65-66`, `bench/package.json:22-23`, `conformance/package.json` devDeps, and `language-service/package.json:37,58,78`;
  - `knip.json:40`, `e2e/helpers/platform-harness.spec.ts:79` and `.changeset/pre.json`;
  - the integration spec `mermaid/src/pie.spec.ts`.
  - `dev/src/fixture-discovery.ts:31` already maps `cynefin`.
- Config: `core/schema/config.schema.yaml:4829-4874` is `CynefinDiagramConfig`, every key `pending`. It has no `useWidth`/`useMaxWidth`
  overrides yet; copy pie's at `:2075-2083`. `v13/docs/config-reference.md:890-905` (`cynefin.look` already `ignored`, D153).
  The hand-drawn alias is at `plugin-hand-drawn/schema/config.fragment.yaml:44`.
- `UnsupportedFormatError`: `core/src/pipeline/errors.ts:95-105`. It is thrown by `mermaid/src/api.ts:506-508` (`checkText`) from the manifest
  `formats`, so the plugin needs no code; `formats: ['svg']` is enough.
- SVG: `num()` is at `core/src/svg/escape.ts:47-61`. `stroke-dasharray`, `fill-opacity`, `font-style` and `dominant-baseline` are allow-listed, and `marker-end` is not.

## 7. Corpus (`e2e/diagrams/cynefin/`: 12 `.mmd`, all with front matter + `description:`)

- nightly `…amplitude-is-zero`: `boundaryAmplitude: 0`, title, 4 quadrants × 1 item. nightly `…without-domain-descriptions`: `showDomainDescriptions: false`, title, complex + clear.
- `…with-transitions`: title, 4 × 1, a 4-transition labelled cycle (no diagonals, no confusion). `…all-five-domains`: title, all 5 domains, 1–2 items each.
- `…empty-cynefin-framework`: title, 4 declared empty quadrants. `…explicit-seed-override`: `seed: 42`, title, 4 × 1, the only fixed seed.
- `…accessibility-directives`: single-line `accTitle`/`accDescr`, 4 × 1, no title. `…config-override`: width 1000, height 700, amplitude 15, complex + clear, no title.
- `…confusion-domain-items-without-overflow`: **misnamed**: 5 confusion items, so a `+2 more` badge *is* drawn.
- `…many-items-per-domain`: 3/3/3/2 items, long labels. `…self-loop-transitions-silently-dropped`: one real transition and one self-loop.
- `…theme-override`: `theme: base`, nested `themeVariables.cynefin` (complexBg, clearBg, boundaryColor).
- No `baseline/` yet (pie's is `baseline/{config,data,legend,text}/`); `visual-check/` holds only `.gitkeep`.

## 8. Theme

- v12 blocks: `theme-default.js:298-315`, `theme-base.js:258`, `theme-dark.js:265`, `theme-forest.js:261`, `theme-neutral.js:286`.
  `neo`, `neo-dark` and the four `redux*` themes have none (6 of 11, confirmed).
- v13 core vocabulary: `core/src/theme/vocabulary.ts`.
  - `def()` `:197`; `TEXT_USERS` `:204-214`, where a new type appends; `PIE_SLOTS` `:222-225`; `THEME_VARIABLES` `:233`, pie rows `:298-309`.
  - The length names are listed in the `TOKEN_VARIABLES` join at `:105`, with the pie lengths at `:152-157`.
  - Values per theme: `core/src/theme/specs/*.ts` (e.g. `default.ts:36`), and the lengths in `specs/geometry.ts:217-221`.
  - The runtime table `generated/variables.ts` is written by `gen:theme`. Flat overrides are checked in `theme.ts:553-575` (`checkOverrides`).
- **#414 T0a has not landed anywhere.** `claude/414-theme-t0-1c178e` and `feature/414_theme-t0` are both at `dd4b9d19f`, with 0 commits past
  `origin/mermaid-v13`, and there is no remote branch. The 414 worktree has only uncommitted `DECISIONS.md` and `bench/src/cli/theme-identity.ts`
  edits. `DiagramThemeTable` and `DiagramPlugin.theme` appear in no file there. So T5 takes the interim pure-call rule, or waits.
