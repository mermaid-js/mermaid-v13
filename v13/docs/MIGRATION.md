# Migrating from Mermaid v12 to v13

<!-- BEGIN GENERATED CONFIG SECTION: pnpm gen:config -->

## Config

Generated from the `x-mermaid` annotations in `packages/core/schema/config.schema.yaml`. The full list is in [config-reference.md](./config-reference.md).

### Removed, moved and ignored keys

| Key | Status | Reason | Replacement |
| --- | --- | --- | --- |
| `themeCSS` | ignored | v13 output carries no author stylesheet (R-SEC-2). | `themeVariables`, or `--mermaid-*` CSS variables set by the host page |
| `htmlLabels` | removed | Labels are SVG text only; there is no HTML label mode (D5). | none; labels support a markdown subset rendered as SVG text |
| `altFontFamily` | ignored | Unused by every renderer, also in v12. |  |
| `logLevel` | ignored | v13 does not log; problems are returned in `RenderResult.warnings`. |  |
| `arrowMarkerAbsolute` | ignored | Arrowheads are inline paths, not `<marker>` references. |  |
| `flowchart.arrowMarkerAbsolute` | ignored | Arrowheads are inline paths, not `<marker>` references. |  |
| `flowchart.htmlLabels` | removed | Labels are SVG text only; there is no HTML label mode (D5). | none; labels support a markdown subset rendered as SVG text |
| `sequence.arrowMarkerAbsolute` | ignored | Arrowheads are inline paths, not `<marker>` references. |  |
| `class.arrowMarkerAbsolute` | ignored | Arrowheads are inline paths, not `<marker>` references. |  |
| `class.htmlLabels` | removed | Labels are SVG text only; there is no HTML label mode (D5). | none; labels support a markdown subset rendered as SVG text |
| `state.arrowMarkerAbsolute` | ignored | Arrowheads are inline paths, not `<marker>` references. |  |
| `gitGraph.arrowMarkerAbsolute` | ignored | Arrowheads are inline paths, not `<marker>` references. |  |
| `dompurifyConfig` | removed | v13 has no HTML sanitizer: output is safe by construction (R-SEC-1). | none |

### Changed defaults

| Key | v13 default | Reason |
| --- | --- | --- |
| `theme` | `"redux"` | The default changes from `default` to `redux` (D55). 13.0 ships `redux`, `default`, `dark`, `forest`, `neutral` and `base`; the other v12 names stand in for one of them with a warning, except `redux-color` (the flowchart default), which renders `redux`. |
| `layout` | `"layered"` | The default changes from `elk` to `layered`, the built-in engine (DESIGN §6.1). The v12 values `dagre` and `elk` stay valid and map to `layered` until an ELK plugin exists (R-PLUG-8). |

<!-- END GENERATED CONFIG SECTION -->
