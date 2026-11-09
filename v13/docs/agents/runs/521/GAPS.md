# Gaps: block port (#521)

Unmet criteria and choices the spec and D-ids leave open, by owning ticket.

## All tickets

- Pele (`/Users/knsv/repos/pele`) is not on AI-Max, so its block reference (spec "Further Notes", D442, D443, D445) cannot be read. Tickets follow the spec's description of Pele's behaviour and v12 everywhere else.

## T0 #552

- Done in its own PR into `mermaid-v13`. Rows get `usedBy` `['flowchart']`; T4 adds `'block'` to each row it reads.

## T1 #553

- v12's entity placeholders (`#name;` → `ﬂ°name¶ß`) are not emulated in the lexed text: no `block.jison` rule stops at a `#` or `;` where it would not stop at the placeholder's characters (both are id, string and rest-of-line characters, neither is `\w` or `\s`), and `cook` decodes entities in token text. Tag-attribute quotes (`="x"` → `='x'`) are emulated, as venn does.
- `columns auto` sets jison's image to the number `-1`; v13's token text is the string `-1`, and the gate compares `String(image)`.
- Edge rule `\s*\~\~[\~]+\s*` is dead in v12 (the id rule comes first and takes `~`), so the lexer has no rule for it; `~~~` is a `NODE_ID` (cases `id-tildes`).
- Blanks and line breaks are no token (block has no `NL`; `[\s]+` skips them). T2 reads statement boundaries from the grammar, not from line breaks, as v12 does.
- No probe/mode output yet (`lex` has no `modeAt`): T6 adds it when the facet needs the start condition.
- Gate exclusion: `block-cases/unclosed-directive-1` (core's directive reading, as cynefin, pie and venn).

## T2 #554

## T3 #555

## T4 #556

## T5 #558

## T6 #557

## T7 #559
