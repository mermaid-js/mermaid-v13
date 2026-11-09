# Parser method: tokenizer first

This is the maintainer's method from the jison→Chevrotain migrations, adapted for v13's hand-written lexers and recursive-descent parsers. In M1 it took the flowchart parser from stalled to 762/762 parity. Use it for every port.

## 1. Lexer-parity gate before any grammar

Make the hand-written lexer emit the same token stream as the v12 jison lexer, matching terminal **name + image**. Get it 100% green over the corpus before writing or debugging a single grammar rule. A token-level divergence is easy to see at this stage. Found later, it shows up as a baffling parse error far from its cause.

- **Getting the v12 token stream.** For a jison type, use the shared oracle (D212): `loadJisonLexerOracle(type)` in `packages/conformance/src/jison/oracle.ts`. Its `tokens(source)` runs v12's own lexer on the exact text v12's parser received (`lexedText(source)`), decodes symbol numbers through `parser.terminals_`, drops jison's `$end`, ends the stream with `LEXICAL_ERROR` where jison threw, and takes v12's appended `\n` off the token that matched it (off none when a skipped rule took it). A new jison type exports its descriptor as `jison` from `src/<type>/tables.ts` (gathered into `JISON_TYPES`): a probe diagram, its e2e directories, how to harvest its v12 specs, and a `yy` builder only when its lexer actions need more than a fresh DB (state's `yy.lexer`). Langium types gate on v12's Chevrotain tokens instead (D213).
- **The comparison.** Map each v13 token kind to the jison terminal it stands for. Where jison emits one terminal from several rules, map several v13 kinds to that one name. Assert the two arrays are deep-equal.
- **Corpus.** Use the e2e `.mmd` files for the type plus strings harvested from v12's specs and syntax page. `pnpm --filter @mermaid-js/conformance harvest <type>` writes `corpus/<type>-v12-specs.json` from the type's descriptor (string literals by regex, `+` chains, or running the spec with stubs and recording each `parse` argument). Commit it; `src/jison/harvest.spec.ts` fails when the committed corpus and the CLI's output drift apart.
- **Build up in order.** Start with the common path, then the type's core statements, then strings and labels, then the exotic lexer modes. Keep the gate green after each step.
- **Learn jison's matching empirically.**
  - The first rule in order wins; there is no longest match.
  - Keyword literals compile with a trailing `\b`.
  - A punctuation character that is also an identifier character is tried before the identifier rule.
  - `<*>` rules apply in every mode, but some openers are INITIAL-only.
  - When in doubt, dump v12's tokens for that exact input and copy what it does.
- **Empty-image tokens.** jison can emit them (empty values, cleared `yytext`). Decide per case how v13 represents them, and record the decision as a gate exclusion.

## 2. Grammar file and parser

Write the EBNF lexer section first and check it against the same gated stream. Then port the grammar rules close to one-to-one onto that stream.

## 3. Parity traps the specs miss

- **Value conversion.** Reproduce the conversion that actually runs in v12 (escapes, trimming, entity placeholders), not the one the grammar seems to describe.
- **Statement terminators** are part of the contract. Model newlines and `;` structurally, and treat end of input as a terminator.
- **Terminal regexes** are ported faithfully: number forms, lookahead guards, keyword boundaries. They must also pass the no-nested-quantifier lint (R-PARSE-7).
- **Semantic errors** (bad YAML, a bad index) record a diagnostic and let the statement continue, so a later syntax error in it still gets reported (R-PARSE-4).

## 4. File layout

Use `tokens.ts` (kinds and names), `lexer.ts`, `parser.ts` (split sub-grammars into rule modules as it grows), `model.ts` and `normalise.ts`. Tables and the parser are built once at module scope; there is no module-level mutable state.
