# 126 / 01: v12 class diagram, pointer notes

Pointers only. v12 = commit `fa796a943`. Read with
`git show fa796a943:<path>`. Short names used below:

- `J` = `packages/mermaid/src/diagrams/class/parser/classDiagram.jison`
- `DB` = `packages/mermaid/src/diagrams/class/classDb.ts`
- `TY` = `packages/mermaid/src/diagrams/class/classTypes.ts`
- `RE` = `packages/mermaid/src/rendering-util/rendering-elements/`

## 1. Lexer (`J`)

Line numbers are `git show ... | cat -n`. The lexer is lines 8-211, the grammar 221-440.

Start conditions (J:9-22), all exclusive (`%x`): `string`, `bqstring`, `generic`, `struct`
(declared, never entered), `href` (declared, never entered), `callback_name`, `callback_args`,
`acc_title`, `acc_descr`, `acc_descr_multiline`, `class`, `class-body`, `namespace`,
`namespace-body`. A rule with no `<state>` prefix applies to INITIAL only. `<*>` applies to
all states.

Rule groups, in order. Jison picks the first match by rule order, not the longest, so order matters.

- J:24-27 `direction` (TB/BT/RL/LR). The rules are `.*direction\s+TB[^\n]*`, so they take a whole line
  and any text before the keyword. Terminals `direction_tb|bt|rl|lr`.
- J:28-29 `%%` comments skipped. Two rules: `%%(?!\{)*...` and `%%[^\n]*`. Both are INITIAL-only,
  so a `%%` inside `class-body` becomes MEMBER text.
- J:30-36 accessibility. `accTitle:` enters `acc_title` and returns `acc_title`, then `acc_title_value`.
  `accDescr:` gives `acc_descr` and `acc_descr_value`. `accDescr {...}` gives the single terminal
  `acc_descr_multiline_value`; the `{` and `}` are consumed in the lexer.
- J:38-39 `NEWLINE` is `\s*(\r?\n)+`, and other whitespace is skipped. Note `\s*` is greedy: it
  swallows trailing spaces and blank lines into one NEWLINE.
- J:41-43 header `classDiagram-v2` and `classDiagram` both return `CLASS_DIAGRAM`. The v2 rule comes
  first, so the longer word wins. `[*]` gives `EDGE_STATE` (not used by the grammar).
- J:53-58 `call ` (INITIAL only) enters `callback_name`. This gives `CALLBACK_NAME` (`[^(]*`), then
  `(` enters `callback_args`, which gives `CALLBACK_ARGS` (`[^)]*`). `()` pops with no args.
- J:60-62 strings: `<*>["]` enters `string` and `STR` is `[^"]*`. There is no escape syntax,
  and strings may span newlines.
- J:63-64 `style` is `STYLE` and `classDef` is `CLASSDEF`. These are bare strings with no word
  boundary and no state prefix. Keywords are INITIAL-only here, so they are not recognised
  inside `class-body`.
- J:66-75 `namespace` (INITIAL, namespace, namespace-body) enters `namespace` and returns `NAMESPACE`.
  In `namespace`, `{` enters `namespace-body` (`STRUCT_START`). `}` in `namespace` pops and uses
  `this.less(0)`, so it re-lexes. In `namespace-body`, `}` gives `STRUCT_STOP`. EOF gives `EOF_IN_STRUCT`.
  A newline gives `NEWLINE`.
- J:77-87 `class` (INITIAL, namespace-body) enters `class` and returns `CLASS`. In `class`, a
  newline pops. `}` pops twice and gives `STRUCT_STOP`. `{` enters `class-body` (`STRUCT_START`). In
  `class-body`, `}` pops (`STRUCT_STOP`) and EOF gives `EOF_IN_STRUCT`. `{` gives `OPEN_IN_STRUCT`.
  A newline is skipped. `[^{}\n]*` gives `MEMBER`, one terminal per line, with raw text including
  leading spaces. `[*]` gives `EDGE_STATE`.
- J:89-96 `cssClass`, `callback`, `link`, `click`, `note for`, `note`, `<<`, `>>`. All are `<*>` and are
  bare substring matches. So a class named `linkage` or `notes` lexes as `LINK` + ... or `NOTE`
  + ... (v12 quirk; the lexer oracle will show it). Terminals: `CSSCLASS CALLBACK LINK CLICK NOTE_FOR NOTE
  ANNOTATION_START ANNOTATION_END`.
- J:104 `href` gives `HREF`. J:114-117 `_self|_blank|_parent|_top` give `LINK_TARGET`.
- J:106-108 generics: `<*>~` enters `generic`. `[^~]*` gives `GENERICTYPE`, and the closing `~` pops.
  Nested `~` (e.g. `List~List~int~~`) does not nest; the second `~` closes it.
- J:110-112 backtick strings: enters `bqstring`. `[^`]+` gives `BQUOTE_STR`. In the grammar this is
  `classLiteralName` (J:436), used for names like `` `IPC::Sender` ``.
- J:119-125 relation heads (all `<*>`, with leading `\s*`): `<|` and `|>` give `EXTENSION`; `>` and `<` give
  `DEPENDENCY`; `*` gives `COMPOSITION`; `o` gives `AGGREGATION`; `()` gives `LOLLIPOP`. Because `\s*o` is
  `AGGREGATION`, any name starting with `o` after a space must be matched earlier by `\w+`
  or the keyword rules. Check the oracle. J:126-127 `--` gives `LINE`, `..` gives `DOTTED_LINE`.
- J:128 `LABEL` is `":"{1}[^:\n;]+`, i.e. one colon and then text up to `:`, newline or `;`. Used both for
  relation labels and for `Class : member` lines. J:129 `:::` gives `STYLE_SEPARATOR`.
- J:130-139 `MINUS - DOT . PLUS + COLON : COMMA , BRKT # PCT % EQUALS =`.
- J:140-144 `\w+` gives `ALPHA`, `[` gives `SQS`, `]` gives `SQE`, a punctuation class gives `PUNCTUATION`,
  and `[0-9]+` gives `NUM`. Note `\w+` precedes `NUM`, so digits lex as `ALPHA`. `NUM` is effectively dead.
- J:145-206 `UNICODE_TEXT`: a huge BMP letter alternation. It is reached only for non-ASCII letters,
  since `\w` is ASCII.
- J:207-209 `SPACE` and `EOF`.

Grammar terminals that the lexer never emits (dead or Jison-only): `SEPARATOR` (J:336), `UNIT`,
`TAGSTART`, `TAGEND`, `DEFAULT`, `keywords` (J:426-432); `EDGE_STATE`, `OPEN_IN_STRUCT`, `SPACE` (inside
`emptyBody`, J:317) are emitted but not consumed. Dead rules to check: `emptyBody`, `commentToken`.

Grammar entry points: `start` gives `mermaidDoc | statements` (J:221-224). `graphConfig` is
`CLASS_DIAGRAM NEWLINE statements EOF` (J:231). Statement forms are J:260-276. Notable:

- Relation and members: `relationStatement [LABEL]` (J:339-344) takes four multiplicity shapes.
  `Class : member` is `className LABEL`, which calls `addMember(cleanupLabel)` (J:334).
- `classStatement` (J:300-309) takes `:::css`, `{members}`, and `<<annotation>>`, in the combos listed.
  `classIdentifier` (J:311) is `CLASS className [ "[" STR "]" ]`.
- `annotationStatement` is `<<x>> ClassName` (J:324).
- `className` (J:251-258) is `alphaNum`, `.`-joined (`A.B`), concatenated alphaNum runs, or one followed by
  `GENERICTYPE`, which is rebuilt as `Name~T~`.
- `namespaceStatement` (J:278-286) allows nested namespaces. `classStatements` (J:288-298) takes classes,
  notes, and nested namespaces. Namespace bodies may not contain relations or members.
- `clickStatement` (J:391-406): `callback X "fn" ["tip"]`, `link X "url" ["tip"] [_target]`,
  `click X fn[(args)] ["tip"]`, `click X href "url" ["tip"] [_target]`.
- `styleStatement` is `style <ALPHA> styles` (J:408). `cssClass "A,B" name` (J:412). `classDef a,b styles` (J:351).
  `styleComponent` (J:426) allows `ALPHA NUM COLON UNIT SPACE BRKT STYLE PCT LABEL`.
- `noteStatement` (J:346): `note for X "text"` and `note "text"`. There is no multiline note.
- `direction` (J:360). Accessibility is J:273-275. Comment tokens are skipped in the lexer (J:28-29).

## 2. classDb (`DB`, `TY`)

Model (DB:38-50): `relations[]`, `classes` Map, `styleClasses` Map, `notes` Map, `interfaces[]` (lollipops),
`namespaces` Map, `namespaceStack`, `direction` (default `TB`, DB:555), `functions[]` (click bindings).
`clear()` is DB:173. A module-level `classCounter` (DB:33) is never reset and feeds `domId`
(`classId-<name>-<counter>`, DB:133). Non-determinism across diagrams in one process, so normalise it
in the oracle diff.

- `ClassNode` (TY:4-22): `id`, `type` (generic), `label`, `text`, `shape: 'classBox'`, `cssClasses`
  (starts `'default'`, then `' x'` appended, DB:331-343), `methods[]`, `members[]`, `annotations[]`,
  `domId`, `styles[]`, `parent`, `link`, `linkTarget`, `haveCallback`, `tooltip`.
- `addClass` (DB:112): the name is split at `~` (`splitClassNameAndType` DB:80, generic = split[1] only, so
  nested generics are lost). The first declaration wins. `text` holds `name&lt;T&gt;`. `setClassLabel`
  (DB:94) makes `text` `label<T>` (a `<`, not `&lt;`).
- Member parsing: `addMember` (DB:277). `<<..>>` gives an annotation; any `)` after index 0 gives a method;
  otherwise an attribute. Empty strings are dropped. `addMembers` (DB:299) reverses the array first, because
  the grammar builds it back to front (J:329). `ClassMember` is TY:31-146.
  - Method regex TY:84 `/([#+~-])?(.+)\((.*)\)([\s$*])?(.*)([$*])?/`. It gives visibility (group 1),
    id, params, classifier (group 4), return type (group 5). A trailing `$` or `*` on the return
    type is moved to the classifier (TY:98-104).
  - Attribute: visibility = first char if in `# + ~ -` (TY:111). The classifier is a trailing `$`/`*` (TY:115).
  - Classifier to CSS (TY:136): `*` gives italic, `$` gives underline.
  - `text` (TY:129-133): `parseGenericTypes` (common.js) converts `~T~` to `<T>`, then `<`/`>` are
    escaped, and a leading `\&lt;` is rewritten to `~` (visibility `~`).
  - `getDisplayDetails` is TY:62. `sanitizeText` runs on the raw member (TY:58).
- Relations: `lineType` DB:500-503 (`LINE:0`, `DOTTED_LINE:1`). `relationType` DB:505-511
  (`AGGREGATION:0 EXTENSION:1 COMPOSITION:2 DEPENDENCY:3 LOLLIPOP:4`; "none" is the string `'none'`).
  `addRelation` (DB:209-253) does lollipop handling: `X ()-- Y` makes a synthetic `interfaceN` node
  (`addInterface` DB:139) and rewires the id. Titles are trimmed and sanitised. `'none'` means absent.
  `relation.title` comes from the `LABEL` rule (`cleanupLabel` DB:318 strips the leading `:` and trims).
  `ClassRelation` is TY:156-170.
- Namespaces (DB:563-682): `addNamespace` pushes the qualified id (`parent.child`) and auto-creates dotted
  ancestors with `explicit=false`. A redeclaration promotes an ancestor to `explicit`. `popNamespace`
  (DB:647). `addClassesToNamespace` (DB:667) sets `class.parent` and `note.parent`. A class declared at
  top level and later named in a namespace is moved (parent overwritten).
  `NamespaceNode` is TY:178-192.
- `hierarchicalNamespaces` (read in `getData`, DB:752; default true): true gives nested group nodes with
  `parentId` and `label` = last segment. False (compact) emits only `explicit` namespaces, labels them with the full
  qualified id, and reparents children via `resolveExplicitAncestor` (DB:733).
- Notes (DB:306): `note0..N`, `{id, class, text, index, parent}`. In `getData` (DB:790-830) a note becomes a
  `shape:'note'` node plus a dotted edge `edgeNote<i>` to the class (`pattern:'dotted'`, no markers).
  `note` with no class gives a floating note with no edge.
- Clicks (DB:377-512): `setTooltip`, `setLink` (formatUrl; `sandbox` forces `_top`; default `_blank`;
  adds css class `clickable`), `setClickEvent`/`setClickFunc` (DB:434-492; splits args on commas outside quotes,
  returns early unless `securityLevel === 'loose'`, then queues a binder in `functions[]`), and `bindFunctions`
  (DB:494). `setupToolTips` is DB:520. An id starting with a digit gets the `classId-` prefix before
  the lookup (DB:334, 408). This is a v12 quirk.
- Styles: `setCssClass` (DB:331, comma-separated ids), `defineClass` (DB:345; a style containing `color`
  also yields `textStyles` with `fill` renamed `bgFill`; it back-applies to classes that already have the
  css class). `setCssStyle` (DB:684; `style X fill:..`; splits commas). `classDef default` works via ALPHA.
  Every class starts with css class `default`.
- `getData()` (DB:748-875) is the LayoutData the renderer eats: group nodes, class nodes (with `colorIndex`,
  assigned in declaration order, DB:774), note nodes, interface nodes (`shape:rect`, `opacity:0`), and edges.
  Edge fields of interest: `arrowTypeStart/End` from `getArrowMarker` (DB:704;
  aggregation|extension|composition|dependency|lollipop|none), `startLabelRight` = `relationTitle1`, `endLabelLeft`
  = `relationTitle2`, `pattern` `dashed|solid`, `label`, `labelpos:'c'`. Edge id comes from `getEdgeId`
  (`id_<a>_<b>_<n>`).

## 3. Renderers, classBox, terminal labels

- Only `classRenderer-v3-unified.ts` is wired. Both `classDiagram.ts` and `classDiagram-v2.ts` are
  identical (same jison parser, same `ClassDB`, same renderer, same `init` copying `arrowMarkerAbsolute`).
  `draw` is lines 41-76: `setDiagramId`, `getData`, `render(data4Layout, svg)`, marker list at line 64
  (`aggregation extension composition dependency lollipop`), `nodeSpacing/rankSpacing` default 50, `insertTitle` with
  `classDiagramTitleText`, and `setupViewPortForSVG(svg, 8, 'classDiagram', useMaxWidth)`.
- `classRenderer.js` (277 lines, dagre-d3 via `svgDraw.js`) is the legacy v1/v2 renderer. It is dead code at
  `fa796a943` (nothing imports it). It has its own specs (`svgDraw.spec.js`, 2 tests). Do not port it.
- classBox: `RE/shapes/classBox.ts` (`classBox` at line 14). `PADDING = config.class.padding ?? 12`.
  Boxes are the label, an annotation group, a members group and a methods group, with two `.divider`
  lines (lines ~203-240, hidden when `hideEmptyMembersBox` and empty). `look: handDrawn` uses rough, and
  `neo` adds the `neo-line` class. Text layout is in `packages/mermaid/src/diagrams/class/shapeUtil.ts`
  (`textHelper`, line 15). Annotation text is `<<name>>`. Label HTML vs SVG depends on `htmlLabels`.
- Terminal labels (multiplicity): `edges.js` creates 4 slots (`startLeft|startRight|endLeft|endRight`, lines
  141-251) and `positionEdgeLabel` (line 302) places them with `utils.calcTerminalLabelPosition(distance,
  position, path)` (`utils.ts:398`; `distance` is 10 when an arrow is present, else 0). The class db uses
  only `startLabelRight` (`position 'start_right'`, line ~339) and `endLabelLeft` (`'end_left'`, line ~354).
  The offset is perpendicular to the path, at 10 px from the end point when an arrow marker is on that end.
  There is a spec at `RE/edges.terminalLabels.spec.js`.
- Markers: `RE/markers.js` (`aggregation` 136, `extension` 12, `composition` 76, `dependency` 195, `lollipop`
  253; each defines `<id>_<type>-<kind>Start|End[-margin]` ids). The type map is `RE/edgeMarker.ts:48-52`
  (`composition` and `dependency` filled, others hollow). The margin-support list is lines 62-71. Spec:
  `markers.spec.ts`, `edgeMarker.spec.ts`.
- Styles: `packages/mermaid/src/diagrams/class/styles.js`. `colorIndex` drives the redux-color palette.

## 4. v12 specs (all under `packages/mermaid/src/diagrams/class/`)

| file | `it` (incl. `it.each`) | parse call sites | notes |
| --- | --- | --- | --- |
| `classDiagram.spec.ts` | 147 | 139 `parser.parse(` | 15 `describe`s. Main spec, db assertions (`classDb.getClass`, relations, notes, namespaces). One case uses `classDiagram-v2`. Section starts at lines 13, 790, 883, 974, 1086, 1224, 1285, 1380, 1494, 2030, 2217 (`class db class`, db unit tests). |
| `classDiagram-styles.spec.js` | 10 | 10 | css class, classDef, `:::`, `style` |
| `classDiagram-colorIndex.spec.ts` | 3 | 0 | db-only, `getData().nodes[].colorIndex`. No parser. |
| `classTypes.spec.ts` | 93 | 0 | `ClassMember` unit tests (no parser) |
| `parser/class.spec.js` | 2 (one is `it.each` x2) | 3 | `__proto__`/`constructor` names, backtick namespaces |
| `svgDraw.spec.js` | 2 | 0 | legacy renderer, skip |

v1 vs v2: there are no separate variants at `fa796a943`. One jison file, one db, one renderer; the string
`classDiagram-v2` appears once in specs. Harvest `classDiagram` only (and keep one v2-header case).

Harvester recipe (mirror `packages/conformance/src/cli/harvest-flowchart.ts`): `git ls-tree` the
`class/` dir, filter `*.spec.[jt]s`, and apply the string-literal regex to each file. The regex is
`` `...`|'...'|"..." `` and keeps literals matching `^\s*(\\n)?\s*classDiagram`, skips `${`. JS escapes are decoded with
`new Function`. Caveats for class specs: many sources are built by `'a\n' + 'b'` concatenation
(`classDiagram-styles.spec.js` does this throughout), so a plain literal scan will only get the first fragment.
Those need a small evaluator that joins adjacent `+` literals, or running the spec files under vitest with
`parser.parse` spied. Also `` `classDiagram\nclass ${prop}` `` contains `${`, so handle by hand. Also harvest the
docs examples (`packages/mermaid/src/docs/syntax/classDiagram.md`) at the same commit.

## 5. Detector and config

- One detector: `classDetector-V2.ts:10`, `/^\s*classDiagram/`, id `classDiagram`. It matches `classDiagram` and
  `classDiagram-v2` (and `classDiagramFoo`; there is no word boundary). Loader is `classDiagram-v2.js`. There
  is no V1 detector at this commit. Registered at `diagram-api/diagram-orchestration.ts:94` (the `classDiagramV2`
  import is at line 14), after `kanban` and before `er`. Before matching, `detectType.ts` strips front matter, `%%{}%%`
  directives and comments (lines 37-39 area). Specs: `diagram-orchestration.spec.ts:25-26,60-79`.
- Config, `config.schema.yaml:1767` `ClassDiagramConfig` (extends `BaseDiagramConfig`; `unevaluatedProperties:false`).
  Class-specific defaults: `theme 'redux-color'`, `look 'neo'`, `titleTopMargin 25`, `arrowMarkerAbsolute` (shared
  anchor), `dividerMargin 10`, `padding 5`, `textHeight 10`, `htmlLabels false`, `hideEmptyMembersBox false`,
  `hierarchicalNamespaces true`; `nodeSpacing`/`rankSpacing` (min 0, no default; renderer falls back to 50),
  `diagramPadding` (ref `ErDiagramConfig`). `Base` supplies `useMaxWidth` etc. Note: code reads `padding ?? 12`
  in classBox and `?? 16` for namespace groups, so the schema default 5 is not what the code uses everywhere.
  Check `config.class.padding` resolution in the oracle run.

## 6. Corpus (`e2e/diagrams/class-diagram`, `*.mmd`)

Total 285 files. Breakdown (counts are recursive per directory, nested ones overlap):

- `nightly-check/` 229, of which `handdrawn/` 65, `dagre/` 58 (with `dagre/handdrawn/` 5)
- `visual-check/` 46
- `pr-check/` 10

The directories partition the 285 files as 229 + 46 + 10 = 285.

## 7. v13 prior art to copy (flowchart)

- Lexer oracle: `packages/conformance/src/flowchart/jison-lexer.ts` (83 lines). `loadFlowLexerOracle()` (line 39)
  imports `mermaid-v12`, takes the shared jison parser's `lexer`, wraps `setInput` to capture what v12's
  flowchart lexer received, re-lexes it, and returns `[terminalName, yytext]` pairs (`parser.terminals_`).
  For class: the same trick on the class jison parser (`parser.lexer`), after
  `mermaid.parse('classDiagram\n  class A')` to prime the diagram loader. Class strips front matter and `%%{}`
  directives before the lexer, as flowchart does.
- Whole-parse oracle: `packages/conformance/src/oracle.ts` (84 lines; `loadOracle` line 47, `Oracle.parse` returns
  `{accepted, diagramType, db}`; stubs DOMPurify with an identity purify, `mermaid-v12` pinned by pnpm alias).
  The class `db` is a `ClassDB`, so compare `getClasses()/getRelations()/getNotes()/getNamespaces()` (Maps).
- Registry: `packages/conformance/src/registry.ts:8` `PARITY_SUITES: ParitySuite[]`. One entry per diagram:
  `{ adapter, corpusDirs: ['e2e/diagrams/...'], corpusFiles: ['packages/conformance/corpus/<d>-v12-specs.json'] }`.
  Adapter for flowchart: `packages/conformance/src/flowchart/v13.ts` (and `v12.ts` for the oracle side).
- Lexer parity suite layout: `packages/conformance/src/flowchart/lexer-parity.spec.ts` (167 lines). It builds the corpus
  from `corpusFromDir(e2e/...)` plus the harvested JSON (`corpus()` at ~line 58), normalises both token streams
  (merge runs of `TEXT|STR`; clip to the first `INVALID`; decode entities), and compares them (`describe` at ~line 86). The
  header comment lists the deliberate differences. Other conformance pieces next to it: `flowchart/grammar/*`
  (EBNF reference + differential tests), `flowchart/error-corpus.ts`, `errors.spec.ts`, `symbols.spec.ts`.
- Package side: `packages/diagram-flowchart/` (`grammar/flowchart.ebnf`, `src/parser/`, `src/v12-specs/` ported specs,
  `scripts/port-v12-specs.ts`, which copies v12 specs at `fa796a943` with a `SKIP` table of `file: {test: reason}`;
  `src/generated/`, `src/ascii/`, `src/render/`). Token names are exported as `JISON_NAMES` mapping v13 token kinds to jison
  terminal names; plan the same for the class terminals listed in section 1.
- Harvester: `packages/conformance/src/cli/harvest-flowchart.ts` (script `harvest:flowchart` in
  `packages/conformance/package.json:12`), output `packages/conformance/corpus/flowchart-v12-specs.json`.
- Recipe docs: skill `port-diagram-v13`; earlier run notes in `v13/docs/agents/runs/37/01-explore.md` and
  `v13/docs/agents/runs/1/tickets/8.md`.
