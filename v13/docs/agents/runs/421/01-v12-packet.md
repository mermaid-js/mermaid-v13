# 421 / 01: v12 packet pointer notes

Paths are relative to the repo root. `t:` stands for `git -C /Users/knsv/repos/mermaid show mermaid@12.2.0:<path>`. **The `mermaid@12.2.0` tag is not in this checkout**, only in `/Users/knsv/repos/mermaid` (1fb786986). Here, `fa796a943` holds the same packet, parser and schema files; only the syntax page differs (fa adds a 4-line `description:` front matter and swaps `mermaid`/`mermaid-example` fences). Line numbers are 1-based, taken on `feature/421_packet` at 26323b244.

## 1. v12 packet source (`t:packages/mermaid/src/diagrams/packet/`, 385 LOC)

- **detector.ts:10**: `/^\s*packet(-beta)?/`. Loaded after `sankey` (`t:…/diagram-api/diagram-orchestration.ts:108-109`).
- **parser.ts** (107 lines): `parse('packet', input)` :97, then `populate` :11-53. `maxPacketSize = 10_000` :9.
  - `populateCommonDb` first (`t:…/diagrams/common/populateCommonDb.ts:4-14`, truthy only, so an empty title keeps the front-matter one).
  - Errors, thrown, first wins: end < start :19-21; not contiguous :23-29 (`${end ?? start}`, so `18 - 18`); `+0` :30-32 (start printed is `lastBit + 1`).
  - Split loop :38-50: `while (word.length <= bitsPerRow + 1 && db.getPacket().length < maxPacketSize)`; a full cap drops every later field silently. `getNextFittingBlock` :55-91 splits at `row * bitsPerRow - 1`; pieces get `bits` one short (:82, :88). Its own throws :60-69 are unreachable.
  - `bitsPerRow` is read from `db.getConfig()` :16, so rows depend on config at parse time.
- **db.ts:21-30**: `getConfig` = `cleanAndMerge(DEFAULT_CONFIG.packet, getConfig().packet)`, then `paddingY += 10` when `showBits` (:26-28). `pushWord` skips empty words :36-40. Common acc/title setters :47-52.
- **renderer.ts** (113 lines): height `totalRowHeight * (words + 1) - (title ? 0 : rowHeight)` :14-15; width `bitWidth * bitsPerRow + 2` :16; viewBox + `configureSvgSize(…, useMaxWidth)` :19-20 (`useWidth` never read). Title `text.packetTitle` always appended, even empty :26-33. Row `g` :50, `wordY` :51; column/descending :57-58; `x = column*bitWidth + 1`, `width = bits*bitWidth - paddingX` :59-60; `rect.packetBlock` :62-68; `text.packetLabel` centred, d3 `.text()` :71-78; bit numbers at `wordY - 2` :90, `packetByte start` (centred when one bit) :91-98, `packetByte end` :101-110. Never reads `block.bits`.
- **styles.ts:5-16** the ten defaults (10px/12px/14px, five `black`, stroke `1`, fill `#efefef`); CSS :21-44. No `fontFamily`, theme-name, look, gradient or shadow branch.
- **types.ts:14-25** `PacketStyleOptions`; :6-7 `PacketBlock`/`PacketWord`. **diagram.ts:7-14** wiring.

## v12 Langium (`t:packages/parser/src/language/`)

- `packet/packet.langium:4-21`: grammar as in the spec. Uses common `INT` `/0|[1-9][0-9]*(?!\.)/` and `STRING` (`common/common.langium:19`, :22).
- `packet/tokenBuilder.ts:5`: `super(['packet'])` only, so `packet-beta` has no boundary (`common/tokenBuilder.ts:14-28` adds `(?:(?=%%)|(?!\S))`).
- `packet/module.ts:46-47`: `CommonValueConverter` (no packet converter file); `createPacketServices` :65-80 → `{ shared, Packet }`. Lexer oracle: `Packet.parser.Lexer`.
- `common/common.langium:6-34`, `common/valueConverter.ts:44-70`, `common/matcher.ts:4-14`: as pie's notes (`runs/288/01-v12-pie.md:32-34`).
- `t:packages/parser/src/parse.ts:45-48` packet loader; :146-147 any lexer/parser error throws `MermaidParseError`.
- **Lexer probe** (v12 repo's 2.0.1 build): definition order `packet-beta packet - + : ACC_DESCR ACC_TITLE TITLE INT STRING NEWLINE WHITESPACE YAML DIRECTIVE SINGLE_LINE_COMMENT`, as the spec says. `packet-beta0: "a"` → `packet-beta INT : STRING`; `01` → `INT INT`; `10.` → `INT INT` + error; `1e3` → `INT` + **error at `e`** + `INT` (the spec's "lexes 1, 3" leaves out the error); `---`…`---` in the body is hidden `YAML`.
- **Config** `t:packages/mermaid/src/schemas/config.schema.yaml:435-436`, `PacketDiagramConfig` :2738-2787: rowHeight/bitWidth/bitsPerRow 32 (min 1), showBits true, bitOrder `ascending`|`descending`, paddingX/paddingY 5 (min 0). Base useWidth/useMaxWidth :476-489.
- **Themes**: only `theme-dark.js:328-335` (`primaryTextColor` ×5, `background`) and `theme-forest.js:305-312` (`primaryTextColor` ×5, `mainBkg`), both inside `updateColors`. No other theme file mentions packet. Nested merge: `theme-helpers.js:15` `applyOverride`.

## 2. Spec strings to harvest (`t:` paths)

- `packages/mermaid/src/diagrams/packet/packet.spec.ts` (274 lines): **16** `parser.parse(` strings (:15-:267), **7 rejected** (:205, :215, :225, :235, :245, :256, :266; the spec says six), 2 splits (:129 `11-90`, :171 `17-63`). :77 and :103 are the same string (15 distinct). Inline snapshots give v12's messages.
- `…/packet/renderer.spec.ts` (240 lines): 11 cases (9 `it` + one `it.each` ×2) over **3 distinct texts**: `twoFields` :87, `register` :92, `0-7: "foo"` :206/:211; configs `bitsPerRow` 8/16, `bitOrder`, `showBits: false` (via `setConfig`, :76).
- `packages/parser/tests/packet.test.ts` (25 lines): **8** header forms in one `it.each` :7-19.
- `packages/mermaid/src/docs/syntax/packet.md` (136 lines): **4** `mermaid-example` fences: :34 TCP (front-matter title), :58 UDP (`+16`, in-text title), :77 descending register (config front matter), :121 `themeVariables.packet` (inside the `<!-- … -->` at :100-136, with the stale "not currently working" note). Plain fences :13, :24 are templates (`start: …`, `... More Fields ...`) and not diagrams, so only **one** real example uses `+N` (spec: two).
- `packages/examples/src/examples/packet.ts` (44 lines): **2**: :11 TCP starts with `---` front matter, :35 UDP all `+16`.
- `packages/mermaid/src/rendering-util/multi-diagram-id-uniqueness.spec.ts:88-90`: **1** (`packet-beta`).
- Total 34 literals, about 32 distinct.

## 3. e2e corpus (`e2e/diagrams/packet/`)

- **6** `.mmd`, all `pr-check/`; `nightly-check/`, `visual-check/` empty, no `baseline/`. TCP header (17 fields, 224 bits) twice: default, and `showBits: false` + front-matter title; `descending` 16-bit register (front-matter title, `bitsPerRow: 16`); `packet-beta` + `title Hello world` + `0-10`; `packet` + same title; single bits `0`, `1`.
- No field crosses a row (true), but not every field "ends on a row boundary" (`0-10`, `0`, `1` do not). All indented two spaces, double quotes. No `+N`, acc*, single quotes, escapes, comments, rejects, theme or `themeVariables`.

## 4. v13 seams (from pie)

- **Oracle** `packages/conformance/src/langium-lexer.ts:32-34` `LANGIUM_LEXERS` (row `{probe, factory, key}`, interface :22-29); capture note :10-13; `loadLangiumLexerOracle` :133; alias `mermaid-parser-v12` :97 (`package.json:37` → `@mermaid-js/parser@2.0.1`). `langium-lexer.spec.ts:5` pins the version.
- **Gate** `src/pie/lexer-parity.spec.ts`: normalisation doc :9-36, `EXCLUDED` :37, `HIDDEN` :41, `v13Streams` :58-70 (via `LANGIUM_NAMES`), `loadLangiumLexerOracle('pie')` :94, e2e count `47` :125, `>450` :126. Copy with `'packet'` and the 6-file count.
- **Corpus** `src/pie/corpus.ts`: `LINE_SEPARATORS` :15, `QUIRKS` :29, `PARSER_CASES` :126, `UNCLOSED_DIRECTIVES` :179, `pieCorpus` :185 (e2e dir + `corpus/pie-v12-specs.json`), `pieGateCorpus` :197 (CRLF + `commented()` from `src/sequence/corpus.ts`).
- **Stress** `src/pie/stress.spec.ts` `SHAPES` :12-41 (lexer, via `pieTokens`), `parser-stress.spec.ts` :10 (via `parsePie`). Drop pie's FLOAT shapes; keep unclosed `accDescr {` :21, quotes :16-19.
- **Harvest** `src/cli/harvest-pie.ts` (70 lines): `V12 = 'fa796a943'` :15 (the tag is absent here, see top), `FILES` :16-20, header filter `/^\s*…pie(?![\w.])/` :59, docs fences :65. To parameterise: type, file list, header regex (`packet(?:-beta)?`) and docs page as arguments; the header filter **misses** `examples/packet.ts:11` (starts `---`) and harvests the commented-out docs fence :121. Script `package.json:15`. Alternative: the jison CLI's `literals` descriptor (`src/jison/harvest.ts:16`, `src/jison/types.ts:17-29`), `harvest <type>`.
- **Suites** `src/registry.ts:17` `PARITY_SUITES`, pie row :59-63. `ParitySuite` `src/corpus.ts:10-17`; `DiagramAdapter` `src/types.ts:8-25` (`v12Config?` :16, used at `src/runner.ts:82`). v12 reads `bitsPerRow` from front-matter config itself. Adapter model: `src/pie/v13.ts:36-43`, `v12.ts:32`.
- **Pie parser** `packages/diagram-pie/src/parser/tokens.ts` (`T` :10-28, `PIE_TRIVIA` :35 with `T.Yaml`, `LANGIUM_NAMES` :42-56), `lexer.ts` (`lex` :68, 404 lines), `parser.ts` (`parsePie` :163, `EXPECTED` :108), `index.ts:34` `pieTokens`, `testing.ts:7-8`.
- **Plugin/manifest** `diagram-pie/src/plugin.ts:19-20` (`formats ['svg']`, `layoutKind 'custom'`); `diagram-pie/package.json:13-27` (exports `.`, `./language`, `./testing`), :47-57 (`"mermaid"` block).
- **Grammar** `tools/gen-grammar/src/generate.ts:23` `GRAMMARS`, pie target :107-116; `diagram-pie/grammar/pie.ebnf`; differential `packages/conformance/src/pie/grammar/`. Script root `package.json:31`.
- **Registry rows** `packages/mermaid/src/generated/registry.gen.ts:91`, `detectors.gen.ts:27`; source `tools/gen-config/src/registry.ts:49`.
- **Config** `packages/core/schema/config.schema.yaml`: required list :56; `packet: $ref` pending :1018-1020; `PacketDiagramConfig` :4364-4420 (seven keys pending at :4376, :4382, :4388, :4393, :4408, :4414, :4420); Base useWidth/useMaxWidth :1089-1100 (pending).
- **Theme** no `DiagramPlugin.theme` table yet (#414 T0a/T0b not landed): fallback is pure-call rows in `core/src/theme/vocabulary.ts` like `PIE_SLOTS` :222, spread :298; guard `packages/mermaid/src/cdn-build.spec.ts:103-108`. `tools/gen-config/src/theme-used-by.spec.ts`: `DYNAMIC_READS` :17, `readsOf` :33-40 (only names in `THEME_VARIABLES`), `TYPES` list :50-60 (add `'packet'` after `'journey'`).
- **Labels** `layoutLabel` `core/src/text/label.ts:86`; pie `diagram-pie/src/layout/layout.ts:49-50`; journey `diagram-journey/src/layout/env.ts:81` (`maxWidth` from the box, the shape for fit-to-field).
- **ASCII** `core/src/ascii/index.ts:5-18`: `Canvas` (`canvas.ts:13`), `drawBox` (`draw.ts:58`), `drawText` (`draw.ts:15`), `junction` (`glyphs.ts:170`), `ascii`/`unicode` glyphs, `asciiOptions`, `cellMeasurer`. Model: `diagram-er/package.json:19-22` (`./ascii`), :53-58 (`formats`, `"ascii"` key), `src/plugin.ts:23-24`, `src/ascii.ts:10-21`.

## 5. The reference implementation

- No source of the reference implementation on this machine: no `pele/src/diagrams/packet/` under `/Users/knsv`. Only `packages/bench/fixtures/pele/` (class, flowchart, sequence `.mmd` + `manifest.json`), no packet. The token table must come from the oracle probe above.
