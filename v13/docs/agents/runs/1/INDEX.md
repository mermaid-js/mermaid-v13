# M1 exploration notes: index

Spec `mermaid-js/mermaid-v13#1`, tickets #2–#24 (`gh issue view -R mermaid-js/mermaid-v13 <n>`). Collected 2026-11-02 at base commit `fa796a943` on branch `mermaid-v13`.
Domain docs: `/Users/knsv/repos/mermaid-v13/v13/docs/{DESIGN,REQUIREMENTS,DECISIONS}.md`. Research: `v13/docs/research/{pele,parser-and-tooling,mermaid-current,ondine,mermaid-ascii}.md`. `research/pele.md` already has many Pele line pointers.

| File | Topic | Main tickets |
|---|---|---|
| `01-v12-reference.md` | Reading v12 after deletion (`git show fa796a943:<path>`); flow.jison / FlowDB / shape list and messages / preprocess / detector order / schema / themes / sanitize-url / XSS pages / public API | #2, #5, #7, #8, #12, #13, #15 |
| `02-pele-port.md` | Pele files to port (YAML, unicode, chars, lexer, layered, compound, esc/num, label fast path, alias layer, url, measurer), license (MIT, kepano, no file headers), `const enum` clash, fuzz `corpus.ts`, Pele's own jison oracle, #8635/Pele bench fixtures | #5, #6, #8, #9, #10, #11, #12, #13, #17, #3 |
| `03-approaches-harness.md` | Bench harness structure, 158-diagram corpus and manifest, how Ready at / Loaded size / geomean are measured, how to run | #3 |
| `04-chevrotain-branch.md` | `/Users/knsv/repos/mermaid` branch `flowchart-chevrotain-parser` @ `700df567e`: flow.tokens.ts, lexer-parity spec, `flow.parse-corpus.spec.ts` (PARSE_FIXTURE_PATH), `flow.db-parity.spec.ts` (snapshotVertex/snapshotEdge) | #4, #8 |
| `05-repo-tooling.md` | pnpm workspace, vitest, eslint, cspell, husky/lint-staged, changesets, CI workflows, Playwright helpers, e2e `.mmd` fixture counts (400 flowchart) | #2, #18, #20 |
| `06-oracle-mermaid12-node.md` | `npm:mermaid@12.2.0` alias install (works); Node parse needs DOMPurify. jsdom is the only DOM that matches browser output; **stubbing `dompurify` gives a DOM-free oracle (verified)**; entity placeholders; call recipe | #4, #8 |
| `oracle-probe/` | Scripts from the 06 verification (`hooks.mjs`/`reg.mjs`/`purify-stub.mjs`, `u-*.mjs`) | #4 |

## Points that affect several tickets
- **v12 is removed from the working tree in #2.** Read it through git at `fa796a943`. The 158-diagram corpus and e2e `.mmd` fixtures must be committed or kept for #3, #4 and #18.
- **No DOM needed for the oracle**: alias `mermaid12` → `npm:mermaid@12.2.0` and resolve `dompurify` to an identity stub. With linkedom or happy-dom, label text differs from the browser (06).
- **v12 model text contains `encodeEntities` placeholders** (`ﬂ°quot¶ß`). The normaliser must decode them (01, 06).
- **v12 rewrites text before parsing** (`flowParser.ts`: `}\s*\n` → `}\n`; `preprocess.ts` `cleanupText`: CRLF→LF and `="x"`→`='x'` inside HTML tags). The v13 "no rewrites" preprocess (#5) has to reproduce these effects in the lexer and keep original offsets.
- **Pele's `const enum`s break this repo's `TSEnumDeclaration` lint**: convert them when porting.
- v12 defaults are `theme: 'default'` and `layout: 'elk'`. v13 defaults to redux (D55). The "frozen 12.2.0 dagre" bench baseline needs `layout: 'dagre'`.

## mermaid-ascii (M2): skipped
`/Users/knsv/repos/mermaid-ascii` @ `5a9df15` is a Go project (cmd/, Makefile, flake.nix). It is not relevant to M1. See `v13/docs/research/mermaid-ascii.md` when M2 starts.
- 07-parser-method.md: tokenizer-first method (lexer-parity gate vs v12 jison before grammar) — mandatory for #8, #21 and any parser work
