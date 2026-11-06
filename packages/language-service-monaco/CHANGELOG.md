# @mermaid-js/language-service-monaco

## 13.0.0-alpha.1

### Patch Changes

- [#349](https://github.com/mermaid-js/mermaid-v13/pull/349) [`56af30c`](https://github.com/mermaid-js/mermaid-v13/commit/56af30c1b27cd81ba2c688cf446aade8253d799a) Thanks [@knsv-bot](https://github.com/knsv-bot)! - feat: first-paint highlighting for `pie` charts: a Lezer grammar in CodeMirror and Monarch tokens in Monaco, each a lazily loaded file of its own, as for the other diagram types.

- [#252](https://github.com/mermaid-js/mermaid-v13/pull/252) [`2b19cb5`](https://github.com/mermaid-js/mermaid-v13/commit/2b19cb58c582ecbd7379f9419eca08b44ec6e189) Thanks [@knsv-bot](https://github.com/knsv-bot)! - feat: first release of `@mermaid-js/language-service-monaco`, the Mermaid language service in Monaco: `await registerMermaid(monaco)` registers the `mermaid` language id, first-paint Monarch tokens per diagram type (flowchart, sequence, class, state, ER; each type's tokens a lazily loaded file of their own), markers, and the completion, hover, definition, references, rename, folding and semantic-token providers. `monaco-editor` and `@mermaid-js/language-service` are peers (the service at the exact version the adapter names); nothing imports Monaco at run time.

- [#345](https://github.com/mermaid-js/mermaid-v13/pull/345) [`36db503`](https://github.com/mermaid-js/mermaid-v13/commit/36db50399202f23e86904c55e821458c3528d820) Thanks [@knsv-bot](https://github.com/knsv-bot)! - feat: quadrant charts (`quadrantChart`) render as SVG through `mermaid`, with the 15 `quadrant*` theme variables in every theme, the `quadrantChart` config section honoured where v12 12.2.0 reads it, and the quadrant language facet and highlighters in the language service, server and editor adapters. MIGRATION.md lists what differs from v12.

- Updated dependencies [[`3ba88a6`](https://github.com/mermaid-js/mermaid-v13/commit/3ba88a685ee7e16d5cdeaa40cc9f088a49c786cb), [`24468c6`](https://github.com/mermaid-js/mermaid-v13/commit/24468c63c38a04cad0346e856443b55f527dd8d3), [`c3aaa88`](https://github.com/mermaid-js/mermaid-v13/commit/c3aaa88f9ee46635e33580598db79e635048bc1d), [`d1906aa`](https://github.com/mermaid-js/mermaid-v13/commit/d1906aaf00de245710f91a873254736d2a528bd0), [`56af30c`](https://github.com/mermaid-js/mermaid-v13/commit/56af30c1b27cd81ba2c688cf446aade8253d799a), [`be33641`](https://github.com/mermaid-js/mermaid-v13/commit/be33641f7201c350fd9ed134f3149646a4fc2b8a), [`36db503`](https://github.com/mermaid-js/mermaid-v13/commit/36db50399202f23e86904c55e821458c3528d820), [`dd9ee1c`](https://github.com/mermaid-js/mermaid-v13/commit/dd9ee1ce5dab450dff95a270793167c953016c79)]:
  - @mermaid-js/language-service@13.0.0-alpha.1
