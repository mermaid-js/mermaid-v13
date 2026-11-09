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

The flowchart introduced these variables. Reuse them before adding any. Values per family are in `v13/docs/MIGRATION.md` "Theme geometry"; definitions are in `packages/core/src/theme/vocabulary.ts`, the padding values in `packages/core/src/theme/specs/geometry.ts`. The circle and cross arrowheads and the padding of the stadium, double circle, circle minimum, subroutine, cylinder, lean and odd shapes were flowchart's own until block, C4 and agentflow needed them (#552); they are core rows again. A new reader lists itself nowhere: the used-by column of core rows comes from a scan of each package's sources (`tools/gen-config/src/theme-packages.ts`); names it builds at run time go in its `workspace.yaml` (`theme.dynamicReads`).

| Group | Variables | Read with |
| --- | --- | --- |
| Palette | `borderColorArray`, `bkgColorArray`; the series palettes `seriesColorArray`, `plotColorArray` (D332, D381) | `theme.palette()`, or a slot in a rule (`seriesColorArray3`) |
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

To add one (the contract is DESIGN §8.1 and §12.1, D331):

1. **Pick its owner.** A variable only this type reads is the package's own: list it in `packages/diagram-<type>/src/theme/vocabulary.ts` with its alias, kind (`length`, `padding`, `color`, `filter`, `palette`, …) and `usedBy: ['<type>']`, plus `nested` when v12 reads it under `themeVariables.<section>` (D335, D540). A `palette` (D545) is the type's own list of colours, such as v12 xychart's `xyChart.plotColorPalette`. Its rule in the table names the shared palette it reads (`rules.light: { <var>: 'plotColorArray' }`; a family rule may name another). Read it with `ctx.theme.palette('<var>')`, as literal colours, with no CSS variable. The author sets it as an array or a comma-separated string, by the flat name or the nested key; the flat name wins, and an empty list counts as unset. Core and the theme specs never name it. A variable that core or a second type reads is a row in `packages/core/src/theme/vocabulary.ts`; the second type moves an existing package row there.
2. **Give it values in the package's table** (`src/theme/table.ts`, the plugin's `theme`, `vars: THEME_VARIABLE_TABLE`): `rules.light` (and `rules.dark`) over core's shared vocabulary, and family entries, `classic` for v12 classic and `redux` for v12 neo, with `neo` usually `fallback: 'redux'` (D181). Key by family and dark, never by theme name. Never add a diagram variable to a theme spec under `packages/core/src/theme/specs/`.
3. **Where themes of one family write it differently**, read a shared input with `inline()` (DESIGN §8.3 "Shared inputs" lists them). Adding an input is a decision for the port's spec (D541); otherwise use a family-rule approximation listed in the oracle's `DIFFERENCES`.
4. **Generate.** A new package needs the stub `src/theme/generated/variables.ts` (`export const THEME_VARIABLE_TABLE = {};`) before the first `pnpm gen:theme`, which writes it and `v13/docs/theme-variables.md`. Document the variable under `themeVariables` in `packages/core/schema/config.schema.yaml` with both values, then run `pnpm gen:config`.
5. Add its row to the MIGRATION.md "Theme geometry" table, for geometry (a shared core row, so this is a real shared edit; the type's own notes go in `v13/docs/migration/<type>.md`).

The direction check (`tools/gen-config/src/theme-direction.spec.ts`) and the closure scan in `packages/mermaid/src/cdn-build.spec.ts` fail when a name runs the wrong way or reaches core's bundle. Test with `createTheme(spec, { diagram: plugin.theme })` (`packages/diagram-class/src/theme/table.spec.ts` is an example).

The DSL forms a table uses most (D332):

- `bkgColorArray<n>`, `borderColorArray<n>`, `cScale<n>`: a palette slot as a literal colour.
- `seriesColorArray<n>`: the series palette's slot as the theme wrote it, CSS included; where a theme writes none, v12 theme-base's derivation from the base colours (slots 0–19). Read the series for any per-item colour, so a new theme with only base colours draws the diagram.
- `literal(adjustHue(primaryColor, 64))`: a computed colour as a literal, for a v12 hue turn.
- `inline(mutedBkg)`: a shared input as the theme wrote it; `inline(frameBorder, actorBorder)` falls back to the second where the theme wrote no first.
- `slot(borderColorArray, 5, actorBorder)`: the palette's slot when the theme (or the author) carries that palette, else the fallback (D474), for a role colour that follows per-item colour.

Any value that departs from v12 (as circle padding and the hexagon axes do in D151) is a decision: escalate it and record a D-id.

## Decisions

- **D151**: `redux-color` is the default; the redux family are real theme specs, with v12 as the oracle for every value.
- **D152**: every family difference is a theme variable; no renderer checks a theme name or a look; geometry is a literal number at render time.
- **D153**: `look` is removed and ignored with `LOOK_REMOVED`.
- **D182**: the neo gradient is a theme variable with scoped defs; outlines take `theme.outline()`.
- **D185**: zero-width or zero-height lines are drawn plain under the gradient (or in the outline's path).
