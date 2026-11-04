/**
 * State error corpus (DESIGN §11, R-ERR-2/5): sources v12 rejects, one mistake each unless the
 * name says otherwise. `errors.spec.ts` snapshots v12's message next to v13's diagnostics for
 * review; the bar is "clearly better than v12".
 */
export const STATE_ERRORS: [name: string, source: string][] = [
  ['missing header', 'A --> B'],
  ['dangling arrow', 'stateDiagram-v2\n  A -->'],
  ['arrow without a source', 'stateDiagram-v2\n  --> B'],
  ['single-dash arrow', 'stateDiagram-v2\n  A -> B'],
  ['description without a state', 'stateDiagram-v2\n  : waiting'],
  ['multi-word state name', 'stateDiagram-v2\n  state Big State {\n    A\n  }'],
  ['described state without as', 'stateDiagram-v2\n  state "Waiting for input"\n  A'],
  ['unclosed composite', 'stateDiagram-v2\n  state Outer {\n    A --> B'],
  ['brace after a plain id', 'stateDiagram-v2\n  Outer {\n    A\n  }'],
  ['classDef default', 'stateDiagram-v2\n  classDef default fill:#f96'],
  ['style without ids', 'stateDiagram-v2\n  style "A" fill:red'],
  ['class without ids', 'stateDiagram-v2\n  class "A" hot'],
  ['note without a side', 'stateDiagram-v2\n  note A : hi'],
  ['note with no end note', 'stateDiagram-v2\n  note left of A\n    some text'],
  ['scale without width', 'stateDiagram-v2\n  scale 300\n  A'],
  ['click without a url', 'stateDiagram-v2\n  A\n  click A'],
  ['click with text after it', 'stateDiagram-v2\n  A\n  click A "https://example.com" "tip" B'],
  ['stray quoted string', 'stateDiagram-v2\n  "A" --> B'],
  ['default as a statement', 'stateDiagram-v2\n  default --> A'],
  [
    'composite with two descriptions',
    'stateDiagram-v2\n  state "One" as X {\n    A\n  }\n  X : Two',
  ],
  ['three mistakes', 'stateDiagram-v2\n  A -> B\n  state c d {\n  }\n  E -->\n  F --> G'],
];
