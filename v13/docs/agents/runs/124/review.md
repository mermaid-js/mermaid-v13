# Final whole-branch review: spec #124 (ER)

Reviewed `feature/134_er-integration` (all of T1–T7) against merge-base f9fafcd93. Each finding is fixed test-first: a spec that fails on the reviewed head, then the fix.

1. **Self-relationship loops are shorter than the ER end markers** (medium-high). `layout/prepare.ts:534` passes `units.engine` unchanged, and the px `loop` is 26. `render/edges.ts:20-23` draws the zero circles 21 and 28/30 px out (r 6). For `erDiagram\nA }o--o{ A : self` in `default`, the circles straddle the loop corners and overlap the loop label. Fix: give ER graphs a loop at least as long as the outermost end mark plus clearance, and reserve label room past it. Take the length from a profile/builder metric (like `headRoom`, D154), never a literal.
2. **Crow's-foot ends are wider than the port pitch** (medium). `render/edges.ts:13` uses `HALF = 9`, so ends are 18 px wide, against PX_ENGINE `portPitch 16, minPitch 8`. With `A }o--o{ B/C/D`, neighbouring feet overlap. With seven `A ||--o{ X`, the pitch drops to 12.67 and adjacent `||` bars merge. Fix: in px, give ER a port pitch of at least the end span plus a gap, from a metric; or shrink the end when ports are closer.
3. **Completions insert names that need quotes without them** (medium). `facet/completions.ts:143-151` inserts the bare symbol name. With `erDiagram\n"my entity" ||--|| B : x\nC ||--|| |`, accepting the completion gives `my entity`, which parses as two entities. Fix: quote the insertText when the name would not read back unquoted; `entityReason` in `language.ts` has that test. Same for subgraph names.
4. **No changesets** (low-medium, CLAUDE.md). Add `feat:` changesets for the first release of `@mermaid-js/diagram-er` (follow `language-server-first-release.md`), for `mermaid` rendering `erDiagram` (svg + ascii), for `@mermaid-js/core` (`lightenHsl`/`darkenHsl`, the new ER theme variables, the cardinality glyphs), and for `language-service` loading the ER facet.
5. **The edge `data-id` is not v12's edge id** (low). `render/render.ts:271-273` builds `id_<from.name>_<to.name>_<i>` and calls it v12's. v12 used entity ids (`id_entity-CUSTOMER-0_entity-ORDER-1_0`). Fix: correct the comment and the MIGRATION "ER SVG structure" row to say v13 uses names, and give an example of each.

Also in this pass: **ER `ascii.maxWidth` fitting** (D84: tighten, then switch LR to TB), as flowchart does. It was listed as open in GAPS under #136.

## Fixed

Each spec failed on 555507429 and passes after its commit.

| Finding | Commit | Test |
| --- | --- | --- |
| 1. Self-loops shorter than the end marks | 119efdacc | `conformance/src/er-ends.spec.ts` "ER self-relationships" (8 cases, default and redux) |
| 2. Ends wider than the port pitch | 119efdacc | `er-ends.spec.ts` "ER ends along one side of an entity" (3 and 7 ends, TB and LR) |
| 3. Completions without quotes | fb54ed8f6 | `language-service/src/completion-hover.spec.ts` "ER completion of names that need quotes" |
| 4. No changesets | 24468c63c | `tools/release/src/release-config.spec.ts` "gives every public package that has not been released a pending feat: changeset" |
| 5. Edge `data-id` called v12's | 386d1cbea | `conformance/src/er-render.spec.ts` "ids a relationship by its entities' names" (reads the MIGRATION row) |
| `ascii.maxWidth` | 389d5b1d2 | `er-goldens.spec.ts` `er-v13/max_width`, `max_width_tighten`; `ascii/er-api.spec.ts` |
| D124 citations | 8b668d93b | `layout.spec.ts` pins the exact-default corner case |

- 1 and 2: `layout/ends.ts` holds the px end geometry, which the renderer draws from. `erMetrics` gives px graphs `loop` = 36 (the classic zero-or-more circle's far side; D154 keeps it theme-independent) + `loopGap` = 42, and `portPitch` = 18 (span) + `minPitch` = 26. Where a side is too short anyway (seven ends on a 48 px LR side are about 4 px apart), `fitEnds` draws ends narrower so neighbours keep apart; there they are only about 3 px wide. Growing the entity to hold its ends would draw them full size but changes box sizes; left for the maintainer. Text output unchanged.
- SVG changed for 58 of the 215 ER corpus files (every one with a self-loop or with two or more ends on one side); no ASCII golden changed, structural check and `ascii-divergences.json` green.
- maxWidth needed no renderer change: the pipeline already hands ER's layout `availableWidth`. The gap was coverage, and the ER goldens runner ignored `maxWidth` in meta.json.
