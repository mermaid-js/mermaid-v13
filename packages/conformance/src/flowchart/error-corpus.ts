/**
 * Flowchart error corpus (DESIGN §11, R-ERR-2/5): sources v12 rejects, one mistake each unless
 * the name says otherwise. `errors.spec.ts` snapshots v12's message next to v13's diagnostics
 * for review; the bar is "clearly better than v12".
 */
export const FLOWCHART_ERRORS: [name: string, source: string][] = [
  ['missing header', 'A --> B'],
  ['unknown direction', 'graph XY\n  A --> B'],
  ['single-dash arrow', 'flowchart TD\n  A -> B'],
  ['fat arrow', 'flowchart TD\n  A => B'],
  ['dangling link', 'flowchart TD\n  A -->'],
  ['unclosed square label', 'flowchart TD\n  A[Start\n  B --> C'],
  ['unclosed round label', 'flowchart TD\n  A(Start --> B'],
  ['unclosed diamond', 'flowchart TD\n  A{Decide\n  B --> C'],
  ['unclosed edge label', 'flowchart TD\n  A -->|yes B\n  B --> C'],
  ['unclosed string', 'flowchart TD\n  A["Start] --> B'],
  ['unclosed markdown string', 'flowchart TD\n  A["`Start] --> B'],
  ['unclosed shape data', 'flowchart TD\n  A@{ shape: rect\n  B --> C'],
  ['brackets in an unquoted label', 'flowchart TD\n  A[Call f(x)] --> B'],
  ['quote inside a label', 'flowchart TD\n  A[say "hi"] --> B'],
  ['wrong closer', 'flowchart TD\n  A[Start) --> B'],
  ['missing end', 'flowchart TD\n  subgraph one\n    A --> B'],
  ['stray end', 'flowchart TD\n  A --> B\n  end'],
  ['style without styles', 'flowchart TD\n  A --> B\n  style A'],
  ['classDef without a name', 'flowchart TD\n  classDef\n  A'],
  ['class without a class', 'flowchart TD\n  A\n  class A'],
  ['click without a target', 'flowchart TD\n  A\n  click A\n\n  B'],
  ['linkStyle index out of range', 'flowchart TD\n  A --> B\n  linkStyle 3 stroke:red'],
  ['linkStyle without an index', 'flowchart TD\n  A --> B\n  linkStyle stroke:red'],
  ['unknown shape', 'flowchart TD\n  A@{ shape: blob }'],
  ['shape name in capitals', 'flowchart TD\n  A@{ shape: Rect }'],
  ['bad shape data YAML', 'flowchart TD\n  A@{ shape: [rect }'],
  ['a node after shape data', 'flowchart TD\n  A@{ shape: rect } B'],
  ['entity outside a label', 'flowchart TD\n  A#quot; --> B'],
  ['keyword as a node id', 'flowchart TD\n  A --> end'],
  ['two statements on a line', 'flowchart TD\n  A --> B C --> D'],
  ['three mistakes', 'flowchart TD\n  A -> B\n  C[open\n  D --> E\n  linkStyle 9 stroke:red'],
];
