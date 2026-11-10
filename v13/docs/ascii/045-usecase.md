---
intro: "the usecase diagram (`usecase-beta`, [below](#usecase-diagrams))"
cli: "the usecase diagram"
size: "the usecase diagram's"
---

## Usecase diagrams

The usecase diagram's text entry (`@mermaid-js/diagram-usecase/ascii`, #569, D320, D478) draws
the same graph as SVG, laid out in cells with `layered` (any other `layout` warns
`ASCII_DROPPED` `layout`, as for every graph type).

```
             ┌───── Shop ────┐
             │               │
             │   ╭───────╮   │                    ╭──────╮
      ┌──────┼──►( Login )┄┄┄┼┄┄┄┄┄┄┄ «include» ┄►( Auth )
  O   │      │   ╰───────╯   │                    ╰──────╯
 /|\──┘      │               │
 / \         └───────────────┘
User──┐
      │
      │ ╭─────────────────────────╮
      └►( Pay for the whole order )
        (    with a saved card    )
        ╰─────────────────────────╯
```

- Actors are a three-line figure (` O `, `/|\`, `/ \`) with the stereotype and the name under
  it; a line across runs up to the figure or the name.
- Use cases are boxes, rounded for an oval, whose label rows read `( label )` (`[ label ]` for a
  rect); a stereotype is a line over the label. The top and bottom rows give a line from the side
  a cell of its own off the corners.
- Boundaries (`package` ones too) are frames with the title in the top border; notes are boxes
  on a dotted line; JSON tables are key/value boxes, a divider between the columns.
- Include and extend are dotted, labelled `«include»` and `«extend»` (`<<include>>`,
  `<<extend>>` in the `ascii` charset, as stereotypes); generalization ends in `▷` (`|>`, or `-`
  over `v` across a vertical line); association ends are `►`, `●` and `✕` (`>`, `o`, `x`).
- `usecase.*` px lengths convert to cells only when set (8 × 16 px a cell; `nodeSpacing`,
  `rankSpacing`, `wrappingWidth`, `minNodeWidth`); the defaults give the cell profile's own.
- Dropped, one `ASCII_DROPPED` warning per kind: `style` (`style`, `classDef`, `class`),
  `emphasis`, `glyph` (business marks, icons and the hollow and awesome figures, drawn as the
  plain figure and boxes), `animation`, `config` (the `usecase` fonts, `colorScheme`,
  `useMaxWidth` and `diagramPadding` set off their defaults) and `accessibility`.
