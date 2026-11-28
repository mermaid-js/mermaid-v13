# Review fixes (branch feature/1_m1-review-fixes, worktree .claude/worktrees/review)
Base: feature/1_m1-core-flowchart @ 60e9eac8f. The merge is a no-op ("Already up to date").

What changed (public surface)
- `mermaid` api.ts: when no `id` is passed (renderSync/prepare/SSR), the id prefix is
  `mermaid-<fnv1a-32 base36>`, hashed over text + resolved config + integrator options
  (functions serialise as null). The same input gives byte-identical output. Different text
  or config gives different `-title`/`-desc` ids and a different theme `data-p` scope. The
  same text twice on one page still collides, so pass `id` for that. Documented in
  RenderOptions.id and MIGRATION.
- `selectMeasurer`: `deterministic: true` now wins over an integrator `measurer` (R-TEXT-7).
  The IntegratorOptions doc, DESIGN §5.1 and MIGRATION are updated.
- `@mermaid-js/core` MermaidError gains `limit?: LimitName` for `code: 'LIMIT'`. It comes from
  init.limit, the cause LimitError, or the first limit diagnostic. DESIGN §11 is updated.
- core/theme: `invert(a)` becomes `color(from a srgb calc(1 - r) …)`. `contrast(bg,a,b)` becomes
  a nested relative colour that reads bg's luminance in srgb-linear and steps on thresholds
  precomputed from the inks. The JS literal is unchanged. Limits (DESIGN §8.1 item 2,
  MIGRATION): the inks are the theme's resolved values, so overriding --mermaid-textColor does
  not reach nodeTextColor; bg alpha is ignored. Each contrast variable in use adds about
  160 B to the root style.
- flowchart parser: bad shape-data YAML and linkStyle index errors no longer abort the
  statement (the node keeps no data). Later syntax errors in that statement are reported.
- FlowBuilder.finish(): STYLE_UNKNOWN_NODE is decided after the whole document is parsed. An
  id that names a subgraph (defined before or after) does not warn. The model is unchanged.
- tools/release licenses.ts: UPSTREAMS (the reference implementation, @braintree/sanitize-url) plus REQUIRED_CREDITS
  (core/src/svg/url.ts must credit both). THIRD_PARTY_NOTICES has a sanitize-url section with
  the MIT text.
- Workflows: codeql, scorecard and renovatebot-config-lint target mermaid-v13. The Argos
  upload sets ARGOS_REFERENCE_BRANCH=mermaid-v13. These are pinned in
  tools/release/src/release-config.spec.ts.
- preprocess stress.spec: takes the best of three ratio measurements (flake fix).

GAPS "Review pass" status
- Closed: semantic-error resync, style <subgraph>, codeql/Argos branch, braintree notice,
  MermaidError.limit, stress flake.
- Fixed before this pass: unprefixed node ids. The output has only -title/-desc ids.
- Open: flowchart.useMaxWidth is still pending.
- Not verified: WebKit (it won't launch locally). Firefox relative-colour support was
  checked by hand only.
