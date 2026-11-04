/**
 * ER error corpus (DESIGN §11, R-ERR-2/5): sources v12 rejects, one mistake each unless the
 * name says otherwise. `errors.spec.ts` snapshots v12's message next to v13's diagnostics for
 * review; the bar is "clearly better than v12".
 */
export const ER_ERRORS: [name: string, source: string][] = [
  ['missing label', 'erDiagram\n  CUSTOMER ||--o{ ORDER'],
  ['missing cardinality', 'erDiagram\n  CUSTOMER --o{ ORDER : places'],
  ['single-dash line', 'erDiagram\n  CUSTOMER ||-o{ ORDER : places'],
  ['cardinality word as a label', 'erDiagram\n  CUSTOMER ||--o{ ORDER : one'],
  ['missing end of a relationship', 'erDiagram\n  CUSTOMER ||--o{ : places'],
  ['unclosed attribute block', 'erDiagram\n  CUSTOMER {\n    string name\n  ORDER'],
  ['attribute without a name', 'erDiagram\n  CUSTOMER {\n    string\n  }'],
  ['key without a separator', 'erDiagram\n  CUSTOMER {\n    string id PK FK\n  }'],
  ['unclosed alias', 'erDiagram\n  CUSTOMER[Customer\n  ORDER'],
  ['missing end', 'erDiagram\n  subgraph Shop\n    CUSTOMER'],
  ['stray end', 'erDiagram\n  CUSTOMER\n  end'],
  ['subgraph without an id', 'erDiagram\n  subgraph\n    CUSTOMER\n  end'],
  ['style without styles', 'erDiagram\n  CUSTOMER\n  style CUSTOMER'],
  ['style with a dot', 'erDiagram\n  CUSTOMER\n  style CUSTOMER stroke-width:1.5px'],
  ['class without a class', 'erDiagram\n  CUSTOMER\n  class CUSTOMER'],
  ['classes without a name', 'erDiagram\n  CUSTOMER:::'],
  ['unclosed description', 'erDiagram\n  accDescr {\n    A shop\n  CUSTOMER'],
  ['keyword as a name', 'erDiagram\n  CUSTOMER ||--o{ end : places'],
  ['three mistakes', 'erDiagram\n  A ||--o{ B\n  C {\n    int\n  }\n  style C'],
];
