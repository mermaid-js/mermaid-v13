import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FlowTokenKind as T } from '@mermaid-js/diagram-flowchart';
// The checked-in table, read from source: the package exports it from `./language` only.
import { flowchartDocs } from '../../../packages/diagram-flowchart/src/generated/docs.ts';
import { docTable } from './docs.ts';
import { parseGrammar } from './ebnf.ts';
import { generate, sourceDir } from './generate.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');

describe('keyword doc table generator (D93)', () => {
  const g = parseGrammar(`@lexer
GO     /go\\b/     :keyword ;
STOP   /stop\\b/   :keyword ;
FAST   /fast\\b/   :keyword ;
ARROW  /->/        :operator ;
STEP   /step\\b/   :keyword ;
ID     /[a-z]+/    :variable ;
SPACE  /[ ]+/ ;
@grammar
(** A program: statements. *)
program = { statement } ;
statement = Go | Move ;
(** \`go id\`: starts
id. The rest of the doc.

A second paragraph. *)
Go @Go = GO SPACE ID [ SPACE FAST ] ;
(** \`id -> id\` moves. *)
Move @Move = ID ARROW ID [ step ] ;
step = SPACE STEP ;
`);

  it('takes each keyword or operator doc from the most specific documented rule it starts', () => {
    expect(docTable(g, ['Go', 'Stop', 'Fast', 'Arrow', 'Step', 'Id', 'Space'])).toEqual({
      entries: [
        // `program` starts with GO too, but `Go` starts with nothing else.
        ['Go', '`go id`: starts id. The rest of the doc.'],
        // Not at the start of any rule: the first documented rule that mentions it.
        ['Fast', '`go id`: starts id. The rest of the doc.'],
        ['Arrow', '`id -> id` moves.'],
        // Held through a rule with no doc.
        ['Step', '`id -> id` moves.'],
      ],
      // Keywords and operators only: `Id` and `Space` are left out.
      missing: ['Stop'],
    });
  });

  it('is generated for flowchart from the grammar file’s doc comments, not a second copy', () => {
    const files = generate((p) => readFileSync(join(root, p), 'utf8'));
    expect(files.has(`${sourceDir('flowchart')}/generated/docs.ts`)).toBe(true);
    expect(flowchartDocs[T.Graph]).toMatch(/^`flowchart LR`, `graph TD`/);
    expect(flowchartDocs[T.Subgraph]).toMatch(/^`subgraph id`/);
    expect(flowchartDocs[T.End]).toBe(flowchartDocs[T.Subgraph]);
    expect(flowchartDocs[T.Link]).toMatch(/^A link/);
    expect(flowchartDocs[T.ClassDef]).toMatch(/classDef/);
    for (const k of [T.Style, T.Class, T.LinkStyle, T.Default, T.AccTitle, T.DirectionTB]) {
      expect(flowchartDocs[k], `kind ${k}`).toMatch(/\S/);
    }
    // One line each.
    for (const doc of Object.values(flowchartDocs)) expect(doc).not.toMatch(/\n/);
    expect(flowchartDocs[T.NodeString]).toBeUndefined();
  });
});
