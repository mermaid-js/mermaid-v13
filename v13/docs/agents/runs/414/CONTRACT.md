# T0a contract: a diagram's own theme table (#438, D331)

This is the stable API the M5a ports build their theme tables on. It only grows; nothing here is renamed or removed while the T0 runs. Types: `@mermaid-js/core/theme` (`packages/core/src/theme/diagram.ts`).

## Shape

```ts
import type { DiagramThemeTable } from '@mermaid-js/core/theme';

export const theme: DiagramThemeTable = {
  section: 'packet',                         // v12's nested key, if v12 reads one (D335)
  vars: {                                    // the diagram's own variables, any kind
    packetStartByteColor: { alias: 'pkb', kind: 'color', nested: 'startByteColor' },  // D540
    packetBlockGap: { alias: 'pkg', kind: 'length' },
  },
  rules: {
    light: { packetStartByteColor: 'primaryTextColor' },   // beside LIGHT_RULES
    dark: { packetStartByteColor: 'lineColor' },           // replaces light's under dark/darkMode
  },
  families: {                                // keyed by ThemeSpec.family, never a theme name
    classic: { tokens: { packetBlockGap: 2 } },
    redux: { tokens: { packetBlockGap: 4 }, dark: { values: { packetStartByteColor: '#eeeeee' } } },
    neo: { fallback: 'redux' },              // neo takes redux's entries beneath its own
  },
};

export const packet: DiagramPlugin = { id: 'packet', /* … */ theme };
```

Read the variables as any other: `ctx.theme.color('packetStartByteColor')`, `ctx.theme.number('packetBlockGap')`.

## Rules

- **Traits.** `ThemeSpec.family` is `classic` (default, dark, forest, neutral, base), `redux` (redux, redux-color, redux-dark, redux-dark-color) or `neo` (neo, neo-dark). `ThemeSpec.dark` is the other trait.
- **Precedence**, today's layers: shared rules (`LIGHT_RULES`/`DARK_RULES`) and the table's `rules.light` (+ `rules.dark` under a dark theme or `darkMode`); then the theme spec's own rules; then the family's `rules`; then plugin fragment rules. Spec `values`/`tokens` and the family's `values`/`tokens` beat every rule. Author `themeVariables` beat everything.
- **Families.** A family entry applies its `rules`, `values` and `tokens`, then its `dark` entries when the spec is a dark theme (the `dark` trait, not the author's `darkMode`). `fallback` names the family whose entries apply beneath (recursively). A family with no entry gets only `rules`.
- **Nested sections.** With `section: 'packet'`, `themeVariables.packet.<nested>` sets the flat variable whose `nested` is that key. Key by key, no prefix rule. The flat name wins when both are set, with no warning. Unknown nested keys are ignored.
- **Names.** A var whose name core already defines is ignored. A plugin fragment rule with the same name as a table var loses (D337). Aliases must not collide with core's (`packages/core/src/theme/generated/variables.ts`).
- **Direction (D331).** Rules read only shared names (`THEME_VARIABLES` in `packages/core/src/theme/vocabulary.ts`), palette slots and the table's own vars; entries write only the table's own vars. The package never names a theme (`'redux-dark'`, `theme.name`, `config.theme === 'dark'`). Checked by `tools/gen-config/src/theme-direction.spec.ts`, which finds the table on the plugin your package's `src/index.ts` exports.

## DSL additions (D332)

- `bkgColorArray<n>`, `borderColorArray<n>` and every other palette's slots read as literal colours, like `cScale<n>`. Past the end of a palette: `currentColor`.
- `seriesColorArray<n>` reads the entry as the theme wrote it, CSS included (for the T1 pie migration).
- `literal(x)`: x's computed colour as a literal (no CSS variable, no dependency). Use for hue turns that must equal a v12 resolved value: `literal(adjustHue(primaryColor, 64))`.

## Shared inputs added (D332, D334, D381)

- `scaleLabelColor` (v12's name): the label ink `cScaleLabel` reads. Use it instead of sequence's `labelTextColor`.
- Palettes `seriesColorArray` (a theme's series colours; empty until T1 fills it) and `plotColorArray` (D381's ten-colour chart palette; empty until xychart fills it).

## Tests and tools

- `createTheme(spec, { diagram: theme })` resolves a table in unit tests and tools.
- `pnpm --filter @mermaid-js/bench theme-identity --out <file> [--compare <base file>]` renders every e2e `.mmd` and bench fixture in all eleven themes and `auto`, under four variants, and compares digests.

## Vocabulary and generation (T0b, #439)

A port that moves rows writes `packages/diagram-<type>/src/theme/vocabulary.ts`:

```ts
import type { DiagramThemeVarDef } from '@mermaid-js/core/theme';

export const THEME_VARIABLES: Readonly<Record<string, DiagramThemeVarDef>> = {
  packetStartByteColor: { alias: 'pkb', kind: 'color', usedBy: ['packet'], nested: 'startByteColor' },
};
```

- `usedBy` is `['<type>']` (the package directory without `diagram-`) when the package's sources read the row, else `[]`. A row another type reads belongs in core.
- `pnpm gen:theme` writes `src/theme/generated/variables.ts` (`THEME_VARIABLE_TABLE`, the rows without `usedBy`, built in a `@__PURE__` call). The table takes it: `vars: THEME_VARIABLE_TABLE`. It also adds the package to `v13/docs/theme-variables.md` ("Diagram variables": each variable's value in every theme, with its nested form).
- `gen:theme` fails, and so does `theme-inventory.spec.ts`, when a name or alias is core's or another package's, or a nested key repeats (D337).
- Checks that pick the package up with no edit: `theme-direction.spec.ts` (rule 4: the plugin's `theme.vars` equal the vocabulary), `theme-used-by.spec.ts`, `theme-tables.spec.ts` (every row in eleven themes and a twelfth), and the conformance specs, which pass `plugin.theme` already (`packages/conformance/src/diagram-themes.ts`; the neo and neo-dark specs read every table through `everyTable`).
- knip treats `src/theme/vocabulary.ts` as an entry.
