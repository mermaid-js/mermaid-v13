# Gaps: block port (#521)

Unmet criteria and choices the spec and D-ids leave open, by owning ticket.

## All tickets

- Pele (`/Users/knsv/repos/pele`) is not on AI-Max, so its block reference (spec "Further Notes", D442, D443, D445) cannot be read. Tickets follow the spec's description of Pele's behaviour and v12 everywhere else.

- Follow-up (programme level, not this port): the lexer's source-mapping helpers (`v12Text`, `adjacent`, `placeholders`, `view`, `trivia`, `emit`, `dropAt`, `spaces`) are a third copy of venn's and kanban's (review of #553). A parser-kit home for them is a separate change.

## T0 #552

- Done in its own PR into `mermaid-v13`. Rows get `usedBy` `['flowchart']`; T4 adds `'block'` to each row it reads.

## T1 #553

- v12's entity placeholders (`#name;` → `ﬂ°name¶ß`) are not emulated in the lexed text: no `block.jison` rule stops at a `#` or `;` where it would not stop at the placeholder's characters (both are id, string and rest-of-line characters, neither is `\w` or `\s`), and `cook` decodes entities in token text. Tag-attribute quotes (`="x"` → `='x'`) are emulated, as venn does.
- `columns auto` sets jison's image to the number `-1`; v13's token text is the string `-1`, and the gate compares `String(image)`.
- Edge rule `\s*\~\~[\~]+\s*` is dead in v12 (the id rule comes first and takes `~`), so the lexer has no rule for it; `~~~` is a `NODE_ID` (cases `id-tildes`).
- Blanks and line breaks are no token (block has no `NL`; `[\s]+` skips them). T2 reads statement boundaries from the grammar, not from line breaks, as v12 does.
- No probe/mode output yet (`lex` has no `modeAt`): T6 adds it when the facet needs the start condition.
- Gate exclusion: `block-cases/unclosed-directive-1` (core's directive reading, as cynefin, pie and venn).
- Gate skips (v12 lexes no block, asserted in the spec): `block-cases/header-upper-case` and its six variants (`Block` fails the case-sensitive detector `/^\s*block(-beta)?/`; T2 rejects it the same way). No other source is skipped: the commented variant (`blockCommented`) cuts a short body after its header instead of through it, so those copies are compared too.
- No plugin object exists yet (`src/index.ts` exports the lexer only), so `layoutKind: 'custom'` is not declared anywhere: it lands with the plugin object, when T2/T3 first add one and at the latest in T5 with the manifest.

## T2 #554

## T3 #555

## T4 #556

## T5 #558

- Declare `layoutKind: 'custom'` on the plugin object if T2/T3 have not (T1 has no plugin object).

## T6 #557

## T7 #559
