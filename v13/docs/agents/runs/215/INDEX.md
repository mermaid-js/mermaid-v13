# Run 215 — pointer notes (M3.5 optional feature plugins: ELK, math)

Spec: mermaid-js/mermaid-v13#215. Decisions: #216 (D170–D179). Tickets #237–#247.

| Note | What it points at |
| --- | --- |
| [01-v12-elk.md](01-v12-elk.md) | v12 develop ELK adapter (`layout-algorithms/elk/*`, presets, passes, per-container `@{ algorithm }`), its unit specs, `@mermaid-js/layout-elk`, elkjs 0.12.0 pin, bundled dispatcher internals (FakeWorker and its timers), v12 `elk` config keys, lineHops. |
| [02-v12-math.md](02-v12-math.md) | v12 KaTeX path (`common.ts` regex/render/legacy flags) and its flowchart/class/sequence call sites; math corpus; v13 `SEQUENCE_MATH`; `legacyMathML` status. |
| [03-v13-core.md](03-v13-core.md) | v13 seams: label layout and `SvgWriter.label()`, allow-list/determinism tests, extension contract and resources, layout types and registry, config validator/`gen:config`, warnings and text output, DDLT helpers, size job. |
| [04-corpus.md](04-corpus.md) | The 79 ELK-selecting corpus files by type, coverage holes, and how mmd-snapshot baselines are made. |
| [GAPS.md](GAPS.md), [IMPLEMENTER.md](IMPLEMENTER.md), `tickets/` | Written by the spec run (not these notes). |

## Things the notes found that the tickets should know

- v12 develop registers **7** ELK layout names (`elk` + 6), not 9: `elk.layered` and `elk.radial` exist only as container ids (01).
- v12 develop's default `layout` is **`elk`** (01); v13's is `layered` (D127), so a develop diagram that names no layout changes look in v13, plugin or not (not checked against the released 12.2.0 default).
- **elkjs 0.12.0 is not installed anywhere**; only 0.9.3 (via the `mermaid@12.2.0` oracle). Dispatcher line numbers in 01 are from 0.9.3 (01).
- The bundled build has two `setTimeout`s on the layout path (FakeWorker post, PromisedWorker receive) plus `register` being async; `worker.dispatcher.saveDispatch` is public and skips both (01).
- `api.ts` calls the engine without a `LayoutContext`, and `LayoutGraph` has no config or node metadata: no path for `elk.*` keys or `@{ algorithm }` yet (03).
- `loadResources` loads only layout/theme/diagram; a `math` resource would never load. Extensions have no `resources` hook (03).
- Label layout has one fixed line height and runs inside one `<text>`; `SvgNode` is an index into a writer tree, so `{ kind: 'box', node: SvgNode }` cannot be built at label-layout time as written (03).
- The measurer has no x-height, so MathJax `ex` → px needs a new metric or a fixed ratio (03).
- Text output uses the same layout name as SVG and throws `NotLoadedError` for an unloaded engine (03, D179).
- Only one corpus file sets an `elk.*` key and one uses `@{ algorithm }`; no `flowchart-elk` fixture (04).

## Frontier (no blockers)

- **T0 #237** core inline-box label runs — start at 03 "Label layout" and "`SvgWriter.label()`".
- **T0b #238** config fragments + `layout` manifest kind — 03 "Config validator" and "Extension contract".
- **E1 #239** ELK sync prototype — 01 "`elk.bundled.js` dispatch" and "elkjs version".
- **M1 #244** MathJax → SVG prototype — 02 "Math corpus", 03 allow-list and measurer.
