## ER SVG structure

What changed in the ER diagram's SVG compared with v12 (DESIGN §7.2, #133). The groups are the
flowchart's (`clusters`, `edgePaths`, `edgeLabels`, `nodes`), and v12's ER class names are kept
where the element still exists (`node default <classDef>`, `outer-path`, `row-rect-odd`,
`row-rect-even`, `name`, `attribute-type`, `attribute-name`, `attribute-keys`,
`attribute-comment`, `divider`, `relationshipLine`, `edge-pattern-solid`/`-dashed`, `cluster`).

| v12 | v13 | Why |
| --- | --- | --- |
| Root `id="<render id>"`, `class="erDiagram"`, `aria-roledescription="er"`, a `<style>` element | No root `id`; `class="mermaid mermaid-er erDiagram"`, `role="img"`, `aria-roledescription="er"`, `data-mermaid-version`; no `<style>`, colours are presentation attributes reading `var(--_x)` aliases | Only `<id>-title` and `<id>-desc` ids (R-A11Y-1); inert output (R-SEC-2) |
| Entity `<g class="node default" id="entity-<name>-<n>">` | `<g class="node default …" data-id="<name>" data-ast="n:<name>" transform>` | `data-ast` maps the entity to its first mention (R-PARSE-8) |
| Table drawn with rough.js paths: `g.outer-path`, `g.row-rect-odd/even` (one per row, empty of text), one `path.divider` polygon per rule, and `g.label` groups holding `<foreignObject>` or `<text>` | `<rect class="outer-path">`; one `<g class="row-rect-odd\|even" data-id="<attribute>" data-ast="a:<entity>.<attribute>">` per attribute row holding its fill `<rect>` and its cells as `<text class="attribute-type">` (and `-name`, `-keys`, `-comment`); one `<path class="divider">` with the outline and every rule; `<text class="name">` | One element per attribute row carries its AST id; text labels only (D5) |
| Entity without attributes: `drawRect` with `rect.basic.label-container` | `<rect class="outer-path">` and `<text class="name">` | Same structure as a table |
| Entity outline 1.3px (rough.js default) in classic looks, `strokeWidth` in neo | `strokeWidth` (1 classic, 2 redux) for outline, rules, lines and ends | Theme tokens (R-THEME-11), D117 |
| `style` / `classDef` fill: classic looks keep the theme fill on odd rows, neo fills every row | The author's fill fills the whole table in every theme; its stroke styles the outline and every rule | One rule for every theme (D152), D117 |
| Edge `<path class="… relationshipLine" id="id_<from entity id>_<to entity id>_<n>" marker-start marker-end>` with `<marker>` elements in `<defs>`: `CUSTOMER \|\|--o{ ORDER` is `id_entity-CUSTOMER-0_entity-ORDER-1_0` | `<g class="edge relationshipLine edge-thickness-normal edge-pattern-solid\|dashed" data-id="id_<from name>_<to name>_<n>" data-ast="e:<a>><b>">` holding the line `<path>` and one `<g class="marker onlyOne\|zeroOrOne\|oneOrMore\|zeroOrMore">` per end (a `<path>`, plus a `<circle>` for a zero end): the same edge is `id_CUSTOMER_ORDER_0` | No `<defs>` or ids (D35); ends take the line colour. The `data-id` uses the entity names, as `data-id` does on entities; v12's entity ids are gone |
| Crow's foot: a lens marker half covered by the entity box | Only the visible half is drawn, from the outline to the toe 18px out | Same picture without relying on paint order |
| `md_parent` end (`u`): no marker | No marker (unchanged) | |
| Edge label `<g class="edgeLabel">` with `<foreignObject>` (`span.edgeLabel`, `div.labelBkg`) | `<g class="edgeLabel" data-id>` with a background `<rect>` and a `<text>` | Text labels; labels carry no `data-ast` |
| Subgraph `<g class="cluster" id>` with `<g class="cluster-label">` | `<g class="cluster …" data-id="<name>" data-ast="s:<name>">` with `<rect>` and `<text class="cluster-label">` | |
| Front-matter `title` drawn as `text.erDiagramTitleText` | Not drawn yet, as in the flowchart | |
| Hand-drawn look: background copies of every entity (`<id>-background`) | None (`look` is removed, D153) | |
