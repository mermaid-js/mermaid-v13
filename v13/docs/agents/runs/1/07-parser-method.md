# Parser method: tokenizer first (from the maintainer's jison→Chevrotain migration recipe)

Adapted for v13's hand-written lexer + recursive-descent parser. The maintainer reports this order worked "with great success"; follow it for #8 and every later diagram port.

## 1. Lexer-parity gate BEFORE the grammar (highest payback step)

Get the hand-written lexer to emit the same token stream as the v12 jison lexer (terminal **name + image**) over a broad corpus, 100% green, before writing or debugging grammar rules. A token-level divergence is trivial to see here; later it shows up as a baffling parse error far from its cause.

- **Legacy token stream (jison oracle):** `parser.lexer.setInput(text, yy)`, then loop `parser.lexer.lex()`. It returns parser symbol numbers: decode via `parser.terminals_`; some rules return the raw string. Drop the trailing `EOF`/`$end` (token 1). `yy` must be a real FlowDB instance (lexer actions call it, e.g. `yy.lex.firstGraph()`). Get the jison parser from the `mermaid-v12` dev dependency (see notes 06 for the DOMPurify stub; #10 imported internals from a mermaid@12 chunk), or rebuild it from `git show fa796a943:packages/mermaid/src/diagrams/flowchart/parser/flow.jison` with the `jison` package as a devDependency of conformance (dev-only oracle is allowed, R-PARSE-1).
- **Compare name + image.** Map each v13 token kind to the jison terminal name it stands for. Where jison emits one terminal from several rules (`LINK`, `EDGE_TEXT`, `TEXT`), map several v13 kinds to that one name for the comparison. Assert deep-equal arrays.
- **Corpus:** the e2e `.mmd` flowchart fixtures plus strings harvested from the v12 flowchart specs: regex the `parse('…')` / ``parse(`…`)`` arguments out of `git show fa796a943:packages/mermaid/src/diagrams/flowchart/parser/*.spec.js`, decode JS escapes. Hundreds of real inputs for free. Skip inputs that hit a documented, deliberate deviation.
- **Build incrementally:** common path → node shapes → edges → strings/labels → the exotic lexer modes; keep the gate green at each step.
- **Learn jison's matching empirically, don't assume:** jison's default lexer is first-match in rule order, not longest-match, and keyword literals compile with a trailing `\b` (`^(?:graph\b)`). A single-char punctuation that is also an identifier char (`#`, `&`, `*`) is tried before the identifier rule. When unsure, dump the jison tokens for that exact input and copy what it does.
- `<*>` (all-states) jison rules apply in every mode, but some openers are INITIAL-only and must not leak into label/text modes.
- jison can emit empty-image tokens (an empty acc value, a `@{` opener with cleared `yytext`). Decide per case how v13 represents them and document it in the gate's exclusions.

Only then port the grammar rules, near 1:1 against flow.jison, consuming that token stream.

## 2. Parity traps the specs don't catch

A parser can pass every spec and still diverge from v12 on untested inputs. Check against v12's actual runtime behaviour (the conformance oracle), not against what the grammar file seems to say.

- **Value conversion:** reproduce the conversion that actually runs (escapes, trimming, entity handling), not the one that looks authoritative.
- **Statement terminators are part of the contract.** Model newlines/`;` structurally where jison requires them. Skipping them accepts a superset (two statements on one line) that specs can't catch. Treat end of input as a terminator.
- **Port the jison terminal regexes faithfully** (number forms, lookahead guards, keyword boundaries). Diff your patterns against the `.jison` terminals. Regexes must still pass the no-nested-quantifier lint (R-PARSE-7).

## 3. Keep the v12 specs as the oracle

The ported v12 flowchart specs (R-TEST-3) assert on model state: fix the parser, not the specs. Use the db-parity conformance suite (#4) for "passes specs but diverges" bugs.

## 4. File layout

Keep files small and single-purpose: `tokens.ts` (kinds + names), `lexer.ts`, `lexer.parity.spec.ts`, `parser.ts` (split sub-grammars into rule modules if it grows), `model.ts`, `normalise.ts`. One lexer table/parser at module scope, built once, with no per-call construction and no module-level mutable state.
