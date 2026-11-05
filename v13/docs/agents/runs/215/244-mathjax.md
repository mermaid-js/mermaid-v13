# M1 #244 — MathJax TeX → SVG paths: result

**Verdict: it works. No stop rule tripped.** MathJax 4.1.3 (TeX input, SVG output, `fontCache: 'none'`, lite adaptor, no DOM) typesets every corpus formula synchronously, and the engine flattens its output into a detached fragment of plain `<path>` elements that passes the R-SEC-2 allow-list. The bytes are the same in Node, Chromium and Firefox and across runs. Drawn in Chromium, the flattened output matches MathJax's own SVG pixel for pixel, except for 3 pixels on `\phase`. One thing for the maintainer: **the engine is 677 KB gz** (see Size).

Code: `packages/plugin-math/src/engine.ts` (`typeset`), spec `src/engine.spec.ts`, corpus `scripts/corpus.ts`, evidence `scripts/spike-evidence.ts` (+ `spike-browser-entry.ts`). The package is `private` with `exports["./engine"]` only. There is no plugin wiring; that is M2 #245. Core change: `@mermaid-js/core/svg` now exports `pathBuilder` (one line, additive), so a plugin can build `PathData` without a writer.

## How it works

- **Setup, once per module:** MathJax with the TeX packages `base ams boldsymbol cancel color enclose`, plus a `mermaid-katex` macro map for the names v12's KaTeX has and MathJax lacks: KaTeX's texvc block (`\Alpha`, `\Reals`, `\empty`, `\isin`, `\N`, `\cnums`, …), `\notni`, `\relax`, and `\phase` → `\enclose{phasorangle}`. Display mode, `displayOverflow: overflow`, no inline breaks. `formatError` throws, matching v12's `throwOnError`. `newcommand` is left out because MathJax keeps `\def`/`\newcommand` across formulas, so one label would change another (R-ARCH-6). `tex.reset()` runs before each formula for `\label`/tags.
- **Flattening:** the engine walks the lite tree, composes `translate`/`scale`/`matrix` into one affine map, and writes every coordinate in px (top-left origin, y down) through `pathBuilder()`. Glyph and rule paths keep their curves. `<rect>` becomes a polygon. Stroked shapes (`\cancel`, `\boxed`, `\phase`, `\enclose{circle}`) become filled outlines: quads per segment, round caps and joins, and an ellipse ring for circles. So a box only ever inherits the label's fill, and no `stroke` reaches the output. A nested `<svg>` is how MathJax clips stretched extender glyphs (`\xrightarrow`, `\overbrace`, tall delimiters). It becomes a clip rectangle, and paths that cross it are flattened (16 steps per curve) and cut with Sutherland–Hodgman. `\color` becomes a `fill` checked by core's `checkColor`.
- **Refused with `MathError`:** any attribute outside a fixed list (`data-*` is dropped), any `style` other than `stroke-width`, `<use>`, `<defs>`, `<image>`, `<a>`, `<foreignObject>`, nested `<svg>` with scaling or `preserveAspectRatio` (MathJax's `\tag` tables), arcs under uneven scale, curved strokes. `\href`, `\style`, `\class`, `\unicode`, `\def` and `\newcommand` are not loaded, so they are undefined control sequences.
- **Output:** core's `InlineBox` (#237): `{ width, height, baseline, node: { tag: 'g', children } }` in px, with `node` as an `SvgFragment`.

## ex → px, and whether 0.5 × font.size is good enough

MathJax sizes its SVG in ex of the surrounding text, where one ex is the TeX font's x-height (0.442 em). So px = units × ex / 442, and the math em is `ex / 0.442`. With T0's `ex = 0.5 × font.size`, the math em is **1.131 × font size**. For comparison:

| Source | Math em / label font size |
| --- | --- |
| v12 KaTeX (`.katex { font-size: 1.21em }`) | 1.21 |
| MathJax in a browser, Trebuchet MS (Mermaid's default; x-height 0.523, measured in Chromium) | 1.183 |
| T0's `ex = 0.5 × size` | 1.131 |
| MathJax in a browser, Courier New (the katex fixtures; x-height 0.423) | 0.957 |

**0.5 is good enough. No real x-height metric is needed.** Outside the browser the measurer tables have no x-height, so a real metric would make math size depend on the measurer, against R-ARCH-6. A fixed ratio keeps math a fixed size relative to the label, as KaTeX did. If M2 wants v12's size, the provider can pass `ex = 0.535 × font.size` (1.21 × 0.442) itself, since it gets `font`. That needs no core change. `typeset` takes `ex` (and `em`, the size of characters the font lacks) from the request as given.

## Checks

| Check | Node 24.19 | Chromium 151 | Firefox 153 |
| --- | --- | --- | --- |
| 16 katex spans (`e2e/diagrams/katex/**`, v12 regex) + 5 sequence strings typeset | yes | yes | yes |
| Only `<g>` + `<path d>` for the corpus; R-SEC-2 `assertInert` through stream and tree writers (corpus + 12 extra constructs) | yes | — | — |
| Same bytes twice, in reverse order, from a fresh module instance | yes | — | — |
| Same bytes as Node, 33/33 formulas | — | yes | yes |
| Pixel match with MathJax's own SVG at 4× (alpha differs by > 50%) | — | 32/33 at 0 px; `\phase` 3 of 3,097 ink px (round vs miter join) | — |

WebKit could not be launched on this machine (Playwright `launch` timed out, as in #239). It is not covered.

**Fit with T0 (#237)** (`src/fit.spec.ts`, after #237 merged into the integration branch). A provider `box: (tex, req) => typeset(tex, { ex: req.ex, em: req.font.size })`, registered with `registerExternalDiagrams([{ id: 'math', inline: [provider] }])`, renders all four katex fixtures through `createMermaid().render()`. The results are inert, byte-identical over two fresh APIs, show no `$$`, and raise no `MATH_NOT_RENDERED`. TeX that does not parse is declined and shown as written. Screenshots (Chromium) look right: Fourier integral, nested fractions, cases, bmatrix, overbrace, phasor. Sequence still shows the TeX with `SEQUENCE_MATH` (M3 wires it). One T0-side observation: in `4-…consecutive…` ("From $$x(t)$$ to $$y(t)$$") with `fontFamily: courier` and `deterministic: true`, the text after the first box overlaps the second box. The table width for courier is narrower than Chromium's Courier, and a boxed line is placed from measured widths. The math box itself is placed correctly.

## Size

esbuild `--minify` ESM of `engine.ts`, gzip -9:

| Bundle | min | gz |
| --- | --- | --- |
| As published (MathJax's `#default-font/*` import pulls in New Computer Modern too) | 2,809,932 | **1,034,233** |
| `#default-font/*` → `@mathjax/mathjax-tex-font` (MathJax's own builds alias it) | 1,834,162 | **677,592** |
| (for comparison) MathJax 3.2.2 `mathjax-full`, same packages, its TeX font | 1,653,557 | 570,683 |

In the aliased bundle the TeX font is 1,416 KB min (77%; `svg/normal.js` alone is 870 KB), MathJax 403 KB, core 2.5 KB. It loads lazily, only for diagrams with math (D178). That makes it bigger than ELK (437 KB gz), so it is the maintainer's call before M2 (see the ticket notes). Load in Node: import 256 ms, first formula 7 ms.

## Time per formula

Median of 5 `typeset` calls after one warm-up, at ex = 8 px. Firefox's `performance.now()` has 1 ms resolution. The machine was running other agents, so treat the times as upper bounds. Corpus (21): Node 16.8 ms total, max 2.6 ms. Chromium 12.5 ms, max 1.5 ms. Firefox 17 ms, max 4 ms.

| # | TeX | Node ms | Chromium ms | Firefox ms | px off / ink px |
|---|---|---|---|---|---|
| 1 | `f(\relax{x}) = \int_{-\infty}^\infty \hat{f}(\xi)\,e^{2 \pi …` | 2.59 | 1.5 | 4 | 0 / 10664 |
| 2 | `\Bigg(\bigg(\Big(\big((\frac{-b\pm\sqrt{b^2-4ac}}{2a})\big)\…` | 1.47 | 1.3 | 2 | 0 / 20640 |
| 3 | `1+\frac{e^{-2\pi}} {1+\frac{e^{-4\pi}} {1+\frac{e^{-6\pi}} {…` | 1.7 | 1.3 | 2 | 0 / 9820 |
| 4 | `\overbrace{a+b+c}^{\text{note}}` | 0.899 | 0.6 | 1 | 0 / 5973 |
| 5 | `\phase{-78^\circ}` | 0.352 | 0.3 | 0 | 3 / 3097 |
| 6 | `x = \begin{cases} a &\text{if } b \\ c &\text{if } d \end{ca…` | 1.021 | 0.8 | 1 | 0 / 6505 |
| 7 | `x(t)=c_1\begin{bmatrix}-\cos{t}+\sin{t}\\ 2\cos{t} \end{bmat…` | 2.14 | 1.2 | 2 | 0 / 12908 |
| 8 | `\alpha\beta\gamma…\omega` | 0.933 | 0.8 | 1 | 0 / 13819 |
| 9 | `\Alpha\Beta\Gamma…\Omega` | 1.32 | 1.1 | 1 | 0 / 23532 |
| 10 | `\forall\complement\therefore\emptyset…\lnot` | 1.497 | 1.3 | 1 | 0 / 15196 |
| 11 | `\nabla\Im\Reals\jmath…\reals` | 1.446 | 1.3 | 2 | 0 / 23984 |
| 12–16 | `x(t)`, `\tilde{x}(t)`, `x(t)`, `y(t)`, `\tilde{x}(t)` | 0.17–0.28 | 0.1–0.2 | 0 | 0 |
| 17–21 | sequence: `x^2`, `\alpha`, `x`, `y`, `z` | 0.06–0.12 | 0–0.1 | 0 | 0 |
| 22 | `\cancel{x}` | 0.115 | 0.1 | 0 | 0 / 1028 |
| 23 | `\boxed{a+b}` | 0.254 | 0.2 | 0 | 0 / 4371 |
| 24 | `\sqrt[3]{x^2+1}` | 0.399 | 0.3 | 0 | 0 / 3697 |
| 25 | `\xrightarrow{abcdefgh}` | 0.638 | 0.5 | 1 | 0 / 3793 |
| 26 | `\overbrace{a+b+c}^{n}` | 0.511 | 0.3 | 1 | 0 / 5371 |
| 27 | `\underbrace{x+y}_{2}` | 0.464 | 0.3 | 1 | 0 / 3556 |
| 28 | `\widehat{abc}` | 0.287 | 0.2 | 0 | 0 / 2114 |
| 29 | `\left(\frac{\frac{a}{b}}{…}\right)` | 0.812 | 0.5 | 1 | 0 / 7600 |
| 30 | `\left\{\begin{matrix}1\\…\\6\end{matrix}\right.` | 0.823 | 0.5 | 1 | 0 / 9582 |
| 31 | `\enclose{circle}{x}` | 0.116 | 0.1 | 0 | 0 / 1928 |
| 32 | `{\color{red}x}+y` | 0.244 | 0.2 | 1 | 0 / 1622 |
| 33 | `\mathbb{R}\mathcal{L}\mathfrak{g}\boldsymbol{\alpha}` | 0.268 | 0.2 | 0 | 0 / 3501 |

## Findings for M2

1. **Size.** Bundle with the `#default-font` alias, or consumers also get New Computer Modern (+357 KB gz). The font is most of the rest. Options: accept it (lazy, D178); split font variants into lazily loaded chunks that `prepare()` fetches; or MathJax 3 (−107 KB gz, but `mathjax-full` is deprecated in favour of `@mathjax/src`).
2. **Characters the TeX font lacks** (`\text{日本}`, emoji) come out as `<text x y font-size>`, which is allow-listed but not a path. Their width is the lite adaptor's guess (1 em per CJK character, 0.6 em otherwise). M2 can measure them with the request's measurer (subclass the adaptor's `nodeSize`) or refuse them.
3. **Lost v12 KaTeX features:** `\def`/`\newcommand` (state across formulas; MathJax's `begingroup` sandbox might make them local, not tried), `\href`, `\htmlClass`-style macros, `\tag`. `\color` is a switch (as in LaTeX and KaTeX): `{\color{red}x}`.
4. **Errors:** `typeset` throws `MathError` with MathJax's message (`Undefined control sequence \foo`, `Missing argument …`). M2 decides between drawing the span as written with a warning and v12's error image.
5. **Output weight:** paths are verbose. The complex katex fixture's SVG is 104 KB.
6. **Licence:** `@mathjax/src` and `@mathjax/mathjax-tex-font` are Apache-2.0. Publishing needs `THIRD_PARTY_ALLOWED` entries in `tools/check-deps` and a NOTICE in the package. `@mathjax/src` also depends on `speech-rule-engine`, `mj-context-menu` and `mhchemparser`. They are installed but never imported by the engine.
