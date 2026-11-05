// cspell:words unput
/**
 * Per-type descriptors for the shared jison lexer oracle and the harvest CLI (D212). One entry
 * per diagram type that v12 parses with jison: the five M3 types and the five M4 jison types.
 * Pie and gitGraph are Langium in v12 and gate on its tokens instead (D213).
 */

/** The part of a v12 jison lexer the oracle drives. */
export interface JisonLexer {
  setInput(input: string, yy: unknown): void;
  lex(): number | string;
  yytext: string;
  /** The text not matched yet (kept right by `unput`). */
  _input: string;
}

/** How `harvest <type>` collects v12's spec strings (`src/jison/harvest.ts`). */
export type HarvestMethod =
  /**
   * Every string literal in the type's `*.spec.*` files whose raw text matches `header`, with
   * its JS escapes decoded. Literals with an interpolation are skipped.
   */
  | { kind: 'literals'; header: RegExp }
  /**
   * Like `literals`, but a `a + b + …` chain of literals is one source, a template whose only
   * interpolation is `${keyword}` is one source per entry of the spec's `const keywords`, and
   * `header` is matched against the decoded source.
   */
  | { kind: 'chains'; header: RegExp }
  /**
   * Runs each of `specs` (relative to `dir`; TypeScript has its types stripped) with its
   * imports stubbed and records every argument passed to `<name>.parser.parse` or
   * `<name>.parse`, for each name in `parsers` (the names the specs give v12's jison parser). For specs
   * that build sources in loops, `+` chains or `[…].join('\n')`, which no regex reads.
   */
  | { kind: 'run'; parsers: readonly string[]; specs: readonly string[] };

export interface JisonTypeDescriptor {
  /** A diagram v12 parses with this type's jison parser; loading it hands the oracle that parser. */
  probe: string;
  /**
   * The `yy` for one run of the lexer, built fresh per call. `db` is the probe's DB. Default:
   * a new instance of the DB's class, or the DB itself when it is a plain module object (its
   * lexer actions do not call into it).
   */
  yy?: (context: { db: object; lexer: JisonLexer }) => unknown;
  /** The type's fixture directories under `e2e/diagrams`. */
  e2e: readonly string[];
  harvest: {
    /** v12's source directory for the type, relative to the repo root. */
    dir: string;
    /** v12's syntax page for the type, under `packages/mermaid/src/docs/syntax`. */
    docs: string;
    method: HarvestMethod;
  };
}

const V12_DIAGRAMS = 'packages/mermaid/src/diagrams';

/** The literal's raw text starts (after blanks and an escaped line break) with `keyword`. */
const startsWith = (keyword: string) => new RegExp(String.raw`^\s*(?:\\n)?\s*(?:${keyword})`);

export const JISON_TYPES = {
  flowchart: {
    probe: 'flowchart TD\n  A',
    e2e: ['flowchart'],
    harvest: {
      dir: `${V12_DIAGRAMS}/flowchart`,
      docs: 'flowchart.md',
      method: { kind: 'literals', header: startsWith('graph|flowchart') },
    },
  },
  sequence: {
    probe: 'sequenceDiagram\n  A->>B: x',
    e2e: ['sequence'],
    harvest: {
      dir: `${V12_DIAGRAMS}/sequence`,
      docs: 'sequenceDiagram.md',
      method: { kind: 'literals', header: startsWith('sequenceDiagram') },
    },
  },
  class: {
    probe: 'classDiagram\n  class A',
    e2e: ['class-diagram'],
    harvest: {
      dir: `${V12_DIAGRAMS}/class`,
      docs: 'classDiagram.md',
      // A class source, or one that opens with front matter or a directive before the header.
      method: { kind: 'chains', header: /^\s*(?:classDiagram|(?:---|%%)[\s\S]*classDiagram)/ },
    },
  },
  state: {
    probe: 'stateDiagram-v2\n  A',
    // Its `processId` action calls `yy.lexer.unput`.
    yy: ({ db, lexer }) => Object.assign(new (db.constructor as new () => object)(), { lexer }),
    e2e: ['state-diagram', 'state-diagram-v2'],
    harvest: {
      dir: `${V12_DIAGRAMS}/state`,
      docs: 'stateDiagram.md',
      method: { kind: 'literals', header: startsWith('stateDiagram') },
    },
  },
  er: {
    probe: 'erDiagram\n  A',
    e2e: ['er-diagram'],
    harvest: {
      dir: `${V12_DIAGRAMS}/er`,
      docs: 'entityRelationshipDiagram.md',
      method: {
        kind: 'run',
        parsers: ['erDiagram'],
        specs: ['parser/erDiagram.spec.js', 'parser/subgraph.spec.js'],
      },
    },
  },
  gantt: {
    probe: 'gantt\n  title x',
    e2e: ['gantt'],
    harvest: {
      dir: `${V12_DIAGRAMS}/gantt`,
      docs: 'gantt.md',
      method: { kind: 'run', parsers: ['parser'], specs: ['parser/gantt.spec.js'] },
    },
  },
  mindmap: {
    probe: 'mindmap\n  root',
    e2e: ['mindmap'],
    harvest: {
      dir: `${V12_DIAGRAMS}/mindmap`,
      docs: 'mindmap.md',
      method: {
        kind: 'run',
        parsers: ['mindmap', 'parser'],
        specs: ['mindmap.spec.ts', 'mindmapColors.spec.ts'],
      },
    },
  },
  timeline: {
    probe: 'timeline\n  title x',
    e2e: ['timeline'],
    harvest: {
      dir: `${V12_DIAGRAMS}/timeline`,
      docs: 'timeline.md',
      method: { kind: 'run', parsers: ['timeline'], specs: ['timeline.spec.js'] },
    },
  },
  journey: {
    probe: 'journey\n  title x',
    e2e: ['journey'],
    harvest: {
      dir: `${V12_DIAGRAMS}/user-journey`,
      docs: 'userJourney.md',
      method: { kind: 'run', parsers: ['parser'], specs: ['parser/journey.spec.js'] },
    },
  },
  quadrant: {
    probe: 'quadrantChart\n  title x',
    e2e: ['quadrant-chart'],
    harvest: {
      dir: `${V12_DIAGRAMS}/quadrant-chart`,
      docs: 'quadrantChart.md',
      method: { kind: 'run', parsers: ['parser'], specs: ['parser/quadrant.jison.spec.ts'] },
    },
  },
} as const satisfies Record<string, JisonTypeDescriptor>;

export type JisonType = keyof typeof JISON_TYPES;
