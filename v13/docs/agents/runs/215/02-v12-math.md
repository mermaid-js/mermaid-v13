# 02 — v12 math (develop) and where v13 stands

## v12: `develop:packages/mermaid/src/diagrams/common/common.ts` (393 lines)

- `:291-293` `isMathMLSupported()` = `window.MathMLElement !== undefined` (browser-only).
- `:295` **`katexRegex = /\$\$(.*?)\$\$/g`** — lazy, single line (no `s` flag), no escape for a literal `$$`.
- `:303` `hasKatex(text)` — any match of that regex.
- `:312` `calculateMathMLDimensions` — renders into a hidden `<div>` in `document.body` and reads `clientWidth/Height` (DOM measuring; v13 cannot do this).
- `:326` `renderKatexUnsanitized` — no math → text unchanged; no MathML and neither legacy flag → replaces each span with "MathML is unsupported in this environment." (`:331-332`).
- `:335-358` large builds: `await import('katex')`; `output` = `htmlAndMathml` if `forceLegacyMathML`, or `legacyMathML` without native MathML, else `mathml` (`:337-340`). Splits on `<br>` (`:342`), wraps each line in a flex `<div>` (`:343-347`), `katex.renderToString(c, {throwOnError:true, displayMode:true, output})` (`:349-356`), strips `<annotation>`.
- `:361-364` tiny build: span → "Katex is not supported in @mermaid-js/tiny…".
- `:374` `renderKatexSanitized` = DOMPurify `sanitizeText` over that HTML.
- Semantics to keep: always **display mode**; one regex for every type; throw on bad TeX (v12 then shows the error in the label path).

## v12 call sites

- Flowchart (and every type on `createText`): `rendering-util/createText.ts:34` `addHtmlSpan` — `:51-52` `hasKatex(label) ? renderKatexSanitized(label.replace(<br>→\n))` into a `foreignObject` span; `:349-351` passes the raw text (with `\\` → `\` unescaping, `:347`) when it has math. So math needs HTML labels in v12.
- Class: `diagrams/class/shapeUtil.ts:124` — `hasKatex` forces `useHtmlLabels = true`.
- Flowchart CSS: `diagrams/flowchart/styles.ts:175` `.node .katex path { … }`.
- Sequence (own renderer, not `createText`):
  - `sequence/svgDraw.js:150` `drawKatex` (`:152` renderKatexSanitized); `:1919` `byKatex` — `<switch><foreignObject>` sized by `calculateMathMLDimensions` (`:1922`) + `byTspan` fallback.
  - `:485, :612, :751, :871, :973, :1102, :1215, :1347` actor shapes pick the KaTeX text drawer via `_drawTextCandidateFunc(conf, hasKatex(actor.description))` (`:1955`).
  - `:1584, :1601` loop/fragment labels.
  - `sequence/sequenceRenderer.ts:271` notes, `:411-413` message size, `:486-487` message draw, `:1516-1517` wrapped message size, `:1629-1630` actor size, `:1708-1709` message dims.
- State and ER have no KaTeX call of their own on develop (they go through `createText` when HTML labels are on).

## Math corpus

### `e2e/diagrams/katex/**` (this worktree)

Folder maps to `flowchart-v2` (`packages/dev/src/fixture-discovery.ts:42`), so these already run as flowchart snapshots.

| File (`pr-check/`) | Lines with `$$` | Note |
| --- | --- | --- |
| `1-should-render-a-complex-katex-flowchart-no-htmllabels.mmd` | 4 | Fourier integral, nested quadratic formula, node + edge labels; config only `fontFamily: courier` despite the name |
| `2-should-render-a-katex-flowchart-containing-the-greek-alphabet.mmd` | 1 | Greek letters, 2 nodes |
| `3-should-render-a-katex-flowchart-containing-set-theory-symbols.mmd` | 1 | set theory / logic symbols |
| `4-should-render-consecutive-latex-equations-separated-by-text.mmd` | 3 | "From $$x(t)$$ to $$y(t)$$" — two spans in one label |

`nightly-check/` and `visual-check/` hold only `.gitkeep`. All four are `graph LR/TD` with `fontFamily: courier`.

### Sequence `$$` strings (`packages/diagram-sequence`)

- `src/parser/parse.spec.ts:264-265` — `A->>B: $$x^2$$` → one `SEQUENCE_MATH`, text kept `$$x^2$$`.
- `src/parser/parse.spec.ts:271` — `participant A as $$\alpha$$`, `loop $$x$$`, `else $$y$$`, `box $$z$$` → four warnings (`:273-277`).
- No `.mmd` fixture under `e2e/diagrams/sequence` contains `$$`; no other v13 spec has `$$`.

## `SEQUENCE_MATH` in v13 (D105)

- Detector: `packages/diagram-sequence/src/parser/normalise.ts:236-240` `hasMath` — two `$$` anywhere (not the v12 regex; differs on `$$a` + newline + `b$$`).
- Raised in `src/parser/parser.ts:327-335` `math(text, range)` — message "Math (`$$…$$`) is not rendered yet: the text is shown as written."
- Called from `participantStatement` alias `:291`, `signal` `:383`, `note` `:432`, `open` (fragment label `:672`, box title `:683`), `section` (`else`/`and`/`option` `:724`).
- Docs: `v13/docs/MIGRATION.md:548-549`; ticket note `v13/docs/agents/runs/125/tickets/139.md:21`.
- No other type warns about math today: flowchart/class/state/ER draw `$$…$$` as literal text silently (spec Problem Statement). M3 replaces this with core's `MATH_NOT_RENDERED`; keep `SEQUENCE_MATH` as a deprecated alias for one alpha.

## `legacyMathML` / `forceLegacyMathML` in v13

- Core schema: `packages/core/schema/config.schema.yaml:911` and `:920`, both `x-mermaid: { status: pending }` (`:919`, `:927`). M3 flips them to `ignored` + `reason` (gen-config requires a reason for ignored, `tools/gen-config/src/schema.ts:148-149`).
- Generated: `packages/core/src/config/generated/defaults.ts:26-27` (false), `config.type.ts:299,306`, key tree `generated/keys.ts:42`.
- Docs (generated): `v13/docs/config-reference.md:82-83` (pending); hand-written `v13/docs/MIGRATION.md:507` ("KaTeX math … not rendered in M1 … pending; math comes back as an optional plugin emitting SVG").
- Test touching them: `packages/core/src/config/resolveConfig.spec.ts:430-431`.
