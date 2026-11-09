## Usecase SVG structure

What changed in the usecase diagram's SVG compared with v12 (spec #517). v12's classes and draw
order are kept: `g.clusters` (each `g.usecase-system-boundary.system-boundary-<type>` with its
`rect.boundary-body`, a package's `rect.boundary-tab` and `g.system-boundary-title`), then
`g.edgePaths` (each `g.relationship.relationship-<type>`), `g.edgeLabels` and `g.nodes` (actors
`g.usecase-actor.usecase-actor-<type>` with `g.usecase-actor-glyph`, use cases
`g.usecase-element.usecase-ellipse|usecase-rect`, `usecase-business`, `g.usecase-note`,
`g.usecase-json-table`), with the author's `:::`/`class` names and `edge-animation-fast|slow`.

| v12 | v13 | Why |
| --- | --- | --- |
| Root `id="<render id>"`, a `<style>` scoped by the id holding the role colours, the palette slot rules and the fonts as `--mermaid-usecase-*` custom properties | No root `id`; `class="mermaid mermaid-usecase"`, `role="img"`, `aria-roledescription="usecase"`, `data-mermaid-version`. No `<style>` (except `theme: 'auto'`'s variables-only sheet): fills, strokes, widths and fonts are presentation attributes, colours reading `var(--_x)` aliases on the root `style` | R-SEC-2, R-THEME-3 |
| An unscoped DOM id `usecase-<id>` on each element, an id on each relationship path, `data-usecase-id` and `data-usecase-kind` | No ids but `<prefix>-title` and `<prefix>-desc`. `data-ast` (the AST id: `actor:A`, `usecase:B`, `boundary:S`, `note:1`, `json:P`, `rel:e1` or `rel:A->B`) on each element's and relationship's group, `data-id` (the model id: `A`, `note-0`, `edge-0`, `note-0-edge`) on it and on its parts; the kind is the group's class | D475, R-PARSE-8 |
| `role="img"` and an `aria-label` on each element; on each relationship path `role="img"` and an `aria-label`, `aria-hidden="true"` on a note's connector | The same names and attributes (`business hollow actor Customer, stereotype Human`, `include from Login to Pay`), the element's on its group, a relationship's on its line | D475 |
| Labels in `foreignObject` (HTML), and a stereotype folded into a use case's label as Markdown (`«s»<br/>label`) | SVG text laid out by core ([Labels and text](#labels-and-text)): `<br>`, entities, Markdown, math and icons work. A stereotype is a first `text.usecase-stereotype` line `«s»` above the label, for actors and use cases alike. A plain label's markup is still text, as v12 escaped it (`Hostile("<img …>")` draws the tag's text); only Markdown labels read the HTML subset | D225, R-SEC-2 |
| The front-matter `title` was set, then wiped by `db.clear()` before `insertTitle` ran: never drawn | Drawn above the diagram as `text.usecaseDiagramTitleText` in the root's text colour, centred, the drawing moved down by its height and the diagram padding; it does not name the diagram (`accTitle` does) | D472, D133 |
| `<defs>` with `<marker>` elements (`point`, `circle`, `cross`, `extension`) referenced by `marker-end` | Each marker is a `path.marker` in its relationship's group: v12's classic point, circle, cross and the generalization's hollow triangle (filled `mainBkg`), sized as v12's classic markers in every theme, in the line's colour (an author's `style` stroke included) | DESIGN §7.1, D227 |
| An invisible `rect.usecase-actor-outline` (`opacity: 0`) around each actor | Not written: the actor's group carries the name, the layout its box | Nothing invisible is drawn |
| Animated relationships: `stroke-dasharray: 9,5` and the `dash` keyframes | The `edge-animation-fast|slow` class only, with round caps: the keyframes need a `<style>` | R-SEC-2, as the flowchart |
| An icon actor drew Font Awesome's fallback glyph (`usecase-actor-icon-fallback`) for an unknown icon | The icons extension's glyph (D293) in the frame, else the frame alone with one `ICON_NOT_RENDERED` | D293, D299 |
| `look: neo` (the `usecase.look` default) was never read by the renderer, which took the global `look` (`classic`): no shadow, no gradient | The same in every theme: usecase differs between families by colour only | D227, D153 |
| Hand-drawn: roughjs sketched each shape, cell and frame (roughness 0.7, hachure, fill weight 1.5) and each line (roughness 0.3) | `@mermaid-js/plugin-hand-drawn` sketches each node shape (`node`), JSON cell (`part`), boundary frame and tab (`group`, fill weight 3) and line (`edge`); markers, business marks and text stay plain | D301, D302 |

### Usecase theme colours

The eight role colours are the package's theme variables (`usecaseActorBkg`,
`usecaseActorBorder`, `usecaseBkg`, `usecaseBorder`, `usecaseBoundaryBkg`,
`usecaseBoundaryBorder`, `usecaseIncludeLine`, `usecaseExtendLine`), with v12's fallbacks. Where a
theme carries a palette, the six that `redux-color` takes from it (`borderColorArray` slots 5, 1,
10, 2, `bkgColorArray` slots 5, 1) read the palette's slot, so both colour themes match v12 and an
author's `borderColorArray` recolours them in any theme, where v12 kept the theme's (D474). With a
palette each system boundary takes its own slot under both colour schemes, and under
`usecase.colorScheme: rotate` actors then use cases take one shared counter, as in v12; notes and
JSON tables never do, and every counted element carries `data-color-id`. What changed
(`packages/conformance/src/usecase/theme.spec.ts` lists each one):

| Themes | v12 | v13 | Why |
| --- | --- | --- | --- |
| `redux-color` | `usecaseBoundaryBkg` `#FAFAFC` | `clusterBkg` (`#F9F9FB`). Never painted: each boundary takes its palette slot, in v12 too | D474, D541 |
| `default`, `dark`, `forest`, `neutral` | Actor names in `actorTextColor` (`black`, `lightgrey`, `black`, `#333`) | `primaryTextColor`, as use case labels: `actorTextColor` is the sequence diagram's own variable | No shared input (D474) |
| `base` | Actor, use case and boundary borders from v12 base's border step | v13 base's border step (`actorBorder`, `nodeBorder`, `clusterBorder`), as every diagram in that theme | Core theme |
| `neo-dark` | Boundary border `clusterBorder` derived with the light rules | Derived with the dark rules | D183 |
