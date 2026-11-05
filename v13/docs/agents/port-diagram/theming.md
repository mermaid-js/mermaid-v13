# Theming: translate v12 theme logic into theme variables

A ported diagram joins the redux family through theme variables. It never copies v12's theme-name logic. Use this file for T4 (renderer) and T5 (integration).

## The rule

**A diagram package never checks a theme name or a look** (D152). Every difference between the redux family (`redux`, `redux-color`, `redux-dark`, `redux-dark-color`) and the classic family (`default`, `dark`, `forest`, `neutral`, `base`) is a theme variable that the theme spec carries. `look` is removed (D153): the key is ignored with a `LOOK_REMOVED` warning, so no renderer reads it. `redux-color` is the default theme (D151).

## Mapping v12 patterns

Find these in `git show fa796a943:packages/mermaid/src/diagrams/<type>/…` (renderer, `styles.js`/`styles.ts`, `svgDraw.js`) and in the shared shapes the type uses.

| v12 pattern | v13 replacement |
| --- | --- |
| A theme-name set: `COLOR_THEMES.has(theme)`, `isColorTheme(…)`, `REDUX_THEMES`, `REDUX_GEOMETRY_THEMES` | The palette variables `borderColorArray` and `bkgColorArray`, read with `theme.palette(name)`. Per-item colour is on when `borderColorArray` is non-empty, never by name, so a `themeVariables` palette turns it on in any theme. An empty `bkgColorArray` (as in `redux-dark-color`) colours borders only. |
| A `look === 'neo'` branch | A geometry variable whose redux value is v12's neo value and whose classic value is v12's classic value. Read it with `theme.number(name)`, or `theme.padding(name, padding)` for a `padding` kind. Geometry feeds layout, so it is a literal number at render time, and overriding the CSS variable has no effect. |
| `filter: url(#…-drop-shadow)` with a `<filter>` in `<defs>` | The `dropShadow` variable, a CSS `filter` value. Write it with `theme.filter('dropShadow')` on the element, and skip the attribute when `theme.value('dropShadow') === 'none'` (the classic themes). No `<defs>` and no ids, so several diagrams on one page never collide. |
| `useGradient` / `[data-look=neo]` rules that stroke with `url(#…-gradient)` (`insertLookDefs.ts`, `styles.ts`) | `theme.outline(name)` in place of `theme.color(name)` on each outline v12 neo strokes with the gradient (D182): `url(#<idPrefix>-gradient)` when `useGradient` is on, else `theme.color(name)`. Type the paint field `OutlinePaint`. Core writes the `<defs>`; the renderer writes nothing else. Check a v12 neo render's computed styles: a selector in v12's CSS can match nothing, or lose to an inline `!important` (sequence and class notes draw no gradient). A line whose box has zero width or height (one-segment path, divider line, small dot) can't take an `objectBoundingBox` gradient: draw it in plain `theme.color(name)` when `theme.gradient()` is set, as flowchart `usesPlain()` (#229) and the state dividers (#234) do, or draw it in the outline's path (ER rules, #235). Key it on `theme.gradient()`, never on a theme name (D152, D185). Palette slots and author `style` / `classDef` strokes still win. |
| `data-color-id` slots stamped per item | The same `data-color-id="color-<n>"` attribute. The slot is the item's declaration order modulo the palette length; the fill uses `bkgColorArray` only when it is non-empty. An author `style` / `classDef` still wins over the palette. Copy `paletteSlots()` in `packages/diagram-flowchart/src/render/render.ts`. |

Where v12 gates on a name for something that is not a palette or geometry (for example `er/styles.ts` choosing `erEdgeLabelBackground` only in colour themes), give the colour themes a value for the variable and let the classic themes derive it. The renderer reads the variable unconditionally.

## Shared vocabulary

The flowchart introduced these variables. Reuse them before adding any. Values per family are in `v13/docs/MIGRATION.md` "Theme geometry"; definitions are in `packages/core/src/theme/vocabulary.ts`, the padding values in `packages/core/src/theme/specs/geometry.ts`.

| Group | Variables | Read with |
| --- | --- | --- |
| Palette | `borderColorArray`, `bkgColorArray` | `theme.palette()` |
| Point arrowhead | `arrowheadGap`, `arrowheadLength`, `arrowheadWidth` | `theme.number()` |
| Circle arrowhead | `circleArrowheadSize`, `circleArrowheadGap` | `theme.number()` |
| Cross arrowhead | `crossArrowheadSize`, `crossArrowheadGap`, `crossArrowheadStrokeWidth` | `theme.number()` |
| Padding | `nodePaddingX`, `nodePaddingY`, `stadiumPaddingX`, `stadiumPaddingY`, `hexagonPaddingX`, `hexagonPaddingY`, `hexagonSlant`, `doubleCircleGap`, `doubleCirclePadding`, `circlePadding`, `circleMinDiameter`, `subroutinePaddingX`, `subroutinePaddingY`, `cylinderPaddingX`, `cylinderPaddingY`, `leanPaddingX`, `leanPaddingY`, `oddPaddingX`, `oddPaddingY` | `theme.padding()` for the `padding` kind, `theme.number()` for the rest |
| Shadow | `dropShadow` | `theme.filter()` |
| Gradient | `useGradient` (a `flag` token), `gradientStart`, `gradientStop` (`usedBy: ['core']`) | `theme.outline(name)` for the paint, `theme.gradient()` to know whether it is on |

v12 gives many shapes their own look-gated padding, so check each shape file the type draws, not only `squareRect.ts`; a shape whose padding is the same in both looks (v12 `roundedRect.ts`) reads the diagram's `padding` directly.

A `padding` kind takes a px number or a multiple of the diagram's own `padding` config (`padding`, `2 * padding`). The caller passes that config value to `theme.padding()`, so the classic themes follow it as v12 classic did.

## When to add a variable

Add a new variable only when the redux and classic values differ (D152). If v12 neo and v12 classic draw the same value, it is a constant in the renderer or an existing variable. If the difference is the same quantity a shared variable already names (an arrowhead, node padding, the shadow), reuse that variable; a diagram does not get its own copy.

To add one:

1. Define it in `packages/core/src/theme/vocabulary.ts` with the right kind (`length`, `padding`, `color`, `filter`).
2. Give it a redux value (v12 neo) and a classic value (v12 classic) in every theme spec under `packages/core/src/theme/specs/`. Group shared geometry in `geometry.ts` as the padding does.
3. Add it to `themeVariables` in `packages/core/schema/config.schema.yaml` with both values in the description, then run `pnpm gen:config` and `pnpm gen:theme`.
4. Add its row to the MIGRATION.md "Theme geometry" table.

Any value that departs from v12 (as circle padding and the hexagon axes do in D151) is a decision: escalate it and record a D-id.

## Decisions

- **D151**: `redux-color` is the default; the redux family are real theme specs, with v12 as the oracle for every value.
- **D152**: every family difference is a theme variable; no renderer checks a theme name or a look; geometry is a literal number at render time.
- **D153**: `look` is removed and ignored with `LOOK_REMOVED`.
- **D182**: the neo gradient is a theme variable with scoped defs; outlines take `theme.outline()`.
- **D185**: zero-width or zero-height lines are drawn plain under the gradient (or in the outline's path).
