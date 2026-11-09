/**
 * Test-only adapter for the ported v12 architecture specs (R-TEST-3), backed by the v13
 * architecture parse. The specs' expectations are kept as v12 wrote them; this file only
 * translates names and shapes:
 *
 * - `parser` and `ArchitectureDB` stand for v12's architecture parser and DB: `parser.parse`
 *   rejects with the first error's message and otherwise loads the model into the DB set as
 *   `parser.parser.yy`, whose getters read it as v12's DB held it (no AST ids; `in`, `icon`,
 *   `title` absent when unset, as v12 left them `undefined`). The DB's own `add…` methods run
 *   v12's checks through v13's {@link ArchitectureRegistry} and throw its messages;
 * - `setConfig` and `resetConfig` stand for v12's config module, which only the skipped fcose
 *   specs read (D328);
 * - `architectureParse` stands for `@mermaid-js/parser`'s Langium parse: `value` is the AST as
 *   Langium built it (every statement, the last of each text statement), and the errors are the
 *   syntax errors (v12's DB threw the semantic ones, not Langium).
 */
import type { Diagnostic } from '@mermaid-js/core/parser-kit';
import type {
  ArchitectureEdge,
  ArchitectureGroup,
  ArchitectureJunction,
  ArchitectureModel,
  ArchitectureService,
} from '../model.ts';
import { ArchitectureRegistry } from '../parser/normalise.ts';
import type { DeclarationKind } from '../parser/normalise.ts';
import { parseArchitecture } from '../parser/index.ts';

/** `o` without its `astId`. */
function plain<T extends { astId: string }>(o: T): Omit<T, 'astId'> {
  const { astId: _, ...rest } = o;
  return rest;
}

type Node = Omit<ArchitectureService, 'astId'> & { type: 'service' | 'junction'; edges: unknown[] };

/** v12's `ArchitectureDB`, over the last model it was loaded with and its own `add…` calls. */
export class ArchitectureDB {
  private registry = new ArchitectureRegistry();
  private groups: Omit<ArchitectureGroup, 'astId'>[] = [];
  private nodes: Node[] = [];
  private edges: Omit<ArchitectureEdge, 'astId'>[] = [];
  private hints: { direction: 'row' | 'column'; members: string[] }[] = [];
  private model: ArchitectureModel | undefined;

  clear(): void {
    this.registry = new ArchitectureRegistry();
    this.groups = [];
    this.nodes = [];
    this.edges = [];
    this.hints = [];
    this.model = undefined;
  }

  /** Load a parsed model (what v12's `populateDb` did). */
  load(model: ArchitectureModel): void {
    this.clear();
    this.model = model;
    this.groups = model.groups.map(plain);
    this.nodes = [
      ...model.services.map((s) => ({ ...plain(s), type: 'service' as const, edges: [] })),
      ...model.junctions.map((j: ArchitectureJunction) => ({
        ...plain(j),
        type: 'junction' as const,
        edges: [],
      })),
    ];
    this.edges = model.edges.map(plain);
    this.hints = model.alignments.map((a) => ({ direction: a.direction, members: [...a.members] }));
  }

  private check(kind: DeclarationKind, id: string, parent: string | undefined): void {
    const problem = this.registry.add(kind, id, parent);
    if (problem) throw new Error(problem.message);
  }

  addGroup(group: { id: string; icon?: string; title?: string; in?: string }): void {
    this.check('group', group.id, group.in);
    this.groups.push({ ...group });
  }

  addService(service: { id: string; icon?: string; title?: string; in?: string }): void {
    this.check('service', service.id, service.in);
    const { type: _, ...rest } = service as typeof service & { type?: string };
    this.nodes.push({ ...rest, type: 'service', edges: [] });
  }

  addJunction(junction: { id: string; in?: string }): void {
    this.check('junction', junction.id, junction.in);
    this.nodes.push({ id: junction.id, in: junction.in, type: 'junction', edges: [] });
  }

  addLayoutHint(hint: { direction: 'row' | 'column'; members: string[] }): void {
    const problem = this.registry.align(hint.direction, hint.members);
    if (problem) throw new Error(problem.message);
    this.hints.push({ direction: hint.direction, members: [...hint.members] });
  }

  getGroups(): Omit<ArchitectureGroup, 'astId'>[] {
    return this.groups;
  }
  getServices(): Node[] {
    return this.nodes.filter((n) => n.type === 'service');
  }
  getJunctions(): Node[] {
    return this.nodes.filter((n) => n.type === 'junction');
  }
  getNodes(): Node[] {
    return this.nodes;
  }
  getEdges(): Omit<ArchitectureEdge, 'astId'>[] {
    return this.edges;
  }
  getLayoutHints(): { direction: 'row' | 'column'; members: string[] }[] {
    return this.hints;
  }
  getDiagramTitle(): string {
    return this.model?.title ?? '';
  }
  getAccTitle(): string {
    return this.model?.accTitle ?? '';
  }
  getAccDescription(): string {
    return this.model?.accDescr ?? '';
  }
}

/** v12's `parser` object from `architectureParser.ts`, as the spec uses it. */
export const parser = {
  /** v12's Jison-style hook, which the spec sets to the DB. */
  parser: { yy: undefined as unknown },
  parse(text: string): Promise<void> {
    const result = parseArchitecture(text);
    const error = result.diagnostics.find((d) => d.severity === 'error');
    if (error) return Promise.reject(new Error(error.message));
    const db = parser.parser.yy;
    if (!(db instanceof ArchitectureDB)) return Promise.reject(new Error('no ArchitectureDB set'));
    db.load(result.model);
    return Promise.resolve();
  },
};

/** v12's config: what `setConfig` set, read only by the skipped fcose specs (D328). */
let config: unknown;

/** v12's `setConfig`. */
export function setConfig(next: unknown): void {
  config = next;
}

/** v12's config `reset`. */
export function resetConfig(): unknown {
  const was = config;
  config = undefined;
  return was;
}

/** Langium's AST type name of the root. */
export const Architecture = { $type: 'Architecture' };

interface LangiumArchitecture {
  $type: 'Architecture';
  groups: { $type: 'Group'; id: string; icon?: string; title?: string; in?: string }[];
  services: {
    $type: 'Service';
    id: string;
    icon?: string;
    iconText?: string;
    title?: string;
    in?: string;
  }[];
  junctions: { $type: 'Junction'; id: string; in?: string }[];
  edges: { $type: 'Edge'; lhsId: string; rhsId: string; title?: string }[];
  alignments: { $type: 'Alignment'; direction: string; members: string[] }[];
  title?: string;
  accTitle?: string;
  accDescr?: string;
}

/** Syntax errors only: the `ARCHITECTURE_…` codes are v12's DB checks, which Langium never ran. */
const syntaxErrors = (diagnostics: Diagnostic[]) =>
  diagnostics.filter((d) => d.severity === 'error' && !d.code.startsWith('ARCHITECTURE_'));

export function architectureParse(text: string): {
  value: LangiumArchitecture;
  lexerErrors: string[];
  parserErrors: string[];
} {
  const { ast, diagnostics } = parseArchitecture(text);
  const value: LangiumArchitecture = {
    $type: 'Architecture',
    groups: [],
    services: [],
    junctions: [],
    edges: [],
    alignments: [],
  };
  for (const n of ast.children) {
    if (n.type === 'Group') {
      value.groups.push({
        $type: 'Group',
        id: n.name.value,
        icon: n.icon?.value,
        title: n.label?.value,
        in: n.parent?.value,
      });
    } else if (n.type === 'Service') {
      value.services.push({
        $type: 'Service',
        id: n.name.value,
        icon: n.icon?.value,
        iconText: n.iconText?.value,
        title: n.label?.value,
        in: n.parent?.value,
      });
    } else if (n.type === 'Junction') {
      value.junctions.push({ $type: 'Junction', id: n.name.value, in: n.parent?.value });
    } else if (n.type === 'Edge') {
      value.edges.push({
        $type: 'Edge',
        lhsId: n.lhs.name.value,
        rhsId: n.rhs.name.value,
        title: n.label?.value,
      });
    } else if (n.type === 'Alignment') {
      value.alignments.push({
        $type: 'Alignment',
        direction: n.direction,
        members: n.members.map((m) => m.value),
      });
    } else if (n.type === 'Title') value.title = n.text;
    else if (n.type === 'AccTitle') value.accTitle = n.text;
    else if (n.type === 'AccDescr') value.accDescr = n.text;
  }
  const errors = syntaxErrors(diagnostics);
  return { value, lexerErrors: [], parserErrors: errors.map((d) => d.message) };
}

export function expectNoErrorsOrAlternatives(result: ReturnType<typeof architectureParse>): void {
  if (result.lexerErrors.length > 0 || result.parserErrors.length > 0) {
    throw new Error([...result.lexerErrors, ...result.parserErrors].join('\n'));
  }
}
