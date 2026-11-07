# Final whole-branch review fixes (#294): handoff

Branch `feature/294_final-review`, from the integration tip 34d851898. Seven findings of the final review, plus a scan for "once ported" / "until T5" / "not yet" leftovers.

## Code
- `diagram-mindmap/src/layout/prepare.ts` `lengthOf`: a string config length is taken only when it is a whole decimal number, spaces around it allowed (`"20"`, `" 20 "`, `"2.5"`, `"1e2"`); `"20px"`, `"10abc"`, `""` and `"0x10"` warn `MINDMAP_CONFIG_IGNORED` and lay out with the default, as the schema, config reference and MIGRATION.md say. Test first, through `createMermaid().render()`: `mermaid/src/mindmap.spec.ts` "reads a whole numeric string as a number, and warns on any other string" (failed on `"20px"` before the fix).
- `render/harness.ts`: the "until the plugin lands (T5)" sentence is gone.

## Config
- `config.schema.yaml` `MindmapDiagramConfig.theme`: `$ref` to the base `theme`, `honoured` with a reason (wins over the top-level `theme` for mindmaps); no per-diagram default, so resolution is unchanged. Test: "honours mindmap.theme, over the top-level theme" (directive `mindmap.theme` = top-level `theme`, and beats a top-level `dark`).
- `plugin-hand-drawn/schema/config.fragment.yaml` `handDrawn`: "flowchart, class, state, ER and mindmap diagrams".
- `gen:config` regenerated `config.type.ts`, `config-schema.gen.ts` and `config-reference.md`.

## Docs
- `icons.md` Mindmap: the D297 slot and forms, the glyph with the plugin (40 px, label colour), as written with one `ICON_NOT_RENDERED` otherwise, the slot empty while a pack loads.
- `plugin-icons/README.md`: mindmap `::icon()` in the opening paragraph.
- `MIGRATION.md` Mindmap "Config": numeric strings are `"20"`, not `"20px"`. Its Icons section and the rest of the Mindmap section had no leftovers.
- `GAPS.md`: #390's hand-drawn "Not done" is closed (#344); #386's `icons(model)` Choice now says only the two D297 forms are listed (#328).
- `tickets/383, 386, 387, 388, 389, 390.md`: forward-looking "T5" / "waits for #328" lines now say the later ticket did it. The `diagram-mindmap` package had no other leftover (`v12-specs`' "Todo" is v12's own text).

## Sizes (R-PERF-8, limit 94,208 B gz)
- Bench `measureCoreSize`: 93,521 → 93,522 B. CDN ESM closure: 93,949 (measured at 34d851898) → 93,952 B (INDEX's 93,953). Core code is untouched (`config.type.ts` is types only): the bytes are the lazy chunks' hashed names in the entry.

## Follow-up (out of scope)
- `timeline.theme`, `pie.theme` and `gitGraph.theme` show `pending` although a diagram-section `theme` is honoured: the same schema mismatch.
- `lengthOf`-style `parseFloat` readers in `diagram-class`, `diagram-er`, `diagram-state` (`layout/prepare.ts`) and `diagram-flowchart` (`render/prepare.ts`) take `"20px"` silently too; check each against its docs.

## Unmet
- None.
