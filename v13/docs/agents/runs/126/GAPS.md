# Gaps, spec #126

Unmet acceptance criteria and announced contracts, under the ticket that owns each one.

## Held

- Released 2026-11-04: M2.5 (#123) merged into `mermaid-v13` and into this branch (`b93d413f6`); #27, #28, #29, #31 closed. #154 (T2) started; #159 (T6) and #155 (T3) follow T2.

## Spec corrections (from 01-v12-class.md)

- At fa796a943 there is one detector (`/^\s*classDiagram/`) and one pipeline: `classDiagram` and `classDiagram-v2` share the jison, `ClassDB` and `classRenderer-v3-unified`. The "v1 and v2 specs" (#153, #154) and "both v12 renderers" (#156) in the tickets mean that single pipeline; `classRenderer.js` and `svgDraw.js` are dead code. The MIGRATION entries in #156 compare against the unified renderer.

## #152 (T0) known limits

Done: merged into `mermaid-v13` as #165 (`5a6425d8e`) and into this branch (`841c1eb64`); #152 closed by the PR. The limits below are accepted, not open work for this spec.


- Edges routed `direct` (over MAX_DUMMIES) get no reserved room for end labels; their labels are still placed clear (spec "edge drawn without bends").
- Grid: an edge between a group and its own member (fixture F4) can put the member end's label above the group border.
- Room is reserved for all end labels on a side, so a fan's gap can be taller than needed. T3 may tune it.

## #153 (T1) → later tickets

- #157 (T5): `@mermaid-js/diagram-class` is `"private": true`; make it public and add it to the changeset `fixed` group.
- #154 (T2): add the class line to `PARITY_SUITES` with the model adapter. Done (`classAdapter`, `feature/154_class-parser`): 711/711 agree, no divergences listed.
- Not class-specific, for the maintainer: with a comment line straight after a multi-line `%%{`, v12 keeps the text, but core's preprocess still reads a directive (D67). The class lexer suite excludes that injection case.
- Lexing is ~1 µs/char on token-dense lines (linear); size/speed work is for milestone close.

## #154 (T2) shared source view (D114) — done

- 2026-11-04, #154: switched after #186 fixed core's `sourceView`. diagram-class reads it through `src/parser/v12-text.ts` (CRLF, trimStart and entity placeholders on top); `source.ts` is deleted and the lexer gate is 100%.

## #153 (T1) stress spec under load — fixed in #154

- Now timed like core's preprocess spec (fastest of 5, up to 5 ratios, 2 s cutoff); it still fails with the direction memo removed.

- `packages/conformance/src/class/lexer-stress.spec.ts` (2 cases) failed, along with core's `preprocess/stress.spec.ts`, in one full run at load ~30 on 16 cores (2026-11-04, after merging #165). Both pass alone. Watch it; if it flakes again at normal load, give it more trials or a wider ratio.

## #154 (T2) → later tickets

- Front matter with invalid YAML: v12 rejects the diagram, v13 (core preprocess) accepts it. Found by mutation fuzzing; no corpus source has it. Not class-specific (core, every type).
- v12 rejects `classDiagram` with no statement (its grammar needs one); v13 does too, for parity. A UX question for the maintainer, not a gap.

## From the #154 review → #156 (T4), #158 (interactions), #157 (T5)

- Sanitising: the oracle stubs DOMPurify, so parity can't see that real v12 ran `sanitizeText` on class ids, labels and member text (e.g. it likely strips `<T>` in `A : +List<T> items`). v13 escapes text in `SvgWriter` instead. #156 checks what flowchart did about this and lists the difference in MIGRATION.md. If it changes what a user sees beyond flowchart's precedent, it is a question for the maintainer.
- Link target: under `securityLevel: 'sandbox'`, v12 forces `linkTarget` to `_top`. The model's `linkTarget` says "`_blank` when none given"; #158 must apply the sandbox rule, as for flowchart.
- Not compared by parity: class `text`, `shape`, `domId` (render-side; #156).

## #185 (core sourceView fix)

- Done: #186 merged into `mermaid-v13` (`3f1fce34a`) and here; class switched in #154. Was: after it merges, merge `mermaid-v13` here and switch diagram-class to `sourceView` (ready port: `d114-v12-text.ts.txt`), keeping class's `trimStart` and entity steps; delete `src/parser/source.ts`.
- Not class: the flowchart parity harness never decodes v12's `#y;` placeholder in edge text (`flowchart LR\nA -- x:#y; --> B`); jison splits EDGE_TEXT per character and the harness decodes before merging tokens. No corpus string hits it.

## #159 (T6) accepted

- First-paint colours via #190 (D119, accepted): the CodeMirror and Monaco adapters colour first paint with flowchart's grammar for every type. Per-type highlighter selection is cross-type ticket #190, after the M3 facets land. #159 does not change the adapters.

## #155 (T3) layout

- #152's reserved end-label room (a fan's gap taller than needed): judged acceptable, not tuned (core change). Three labelled ends on one side: ~120 px gap instead of ~84.
- Decided, D125 (draft PR #195), for #157 (T5): set the documented defaults `class.padding` 12 and `class.diagramPadding` 8; keep the namespace fallback at 16; add a MIGRATION.md note that the documented numbers changed from 5 and 20, citing D125.
- For #157 (T5): if `class.layout` carries v12's `elk` default, default it to the layered layout, as state does under D127 (R-LAYOUT-7).
- #156 (T4): end markers must stay within 12 px across; multiplicities are kept clear of them only by the engine's `endLabelAcross` offset.

## #156 (T4) renderer

- Done (`feature/156_class-render`): the #154-review sanitising item (within flowchart's precedent: text is escaped, `+List<T> items` shows as written; MIGRATION "Class diagram SVG structure") and the #155 marker item (every marker ≤ 12 px across, outline included; asserted in `class-behaviour.spec.ts`).
- Done in the #156 review round: the `-margin` marker variants are theme geometry (`classMarkerStrokeWidth`, `classFilledMarkerStrokeWidth`, `extensionMarkerLength`, `extensionMarkerGap`, `compositionMarkerGap`, `dependencyMarkerGap`; redux = v12 neo, classic = v12 classic), all within 12 px across; multiplicities are measured and drawn at `classTerminalFontSize` (11 in every theme); `classText` is honoured (redux `textColor`, classic `primaryTextColor`); one `data-id` per relationship.
- Dropped in the review round: `classEdgeLabelBackground`. v12's `.edgeLabel[data-look="neo"]` rule never matched (v12 sets `data-look` on the edge path only), so class labels sat on `mainBkg` in both families; no variable, and the 0.5-opacity rect (SVG-label mode only) is moot.
- For the maintainer (core writer): a one-plain-run label with `left: true` is drawn centred by the writer's fast path. Fixing it in core changes two flowchart SVGs (`flowchart/nightly-check/v2/03-should-render-raw-strings.mmd`, `04-…-htmllabels-false.mmd`: the one-item bullet list `- x`), so it was not changed; the class renderer writes start-anchored rows itself.
- Variables' `usedBy` lists `class` only for the new ones; the shared ones the renderer reads still list `flowchart`/`core` (cosmetic, #157 may update).
- Core, not class: core's `layoutLabel` sets bold/italic on runs but not `Style.Underline`, so the renderer writes `text-decoration` for static members itself. And the writer writes LF/CR/tab in attribute values raw, so XML readers see `data-ast` of a class named across lines (`` `A\nB` ``) with spaces; the round-trip spec compares in that form.
- #157 (T5): drop the `vi.mock` of `registry.gen.ts` in `class-render.spec.ts` and `class-behaviour.spec.ts` (and `class/test-registry.ts`) once the manifest row loads `classDiagram` from `@mermaid-js/diagram-class` (plugin id `class`, formats `['svg']`, no `configDefaults` yet). `THIRD_PARTY_NOTICES` is in place for when the package goes public (`src/render/route.ts` is Pele's `routePath`, copied from flowchart since packages cannot import each other).
- #158: `ClassNode.haveCallback` / `model.callbacks` draw nothing; the sandbox `linkTarget` rule is not applied (renderer passes `linkTarget` through `checkLinkTarget`).

## #159 (T6) language facet → later tickets

- #157 (T5): with the manifest, add `"language": "./dist/language.js"` to diagram-class's `mermaid` key, add `@mermaid-js/diagram-class` to language-service's `peerDependencies`, run `gen:registry`, then delete the classDiagram row of `packages/language-service/src/testing/unlisted-facets.ts` (goldens.spec fails until it is gone). The flowchart golden `completions/empty.out` already offers `classDiagram`.
- R-LANG-4 budget: a 50k-character class document cycles in ~26 ms (update, rename and completions are each one ~7.5 ms parse) against flowchart's ~17.5 ms on the same loaded machine (load ~13); 15 ms is the reference-runner budget (D156). Parse speed is milestone-close work.
- Rename: a dotted namespace (`namespace A.B`), and any namespace that is a prefix of one, has no definition, references or rename (renaming it would change the namespace tree); a nested namespace has none either (its qualified id is not its text). Hover still works for both.

## #157 (T5) integration — done

- Done: package public (`13.0.0-alpha.0`, README, notices); manifest with `language`; `gen:registry`; the #156 `vi.mock`s and `class/test-registry.ts` deleted; the classDiagram row of `unlisted-facets.ts` deleted (the file stays, empty, for the next port); D125 defaults and MIGRATION note; D127 checked (v12's `class` section had no `layout` default, so the top-level `layered` applies; spec asserts an installed ELK is not used unless asked).
- Not done, for the maintainer: the brief said "add it to the changeset `fixed` group", but RELEASING.md says `fixed` is empty on purpose and `release-config.spec.ts` enforces it. Followed RELEASING (as state #148 did): own changeset, exact `workspace:*` ranges.
- D125 detail: the generated `classConfigDefaults` has `padding: 12`, but the plugin's `configDefaults` leaves `padding` out, so "unset" still reaches the layout and namespaces (16) and notes (6) draw as v12. With it in, every namespace and note would be padded 12.
- Cosmetic, not done: theme `usedBy` lists for the shared variables the class renderer reads (shared file other ports also edit).
- Not done: class baselines are not in the dev theme gallery (`packages/dev/src/fixtures.ts` reads flowchart's only; state deferred the same to ER's `galleryFixtures`).
