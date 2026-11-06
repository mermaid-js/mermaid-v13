# Run 295 — pointer notes (M4 icons plugin, `@mermaid-js/plugin-icons`)

Spec: mermaid-js/mermaid-v13#295. Decisions: D290–D299 in `v13/docs/DECISIONS.md` (merged in from `docs/m4-specs`, PR #284). Tickets: T0 #314, T0b #316, I1 #320, I2 #322, I3 #324, I4 #326, I5 #328, I6 #330.

Model run: `../215/` (M3.5 feature plugins). Its `03-v13-core.md` maps the seams icons reuse (label layout, `SvgWriter.label()`, allow-list and determinism tests, extension contract and resources, warnings, text output, size job); `tickets/237.md` (inline boxes), `245.md` (plugin-math packaging, resources, `NotLoadedError`), `246.md` (every type passes `ctx.inline`, `labels()`). Line numbers there predate #255's merge: re-grep.

## Where to start

| Area | Pointer |
| --- | --- |
| Inline providers, `FEATURES` | `packages/core/src/text/inline.ts` |
| Extension contract, resources | `packages/core/src/pipeline/extensions.ts`, `pipeline/types.ts` |
| Model plugin | `packages/plugin-math/{package.json,src/index.ts}` |
| `registerIconPacks` stub, `preload`, `ICON_PACKS_UNSUPPORTED` | `packages/mermaid/src/api.ts` (grep `iconPacks`) |
| Flowchart icon shapes, `ICON_UNAVAILABLE` (D186) | `packages/diagram-flowchart/src/render/assets.ts` |
| Static e2e packs (`fa`, `aws`, `fluent-emoji`, `material-icon-theme`) | `e2e/platform/viewer.js` (grep `registerIconPacks`) |
| v12 sources | `git show fa796a943:packages/mermaid/src/rendering-util/icons.ts`, `…/createText.ts` (+ `.spec.ts`), `…/rendering-elements/shapes/icon*.ts`, `…/diagrams/globalStyles.ts`, `…/diagrams/flowchart/styles.ts:282-295`, `…/diagrams/mindmap/svgDraw.ts`, `packages/mermaid/src/docs/config/icons.md` |

## Corpus (from the spec)

54 flowchart files use `fa:`/`fab:` in labels (138 uses). 4 flowchart files use icon shapes. 5 mindmap files use `::icon()`. No class, state, ER or sequence fixture has one: I3 adds them.
