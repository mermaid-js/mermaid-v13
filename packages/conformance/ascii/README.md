# ASCII flowchart goldens

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

v13's layout differs from mermaid-ascii's, so `upstream.txt` is not compared exactly. Only a
structural check runs against it: every node label inside a box, every edge label present, every
edge connecting two boxes, the same number of arrowheads. Our own reviewed `expected.txt` is
compared exactly. Both arrive with #48; until then `ascii-fixtures.spec.ts` only checks that the
folders are complete.

[`ascii-divergences.json`](ascii-divergences.json) lists `{ fixture, kind, reason }` entries:

- `rejected-input`: mermaid@12 (and v13) reject the source.
- `reinterpreted`: Mermaid reads the source differently from mermaid-ascii.
- `structural`: the structural check fails for another reason (added with #48).

Every input was triaged with v13's flowchart parser and the mermaid@12 oracle in
`src/oracle.ts`. Both accept the same 140 inputs and agree on their models.
