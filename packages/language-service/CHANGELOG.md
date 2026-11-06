# @mermaid-js/language-service

## 13.0.0-alpha.1

### Patch Changes

- [#166](https://github.com/mermaid-js/mermaid-v13/pull/166) [`3ba88a6`](https://github.com/mermaid-js/mermaid-v13/commit/3ba88a685ee7e16d5cdeaa40cc9f088a49c786cb) Thanks [@knsv-bot](https://github.com/knsv-bot)! - feat: class diagrams (`classDiagram` and `classDiagram-v2`) render as SVG through `mermaid`, with the class language facet in the language service and server.

- [#161](https://github.com/mermaid-js/mermaid-v13/pull/161) [`24468c6`](https://github.com/mermaid-js/mermaid-v13/commit/24468c63c38a04cad0346e856443b55f527dd8d3) Thanks [@knsv-bot](https://github.com/knsv-bot)! - feat: the language service loads the ER facet from `@mermaid-js/diagram-er` (an optional peer), so `erDiagram` documents get diagnostics, definition, references, rename, hover, completion, folding and semantic tokens.

- [#252](https://github.com/mermaid-js/mermaid-v13/pull/252) [`c3aaa88`](https://github.com/mermaid-js/mermaid-v13/commit/c3aaa88f9ee46635e33580598db79e635048bc1d) Thanks [@knsv-bot](https://github.com/knsv-bot)! - feat: each `firstPartyFacets` row carries the detector's regex as `pattern`, and the `FirstPartyFacetId` type names the ids that have a language facet, so an editor integration can dispatch on the same headers as the service and key a per-type table by the facet ids.

- [#123](https://github.com/mermaid-js/mermaid-v13/pull/123) [`d1906aa`](https://github.com/mermaid-js/mermaid-v13/commit/d1906aaf00de245710f91a873254736d2a528bd0) Thanks [@knsv-bot](https://github.com/knsv-bot)! - feat: first release of `@mermaid-js/language-service`, the editor-agnostic Mermaid language service: `createLanguageService()`, `await service.preload()`, and immutable document snapshots with diagnostics, definition, references, rename, hover, completion (front-matter config included), folding, semantic tokens and `astAt`/`rangeOf`. Ships the line helpers every editor adapter shares and the golden runner for facet authors as `@mermaid-js/language-service/testing`.

- [#349](https://github.com/mermaid-js/mermaid-v13/pull/349) [`56af30c`](https://github.com/mermaid-js/mermaid-v13/commit/56af30c1b27cd81ba2c688cf446aade8253d799a) Thanks [@knsv-bot](https://github.com/knsv-bot)! - feat: the language service loads the pie facet from `@mermaid-js/diagram-pie` (an optional peer), so `pie` documents get diagnostics, definition, references, rename (section labels, quotes kept), hover with each section's share, completion, folding and semantic tokens.

- [#266](https://github.com/mermaid-js/mermaid-v13/pull/266) [`be33641`](https://github.com/mermaid-js/mermaid-v13/commit/be33641f7201c350fd9ed134f3149646a4fc2b8a) Thanks [@knsv-bot](https://github.com/knsv-bot)! - fix: rename applies its edits in one pass, so its read-back check is linear in the document size instead of growing with size × occurrences

- [#345](https://github.com/mermaid-js/mermaid-v13/pull/345) [`36db503`](https://github.com/mermaid-js/mermaid-v13/commit/36db50399202f23e86904c55e821458c3528d820) Thanks [@knsv-bot](https://github.com/knsv-bot)! - feat: quadrant charts (`quadrantChart`) render as SVG through `mermaid`, with the 15 `quadrant*` theme variables in every theme, the `quadrantChart` config section honoured where v12 12.2.0 reads it, and the quadrant language facet and highlighters in the language service, server and editor adapters. MIGRATION.md lists what differs from v12.

- [#160](https://github.com/mermaid-js/mermaid-v13/pull/160) [`dd9ee1c`](https://github.com/mermaid-js/mermaid-v13/commit/dd9ee1ce5dab450dff95a270793167c953016c79) Thanks [@knsv-bot](https://github.com/knsv-bot)! - feat: state diagrams (`stateDiagram` and `stateDiagram-v2`) render as SVG through `mermaid`, with the state language facet in the language service and server.

- Updated dependencies [[`3ba88a6`](https://github.com/mermaid-js/mermaid-v13/commit/3ba88a685ee7e16d5cdeaa40cc9f088a49c786cb), [`756c1a2`](https://github.com/mermaid-js/mermaid-v13/commit/756c1a214be52650abd37b34ae4469b6ba128da4), [`24468c6`](https://github.com/mermaid-js/mermaid-v13/commit/24468c63c38a04cad0346e856443b55f527dd8d3), [`a58fba2`](https://github.com/mermaid-js/mermaid-v13/commit/a58fba2b78b680a018706c2662b1c8fe6f8583d2), [`d1906aa`](https://github.com/mermaid-js/mermaid-v13/commit/d1906aaf00de245710f91a873254736d2a528bd0), [`24468c6`](https://github.com/mermaid-js/mermaid-v13/commit/24468c63c38a04cad0346e856443b55f527dd8d3), [`eee8b86`](https://github.com/mermaid-js/mermaid-v13/commit/eee8b86875af29e84c6489a82c5d5e865ac60a8a), [`101dab1`](https://github.com/mermaid-js/mermaid-v13/commit/101dab15d7e6a18dd948f1876f2bfb2cb4a3f293), [`36db503`](https://github.com/mermaid-js/mermaid-v13/commit/36db50399202f23e86904c55e821458c3528d820), [`c0b1a0b`](https://github.com/mermaid-js/mermaid-v13/commit/c0b1a0b9a4bd92e9146f9d6eb61622ef39bb1f1d), [`a7e2ebe`](https://github.com/mermaid-js/mermaid-v13/commit/a7e2ebe4739113090ce062a2b70c9ae112a72359), [`d1906aa`](https://github.com/mermaid-js/mermaid-v13/commit/d1906aaf00de245710f91a873254736d2a528bd0), [`411e967`](https://github.com/mermaid-js/mermaid-v13/commit/411e9676909d16e790707d1cac4e1a00c99d226f), [`101dab1`](https://github.com/mermaid-js/mermaid-v13/commit/101dab15d7e6a18dd948f1876f2bfb2cb4a3f293), [`c0b1a0b`](https://github.com/mermaid-js/mermaid-v13/commit/c0b1a0b9a4bd92e9146f9d6eb61622ef39bb1f1d), [`f433e76`](https://github.com/mermaid-js/mermaid-v13/commit/f433e76f0c391850c4100aaaf10f44207655d5b1), [`aac2097`](https://github.com/mermaid-js/mermaid-v13/commit/aac2097c19d3b1517e8aa701003cd8f8397e4f8c), [`36db503`](https://github.com/mermaid-js/mermaid-v13/commit/36db50399202f23e86904c55e821458c3528d820), [`dd9ee1c`](https://github.com/mermaid-js/mermaid-v13/commit/dd9ee1ce5dab450dff95a270793167c953016c79)]:
  - @mermaid-js/diagram-class@13.0.0-alpha.1
  - @mermaid-js/core@13.0.0-alpha.1
  - @mermaid-js/diagram-er@13.0.0-alpha.1
  - @mermaid-js/diagram-journey@13.0.0-alpha.1
  - @mermaid-js/diagram-pie@13.0.0-alpha.1
  - @mermaid-js/diagram-quadrant@13.0.0-alpha.1
  - @mermaid-js/diagram-sequence@13.0.0-alpha.1
  - @mermaid-js/diagram-state@13.0.0-alpha.1
  - @mermaid-js/diagram-timeline@13.0.0-alpha.1
  - @mermaid-js/diagram-flowchart@13.0.0-alpha.1
