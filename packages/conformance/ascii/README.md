# ASCII goldens

The 142 flowchart golden files of [mermaid-ascii](https://github.com/AlexanderGrooff/mermaid-ascii),
ported for v13's ASCII/Unicode backend (M2, D83, R-ASCII-2). They come from
`pkg/graph/testdata/{ascii,extended-chars,multibyte}` at commit `5a9df15`. mermaid-ascii is
MIT-licensed, Copyright (c) 2023 Alexander Grooff; the license text is in
[`../THIRD_PARTY_NOTICES`](../THIRD_PARTY_NOTICES).

## Layout

One folder per upstream file, under the upstream directory it came from:
`<group>/<name>/` for `pkg/graph/testdata/<group>/<name>.txt`. The groups are `ascii/` (92),
`extended-chars/` (47) and `multibyte/` (3). Most `extended-chars/` inputs are the same as their
`ascii/` namesakes, rendered with Unicode box characters.

Each folder holds:

- `input.mmd`: the Mermaid source, everything before the first `---` line, with the leading
  `paddingX = N`, `paddingY = N` and `maxWidth = N` header lines removed.
- `upstream.txt`: mermaid-ascii's expected output, everything after that `---` line, with `␠`
  (U+2420) decoded to a space. Trailing spaces are significant.
- `meta.json`: `source` (the upstream path), `charset` (`ascii` for `ascii/` and `multibyte/`,
  `unicode` for `extended-chars/`) and the removed headers as numbers.

The file format is described in `v13/docs/research/mermaid-ascii.md` §8.10.

## How they are used

`src/ascii/goldens.spec.ts` (#48) renders every input Mermaid accepts and checks it two ways.

- **Structural check against `upstream.txt`.** v13's layout differs from mermaid-ascii's, so
  `upstream.txt` is not compared exactly. `src/ascii/structure.ts` reads both drawings back:
  every node label inside a box, every edge label present, every edge line connected box to
  box (no free end), the same number of arrowheads. A failure must be listed as `structural`.
- **`expected.txt`, compared exactly:** our own reviewed output in the fixture's charset, plus
  `expected.<charset>.txt` in the other charset when the other group has no fixture with the
  same input (all of `multibyte/`, and the `ascii/` inputs without an `extended-chars/` twin).
  Write them with `vitest run -u packages/conformance/src/ascii/goldens.spec.ts` and review
  the diff by hand (checklist in `v13/docs/agents/runs/37/tickets/48.md`).

`maxWidth` is passed as `ascii.maxWidth`. `paddingX`/`paddingY` have no config home
(`ascii.padding` is `compact | roomy`), so those fixtures render with the default padding.

`v13/` holds our own cases (shapes, RL/BT, nested and empty subgraphs, CJK, emoji, ZWJ and
flags, a front-matter title, `maxWidth`), each with `input.mmd`, `meta.json`, `expected.txt`
(Unicode) and `expected.ascii.txt`. They have no `upstream.txt`.

[`ascii-divergences.json`](ascii-divergences.json) lists `{ fixture, kind, reason }` entries:

- `rejected-input`: mermaid@12 (and v13) reject the source.
- `reinterpreted`: Mermaid reads the source differently from mermaid-ascii.
- `structural`: the structural check fails for another reason (added with #48).

Every input was triaged with v13's flowchart parser and the mermaid@12 oracle in
`src/oracle.ts`. Both accept the same 140 inputs and agree on their models.

## ER goldens

The 83 ER golden files of mermaid-ascii (#136, D83, D100, D109) come from
`cmd/testdata/{er,er-ascii}` at the same commit, one folder per file: `er/` (70, Unicode) and
`er-ascii/` (13, ASCII; every input is the same as its `er/` namesake). They have no header
lines. `meta.json` holds `source` and `charset`. `er-v13/` holds our own cases (directions, MD
parent ends, nested subgraphs, a relationship to a subgraph, a title, dropped styles, CJK and
emoji, generics and aliases, self and parallel relationships), each with `expected.txt`
(Unicode) and `expected.ascii.txt`.

`src/ascii/er-goldens.spec.ts` renders them through `src/ascii/er-render.ts` (the ER plugin's
`./ascii` entry, as the API will once the plugin is registered). The structural check is
`src/ascii/er-structure.ts`: it finds the crow's-foot marks (mermaid-ascii's `||`, `|o`, `}|`,
`}o` on a horizontal line, ours on a vertical one too), counts one end per run and reads its
cardinality, replaces the marks with line glyphs and runs the flowchart reader on what is left.
Each entity's table must be in a box (name row, then the attribute cells), each relationship
label present, each line connected box to box, the same ends with the same cardinalities as
upstream, and no arrowheads. `expected.txt` files are written with
`vitest run -u packages/conformance/src/ascii/er-goldens.spec.ts` and reviewed by hand.
ER entries in `ascii-divergences.json` have fixtures under `er/` or `er-ascii/`; each suite
reads only its own groups' entries.
