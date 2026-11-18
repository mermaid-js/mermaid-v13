# Flowchart errors: v12 and v13

## missing header

```mermaid
A --> B
```

v12:

```text
No diagram type detected matching given configuration for text: A --> B
```

v13:

```text
Error at line 1, column 1: Expected `graph` or `flowchart`, got `A`; a flowchart starts with `flowchart` or `graph` and a direction.
1 | A --> B
  | ^
Expected: `graph` or `flowchart`
```

## unknown direction

```mermaid
graph XY
  A --> B
```

v12:

```text
Lexical error on line 1. Unrecognized text.
graph XY  A --> B
-----^
```

v13:

```text
Error at line 1, column 7: Unknown direction `XY`: use TB, TD, BT, LR or RL (or `>`, `<`, `^`, `v`).
1 | graph XY
  |       ^^
Expected: a direction such as `TD` or `LR`
```

## single-dash arrow

```mermaid
flowchart TD
  A -> B
```

v12:

```text
Parse error on line 2:
flowchart TD  A -> B
----------------^
Expecting 'SEMI', 'NEWLINE', 'EOF', 'AMP', 'START_LINK', 'LINK', 'LINK_ID', got 'MINUS'
```

v13:

```text
Error at line 2, column 5: Expected a line break or `;` or the end of the text, got `-`; links are written like `-->`, `---`, `-.->`, `==>` or `~~~`.
2 |   A -> B
  |     ^
Expected: a line break or `;`, the end of the text
```

## fat arrow

```mermaid
flowchart TD
  A => B
```

v12:

```text
Lexical error on line 2. Unrecognized text.
flowchart TD  A => B
----------------^
```

v13:

```text
Error at line 2, column 5: Unexpected character `=`; links are written like `-->`, `---`, `-.->`, `==>` or `~~~`.
2 |   A => B
  |     ^
Expected: a line break or `;`, the end of the text
```

## dangling link

```mermaid
flowchart TD
  A -->
```

v12:

```text
Parse error on line 3:
...lowchart TD  A -->
---------------------^
Expecting 'AMP', 'COLON', 'PIPE', 'TESTSTR', 'DOWN', 'DEFAULT', 'NUM', 'COMMA', 'NODE_STRING', 'BRKT', 'MINUS', 'MULT', 'UNICODE_TEXT', got 'EOF'
```

v13:

```text
Error at line 2, column 8: Expected a node id, got the end of the text.
2 |   A -->
  |        ^
Expected: a node id
```

## unclosed square label

```mermaid
flowchart TD
  A[Start
  B --> C
```

v12:

```text
Parse error on line 4:
...  A[Start  B --> C
---------------------^
Expecting 'SQE', 'DOUBLECIRCLEEND', 'PE', '-)', 'STADIUMEND', 'SUBROUTINEEND', 'PIPE', 'CYLINDEREND', 'DIAMOND_STOP', 'TAGEND', 'TRAPEND', 'INVTRAPEND', 'UNICODE_TEXT', 'TEXT', 'TAGSTART', got '1'
```

v13:

```text
Error at line 2, column 4: Unclosed node label: the `[` at line 2 has no closing `]`. Add `]` to close it.
2 |   A[Start
  |    ^
Expected: label text, `]`
Note at line 3, column 10: The text ends here.
3 |   B --> C
  |          ^
```

## unclosed round label

```mermaid
flowchart TD
  A(Start --> B
```

v12:

```text
Parse error on line 3:
... TD  A(Start --> B
---------------------^
Expecting 'SQE', 'DOUBLECIRCLEEND', 'PE', '-)', 'STADIUMEND', 'SUBROUTINEEND', 'PIPE', 'CYLINDEREND', 'DIAMOND_STOP', 'TAGEND', 'TRAPEND', 'INVTRAPEND', 'UNICODE_TEXT', 'TEXT', 'TAGSTART', got '1'
```

v13:

```text
Error at line 2, column 4: Unclosed node label: the `(` at line 2 has no closing `)`. Add `)` to close it.
2 |   A(Start --> B
  |    ^
Expected: label text, `)`
Note at line 2, column 16: The text ends here.
2 |   A(Start --> B
  |                ^
```

## unclosed diamond

```mermaid
flowchart TD
  A{Decide
  B --> C
```

v12:

```text
Parse error on line 4:
... A{Decide  B --> C
---------------------^
Expecting 'SQE', 'DOUBLECIRCLEEND', 'PE', '-)', 'STADIUMEND', 'SUBROUTINEEND', 'PIPE', 'CYLINDEREND', 'DIAMOND_STOP', 'TAGEND', 'TRAPEND', 'INVTRAPEND', 'UNICODE_TEXT', 'TEXT', 'TAGSTART', got '1'
```

v13:

```text
Error at line 2, column 4: Unclosed node label: the `{` at line 2 has no closing `}`. Add `}` to close it.
2 |   A{Decide
  |    ^
Expected: label text, `}`
Note at line 3, column 10: The text ends here.
3 |   B --> C
  |          ^
```

## unclosed edge label

```mermaid
flowchart TD
  A -->|yes B
  B --> C
```

v12:

```text
Parse error on line 4:
...-->|yes B  B --> C
---------------------^
Expecting 'SQE', 'DOUBLECIRCLEEND', 'PE', '-)', 'STADIUMEND', 'SUBROUTINEEND', 'PIPE', 'CYLINDEREND', 'DIAMOND_STOP', 'TAGEND', 'TRAPEND', 'INVTRAPEND', 'UNICODE_TEXT', 'TEXT', 'TAGSTART', got '1'
```

v13:

```text
Error at line 2, column 8: Unclosed edge label: the `|` at line 2 has no closing `|`. Add `|` to close it.
2 |   A -->|yes B
  |        ^
Expected: label text, `|`
Note at line 3, column 10: The text ends here.
3 |   B --> C
  |          ^
```

## unclosed string

```mermaid
flowchart TD
  A["Start] --> B
```

v12:

```text
Parse error on line 3:
...D  A["Start] --> B
---------------------^
Expecting 'SQE', 'DOUBLECIRCLEEND', 'PE', '-)', 'STADIUMEND', 'SUBROUTINEEND', 'PIPE', 'CYLINDEREND', 'DIAMOND_STOP', 'TAGEND', 'TRAPEND', 'INVTRAPEND', 'UNICODE_TEXT', 'TEXT', 'TAGSTART', got '1'
```

v13:

```text
Error at line 2, column 5: Unclosed string: the string opened at line 2 has no closing quote.
2 |   A["Start] --> B
  |     ^
Note at line 2, column 18: The text ends here.
2 |   A["Start] --> B
  |                  ^
```

## unclosed markdown string

```mermaid
flowchart TD
  A["`Start] --> B
```

v12:

```text
Parse error on line 3:
...  A["`Start] --> B
---------------------^
Expecting 'SQE', 'DOUBLECIRCLEEND', 'PE', '-)', 'STADIUMEND', 'SUBROUTINEEND', 'PIPE', 'CYLINDEREND', 'DIAMOND_STOP', 'TAGEND', 'TRAPEND', 'INVTRAPEND', 'UNICODE_TEXT', 'TEXT', 'TAGSTART', got '1'
```

v13:

```text
Error at line 2, column 5: Unclosed markdown string: the string opened at line 2 has no closing backtick and quote.
2 |   A["`Start] --> B
  |     ^^
Note at line 2, column 19: The text ends here.
2 |   A["`Start] --> B
  |                   ^
```

## unclosed shape data

```mermaid
flowchart TD
  A@{ shape: rect
  B --> C
```

v12:

```text
Parse error on line 4:
...ape: rect  B --> C
---------------------^
Expecting 'SEMI', 'NEWLINE', 'SPACE', 'EOF', 'SHAPE_DATA', 'START_LINK', 'LINK', 'LINK_ID', got '1'
```

v13:

```text
Error at line 2, column 4: Unclosed shape data: the `@{` at line 2 has no closing `}`. Add `}` to close it.
2 |   A@{ shape: rect
  |    ^^
Expected: `}`
Note at line 3, column 10: The text ends here.
3 |   B --> C
  |          ^
```

## brackets in an unquoted label

```mermaid
flowchart TD
  A[Call f(x)] --> B
```

v12:

```text
Parse error on line 2:
...wchart TD  A[Call f(x)] --> B
----------------------^
Expecting 'SQE', 'DOUBLECIRCLEEND', 'PE', '-)', 'STADIUMEND', 'SUBROUTINEEND', 'PIPE', 'CYLINDEREND', 'DIAMOND_STOP', 'TAGEND', 'TRAPEND', 'INVTRAPEND', 'UNICODE_TEXT', 'TEXT', 'TAGSTART', got 'PS'
```

v13:

```text
Error at line 2, column 11: Expected label text or `]`, got `(`; to use brackets in a label, put it in quotes, e.g. `A["a (b)"]`.
2 |   A[Call f(x)] --> B
  |           ^
Expected: label text, `]`
```

## quote inside a label

```mermaid
flowchart TD
  A[say "hi"] --> B
```

v12:

```text
Parse error on line 2:
...owchart TD  A[say "hi"] --> B
----------------------^
Expecting 'SQE', 'DOUBLECIRCLEEND', 'PE', '-)', 'STADIUMEND', 'SUBROUTINEEND', 'PIPE', 'CYLINDEREND', 'DIAMOND_STOP', 'TAGEND', 'TRAPEND', 'INVTRAPEND', 'UNICODE_TEXT', 'TEXT', 'TAGSTART', got 'STR'
```

v13:

```text
Error at line 2, column 9: Expected label text or `]`, got `"hi"`; to use quotes in a label, quote it all and write them as `#quot;`, e.g. `A["say #quot;hi#quot;"]`.
2 |   A[say "hi"] --> B
  |         ^^^^
Expected: label text, `]`
```

## wrong closer

```mermaid
flowchart TD
  A[Start) --> B
```

v12:

```text
Parse error on line 2:
...owchart TD  A[Start) --> B
----------------------^
Expecting 'SQE', 'TAGEND', 'UNICODE_TEXT', 'TEXT', 'TAGSTART', got 'PE'
```

v13:

```text
Error at line 2, column 10: Expected label text or `]`, got `)`; to use brackets in a label, put it in quotes, e.g. `A["a (b)"]`.
2 |   A[Start) --> B
  |          ^
Expected: label text, `]`
```

## missing end

```mermaid
flowchart TD
  subgraph one
    A --> B
```

v12:

```text
Parse error on line 4:
...aph one    A --> B
---------------------^
Expecting 'SEMI', 'NEWLINE', 'SPACE', 'EOF', 'subgraph', 'end', 'acc_title', 'acc_descr', 'acc_descr_multiline_value', 'AMP', 'COLON', 'STYLE', 'LINKSTYLE', 'CLASSDEF', 'CLASS', 'CLICK', 'DOWN', 'DEFAULT', 'NUM', 'COMMA', 'NODE_STRING', 'BRKT', 'MINUS', 'MULT', 'UNICODE_TEXT', 'direction_tb', 'direction_bt', 'direction_rl', 'direction_lr', 'direction_td', got '1'
```

v13:

```text
Error at line 2, column 3: Unclosed subgraph: the subgraph opened at line 2 has no `end`. Add `end` to close it.
2 |   subgraph one
  |   ^^^^^^^^
Note at line 3, column 12: The text ends here.
3 |     A --> B
  |            ^
```

## stray end

```mermaid
flowchart TD
  A --> B
  end
```

v12:

```text
Parse error on line 3:
...hart TD  A --> B  end
---------------------^
Expecting 'SEMI', 'NEWLINE', 'SPACE', 'EOF', 'subgraph', 'acc_title', 'acc_descr', 'acc_descr_multiline_value', 'AMP', 'COLON', 'STYLE', 'LINKSTYLE', 'CLASSDEF', 'CLASS', 'CLICK', 'DOWN', 'DEFAULT', 'NUM', 'COMMA', 'NODE_STRING', 'BRKT', 'MINUS', 'MULT', 'UNICODE_TEXT', 'direction_tb', 'direction_bt', 'direction_rl', 'direction_lr', 'direction_td', got 'end'
```

v13:

```text
Error at line 3, column 3: Unexpected `end`: there is no open subgraph to close. Remove it, or add a `subgraph` above.
3 |   end
  |   ^^^
```

## style without styles

```mermaid
flowchart TD
  A --> B
  style A
```

v12:

```text
Parse error on line 3:
...  A --> B  style A
---------------------^
Expecting 'SPACE', 'AMP', 'COLON', 'DOWN', 'DEFAULT', 'NUM', 'COMMA', 'NODE_STRING', 'BRKT', 'MINUS', 'MULT', 'UNICODE_TEXT', got 'NEWLINE'
```

v13:

```text
Error at line 3, column 10: Expected a space, got a line break; write it as `style <node id> <styles>`, e.g. `style A fill:#f9f,stroke:#333`.
3 |   style A
  |          ^
Expected: a space
```

## classDef without a name

```mermaid
flowchart TD
  classDef
  A
```

v12:

```text
Parse error on line 2:
...wchart TD  classDef  A
----------------------^
Expecting 'SPACE', got 'NEWLINE'
```

v13:

```text
Error at line 2, column 11: Expected a space, got a line break; write it as `classDef <name> <styles>`, e.g. `classDef hot fill:#f96`.
2 |   classDef
  |           ^
Expected: a space
```

## class without a class

```mermaid
flowchart TD
  A
  class A
```

v12:

```text
Parse error on line 3:
...art TD  A  class A
---------------------^
Expecting 'SPACE', 'AMP', 'COLON', 'DOWN', 'DEFAULT', 'NUM', 'COMMA', 'NODE_STRING', 'BRKT', 'MINUS', 'MULT', 'UNICODE_TEXT', got 'NEWLINE'
```

v13:

```text
Error at line 3, column 10: Expected a space, got a line break; write it as `class <node ids> <class name>`, e.g. `class A,B hot`.
3 |   class A
  |          ^
Expected: a space
```

## click without a target

```mermaid
flowchart TD
  A
  click A

  B
```

v12:

```text
Parse error on line 3:
...rt TD  A  click A  B
--------------------^
Expecting 'DIR', 'AMP', 'COLON', 'STR', 'DOWN', 'CALLBACKNAME', 'HREF', 'NUM', 'COMMA', 'NODE_STRING', 'BRKT', 'MINUS', 'MULT', 'UNICODE_TEXT', got 'NEWLINE'
```

v13:

```text
Error at line 4, column 1: Expected a node id, got a line break; write it as `click <node id> <callback>` or `click <node id> "<url>"`, e.g. `click A "https://example.com"`.
4 | 
  | ^
Expected: a node id
```

## linkStyle index out of range

```mermaid
flowchart TD
  A --> B
  linkStyle 3 stroke:red
```

v12:

```text
Cannot set properties of undefined (setting 'style')
```

v13:

```text
Error at line 3, column 3: linkStyle 3 refers to a link that does not exist: there is 1 link above it, number 0.
3 |   linkStyle 3 stroke:red
  |   ^^^^^^^^^^^^^^^^^^^^^^
```

## linkStyle without an index

```mermaid
flowchart TD
  A --> B
  linkStyle stroke:red
```

v12:

```text
Parse error on line 3:
...A --> B  linkStyle stroke:red
----------------------^
Expecting 'DEFAULT', 'NUM', got 'NODE_STRING'
```

v13:

```text
Error at line 3, column 13: Expected a link number such as `0` or a node id, got `stroke`; write it as `linkStyle <link numbers or default> <styles>`, e.g. `linkStyle 0,1 stroke:red`.
3 |   linkStyle stroke:red
  |             ^^^^^^
Expected: a link number such as `0`, a node id
```

## unknown shape

```mermaid
flowchart TD
  A@{ shape: blob }
```

v12:

```text
No such shape: blob.
```

v13:

```text
Error at line 2, column 4: No such shape: blob.
2 |   A@{ shape: blob }
  |    ^^^^^^^^^^^^^^^^
```

## shape name in capitals

```mermaid
flowchart TD
  A@{ shape: Rect }
```

v12:

```text
No such shape: Rect. Shape names should be lowercase.
```

v13:

```text
Error at line 2, column 4: No such shape: Rect. Shape names should be lowercase.
2 |   A@{ shape: Rect }
  |    ^^^^^^^^^^^^^^^^
```

## bad shape data YAML

```mermaid
flowchart TD
  A@{ shape: [rect }
```

v12:

```text
missed comma between flow collection entries (3:1)

 1 | {
 2 |  shape: [rect 
 3 | }
-----^
```

v13:

```text
Error at line 2, column 20: Invalid YAML: missed comma between flow collection entries.
2 |   A@{ shape: [rect }
  |                    ^
```

## a node after shape data

```mermaid
flowchart TD
  A@{ shape: rect } B
```

v12:

```text
Parse error on line 2:
...  A@{ shape: rect } B
-----------------------^
Expecting 'AMP', got 'NODE_STRING'
```

v13:

```text
Error at line 2, column 21: Expected a line break or `;` or the end of the text, got `B`; put each statement on its own line, or separate them with `;`.
2 |   A@{ shape: rect } B
  |                     ^
Expected: a line break or `;`, the end of the text
```

## entity outside a label

```mermaid
flowchart TD
  A#quot; --> B
```

v12:

```text
Lexical error on line 2. Unrecognized text.
flowchart TD  Aﬂ°quot¶ß --> B
----------------^
```

v13:

```text
Error at line 2, column 4: Entities such as `#quot;` work only inside labels: put the text in a label, e.g. `A["#quot;"]`.
2 |   A#quot; --> B
  |    ^
```

## keyword as a node id

```mermaid
flowchart TD
  A --> end
```

v12:

```text
Parse error on line 2:
...lowchart TD  A --> end
----------------------^
Expecting 'AMP', 'COLON', 'PIPE', 'TESTSTR', 'DOWN', 'DEFAULT', 'NUM', 'COMMA', 'NODE_STRING', 'BRKT', 'MINUS', 'MULT', 'UNICODE_TEXT', got 'end'
```

v13:

```text
Error at line 2, column 9: Expected a node id, got `end`; `end` is a keyword: use another node id, and `end` as its label if needed, e.g. `X[end]`.
2 |   A --> end
  |         ^^^
Expected: a node id
```

## two statements on a line

```mermaid
flowchart TD
  A --> B C --> D
```

v12:

```text
Parse error on line 2:
...wchart TD  A --> B C --> D
----------------------^
Expecting 'SEMI', 'NEWLINE', 'EOF', 'AMP', 'START_LINK', 'LINK', 'LINK_ID', got 'NODE_STRING'
```

v13:

```text
Error at line 2, column 11: Expected a line break or `;` or the end of the text, got `C`; put each statement on its own line, or separate them with `;`.
2 |   A --> B C --> D
  |           ^
Expected: a line break or `;`, the end of the text
```

## three mistakes

```mermaid
flowchart TD
  A -> B
  C[open
  D --> E
  linkStyle 9 stroke:red
```

v12:

```text
Parse error on line 2:
flowchart TD  A -> B  C[open  D --
----------------^
Expecting 'SEMI', 'NEWLINE', 'EOF', 'AMP', 'START_LINK', 'LINK', 'LINK_ID', got 'MINUS'
```

v13:

```text
Error at line 2, column 5: Expected a line break or `;` or the end of the text, got `-`; links are written like `-->`, `---`, `-.->`, `==>` or `~~~`.
2 |   A -> B
  |     ^
Expected: a line break or `;`, the end of the text

Error at line 3, column 4: Unclosed node label: the `[` at line 3 has no closing `]`. Add `]` to close it.
3 |   C[open
  |    ^
Expected: label text, `]`
Note at line 5, column 25: The text ends here.
5 |   linkStyle 9 stroke:red
  |                         ^

Error at line 5, column 3: linkStyle 9 refers to a link that does not exist: there is 1 link above it, number 0.
5 |   linkStyle 9 stroke:red
  |   ^^^^^^^^^^^^^^^^^^^^^^
```
