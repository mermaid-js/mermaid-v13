# Port one v12 diagram type to v13

One diagram type per spec. Flowchart (M1) is the worked example: copy its shapes, not its history. Why the recipe looks like this: `v13/docs/retros/M1.md`.

Implementing a whole spec with one agent per ticket? Also read [orchestration.md](orchestration.md). This folder is the source of truth; the `port-diagram-v13` skill in `.claude/skills/` only points here. The rules for every change on this branch are in the root `AGENTS.md`.

## Ground truth (look it up, don't restate it)

| Need | Where |
| --- | --- |
| Requirements, design, decisions | `v13/docs/{REQUIREMENTS,DESIGN,DECISIONS}.md`. Cite R-ids and D-ids. |
| v12 source (deleted from the branch) | `git show fa796a943:packages/mermaid/src/diagrams/<type>/…`: the jison grammar, the DB, the renderer and the specs |
| v12 at runtime (the **oracle**) | the `mermaid-v12` dev dependency in `packages/conformance`. `src/oracle.ts` stubs DOMPurify so it parses in Node. |
| Plugin contract | `DiagramPlugin<M, L>` in `@mermaid-js/core` (DESIGN §12.1) |
| Worked example | `packages/diagram-flowchart` (`parser/`, `render/`, `grammar/`, `v12-specs/`) |
| Parity runner | `packages/conformance`: export the type's `DiagramAdapter` suite from `src/<type>/suite.ts` (`parity`); `src/registry.ts` finds it. The jison lexer oracle for every jison type is `loadJisonLexerOracle(type)` in `src/jison/oracle.ts` (D212). |
| Corpus | `e2e/diagrams/<type>/**/*.mmd` plus strings harvested from the v12 specs (`harvest <type>`, `corpus/<type>-v12-specs.json`) |
| Generators and gates | the `gen:*` / `check:*` scripts in the root `package.json`; `pnpm regen` runs every generator. `pnpm check` is the full gate. |
| Shared lists | none to edit: every shared table finds the type from its own files. Where each entry goes: [shared-files.md](shared-files.md). |

M3 types are all jison in v12: `sequence/parser/sequenceDiagram.jison`, `class/parser/classDiagram.jison`, `state/parser/stateDiagram.jison`, `er/parser/erDiagram.jison`.

## Ticket graph (one spec per type)

```
T0 core contract (only if the type needs new core primitives)
 └─> T1 lexer parity gate ─> T2 grammar + parser + model + AST ─> T3 layout ─> T4 renderer ─> T5 integration
                                                               └─> T6 language service (after T2)
```

- T0 lands before any other ticket of any type that depends on it. It is the only place a port edits shared core.
- A helper found copied in three diagram packages is promoted to core by a T0 ticket of its own, at a core subpath outside the core bundle (D557).
- Different types run in parallel. Within a type, T3 may start on hand-built fixtures while T2 runs.

## Steps

Each step is one ticket. Every ticket tests through the public seam, `createMermaid().render()` / `renderSync()`, except where a step names its own seam.

1. **T1: Lexer parity gate.** Write the hand-written lexer and the token-kind → jison-terminal mapping, and gate it against the v12 jison lexer over the corpus. Method: [parser-method.md](parser-method.md). **Done when** token names and images match v12 on 100% of the corpus and on the harvested spec strings, with any exclusion listed and justified in the spec file.
2. **T2: Grammar file, parser, model, AST.** Write `grammar/<type>.ebnf`, lexer section first, and wire `gen:grammar`. Port the rules close to one-to-one onto the gated token stream. Produce the model with semantic AST ids (DESIGN §4.2 scheme, adapted per type), symbols and statements. Add the type's suite (`packages/conformance/src/<type>/suite.ts`) and table rows (`src/<type>/tables.ts`), and port the v12 specs into `v12-specs/`. **Done when** oracle accept/reject and model parity are green over the corpus (every divergence listed with a reason), the grammar differential is green, the ported specs pass, the recovery set gives N diagnostics for N errors, and no message names a token or rule.
3. **T3: Layout.** Class, state and ER are graph diagrams: build a `LayoutGraph` and call `ctx.layout()`. Sequence is `layoutKind: 'custom'` with its own `L`. Measurement always happens before layout, using the injected measurer. **Done when** DDLT-style checks (no overlaps, no NaN, containment) pass on fixtures produced by the v13 parser.
4. **T4: Renderer.** Draw through `SvgWriter` only, with sizes and colours from theme tokens, so redux reads as one family with flowchart (R-THEME-11). Translate v12's theme-name sets, `look === 'neo'` branches and drop-shadow filters into theme variables: [theming.md](theming.md). Every element drawn from the AST gets `data-id` and `data-ast`. The only element ids are `${idPrefix}-title` and `-desc`. **Done when** the render properties (well-formed, `assertInert`, determinism, no NaN, bounding box) and the AST round-trip hold over the corpus, and each structural change from v12's SVG is listed in the type's MIGRATION fragment (`v13/docs/migration/<type>.md`).
5. **T5: Integration.** Add the manifest in the package's `package.json` and the package's `workspace.yaml` ([shared-files.md](shared-files.md)), then run `pnpm regen`: it writes the registry (v12's detector order comes from the generator), the dependency lists of every package that needs the type, the RELEASING row and the rest. Move the type's config keys from `pending` to `honoured`, add theme variables to the package's own table (only where redux and classic differ: [theming.md](theming.md)), and write `v13/docs/migration/<type>.md`. Add visual baseline fixtures under `e2e/diagrams/<type>/baseline/` for the gallery. The type stops being `UNSUPPORTED_DIAGRAM` once its manifest is in the generated registry; add a spec that its source now renders. **Done when** `pnpm check`, `pnpm e2e` and the bench run are green, and the handoff reports the bench load-path size for this type.

6. **T6: Language service (R-LANG-3).** Ship the `./language` facet and the shared golden suite for the type: [language.md](language.md) is the checklist. **Done when** the type has goldens for every required feature and the corpus property, rename round-trip and oracle specs are green.

## Rules every ticket follows

- **Add files; never edit a shared list.** A port adds `packages/diagram-<type>/` and per-type files in the shared packages' per-type folders. If a ticket seems to need a line in a shared file (a package list, a table row, a spec's type list), the place for it is in [shared-files.md](shared-files.md); if it is not there, ask instead of adding the line. Generated files are never edited or merged by hand: on a conflict, take either side and run `pnpm regen`.

Also read [pitfalls.md](pitfalls.md): what went wrong in the flowchart port, as rules per ticket.

- **Escalate decisions.** Anything that contradicts DESIGN, REQUIREMENTS or a D-id, or changes a v12 default or v12 semantics, stops and goes to the maintainer as a question. Implement the documented behaviour meanwhile. Record each answer as a D-id row in DECISIONS.md.
- **The oracle decides syntax.** When a v12 spec and the oracle disagree, the oracle wins and the spec gets a skip with a reason. Fix the parser, not the spec.
- **No theme names, no look.** A diagram package never checks a theme name or `look`; every family difference is a theme variable (D152, [theming.md](theming.md)).
- **Isolation.** A diagram package imports only from `@mermaid-js/core` subpaths. It never imports another diagram package.
- **Measure and report, don't optimise.** Every handoff states its gz size. Size work happens once, at milestone close.
- **Timing tests** assert ratios (best of N trials), never absolute times.
