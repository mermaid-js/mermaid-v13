/**
 * Test-only adapter for the ported v12 state specs (R-TEST-3): v12's `stateDiagram.jison`
 * parser object and the `StateDB` getters the specs read, backed by the v13 parse. The specs'
 * expectations are kept as v12 wrote them; this file only translates names.
 *
 * `getStates()` and `getRelations()` are v12's table of the top-level statements (what
 * `extract` saw), with each composite state's statements as `doc`; `getData()` lists the
 * model's states with their styles. Errors are thrown with v12's message where a spec checks
 * it.
 */
import type { AstNode } from '@mermaid-js/core/parser-kit';
import { parseState } from '../parser/index.ts';
import type {
  StateCompositeStmt,
  StateModel,
  StateNoteStmt,
  StateParseResult,
  StateSimpleStmt,
  StateStmt,
  StateTransitionStmt,
} from '../parser/index.ts';

export const DEFAULT_DIAGRAM_DIRECTION = 'TB';

/** v12's `setConfig`; the specs set only `securityLevel`, which parsing does not read. */
export function setConfig(config: unknown): void {
  void config;
}

interface TableState {
  id: string;
  descriptions: string[];
  type: string;
  doc?: DocItem[];
  note?: { position: string; text: string };
  classes: string[];
  styles: string[];
}

type DocItem = Record<string, unknown>;

const flat = (nodes: readonly AstNode[]): AstNode[] =>
  nodes.flatMap((n) => (n.type === 'Region' ? flat(n.children ?? []) : [n]));

/** `[*]` as v12 renamed it in `scope` (`root` at the top). */
const idOf = (name: string, scope: string, end: boolean) =>
  name === '[*]' ? `${scope}${end ? '_end' : '_start'}` : name;

/** v12's statement objects for the statements of a composite (its `doc`). */
function docOf(nodes: readonly AstNode[], scope: string): DocItem[] {
  return flat(nodes).flatMap((n): DocItem[] => {
    if (n.type === 'State') {
      const s = n as StateStmt;
      if (s.declaredOnly) return [];
      const item: DocItem = {
        stmt: 'state',
        id: idOf(s.name, scope, false),
        type: s.pseudo ?? 'default',
        description: s.description ?? '',
      };
      if (s.className) item.classes = [s.className];
      return [item];
    }
    if (n.type === 'Transition') {
      const t = n as StateTransitionStmt;
      const end = (s: StateStmt, last: boolean): DocItem => {
        const item: DocItem = { stmt: 'state', id: idOf(s.name, scope, last), type: 'default' };
        if (s.className) item.classes = [s.className];
        return item;
      };
      return [
        {
          stmt: 'relation',
          state1: end(t.children[0], false),
          state2: end(t.children[1], true),
          description: t.label,
        },
      ];
    }
    if (n.type === 'Composite') {
      const c = n as StateCompositeStmt;
      return [{ stmt: 'state', id: c.name, type: 'default', doc: docOf(c.children, c.name) }];
    }
    if (n.type === 'Note' && !(n as StateNoteStmt).floating) {
      const m = n as StateNoteStmt;
      return [{ stmt: 'state', id: m.target, note: { position: `${m.side} of`, text: m.text } }];
    }
    if (n.type === 'Divider') return [{ stmt: 'state', type: 'divider' }];
    return [];
  });
}

export class StateDB {
  private result: StateParseResult | undefined;
  private table = new Map<string, TableState>();
  private relations: { id1: string; id2: string; relationTitle: string }[] = [];

  constructor(readonly version: 1 | 2 = 2) {}

  clear(): void {
    this.result = undefined;
    this.table = new Map();
    this.relations = [];
  }

  load(result: StateParseResult): void {
    this.clear();
    this.result = result;
    for (const n of result.ast.children) this.extract(n);
  }

  private add(id: string): TableState {
    let s = this.table.get(id);
    if (!s) {
      s = { id, descriptions: [], type: 'default', classes: [], styles: [] };
      this.table.set(id, s);
    }
    return s;
  }

  /** v12 `extract` for one top-level statement. */
  private extract(n: AstNode): void {
    const model = this.model;
    switch (n.type) {
      case 'State': {
        const s = n as StateStmt;
        if (s.declaredOnly) return;
        const state = this.add(idOf(s.name, 'root', false));
        if (s.pseudo) state.type = s.pseudo;
        if (s.description) state.descriptions.push(s.description.replace(/^:/, '').trim());
        return;
      }
      case 'Transition': {
        const t = n as StateTransitionStmt;
        const [a, b] = t.children;
        const id1 = idOf(a.name, 'root', false);
        const id2 = idOf(b.name, 'root', true);
        const s1 = this.add(id1);
        if (a.className) s1.classes.push(a.className);
        const s2 = this.add(id2);
        if (b.className) s2.classes.push(b.className);
        this.relations.push({ id1, id2, relationTitle: t.label ?? '' });
        break;
      }
      case 'Composite': {
        const c = n as StateCompositeStmt;
        const s = this.add(c.name);
        s.doc ??= docOf(c.children, c.name);
        if (c.description) s.descriptions.push(c.description.trim());
        break;
      }
      case 'Note': {
        const m = n as StateNoteStmt;
        if (!m.floating) this.add(m.target).note = { position: `${m.side} of`, text: m.text };
        break;
      }
      case 'Class':
      case 'Style': {
        const refs = (n as StateSimpleStmt).refs;
        const ids = n.type === 'Class' ? refs.slice(0, -1) : refs;
        for (const raw of ids) {
          const state = this.add(raw.trim());
          if (n.type === 'Class') state.classes.push(refs[refs.length - 1] ?? '');
          else state.styles = [...(model.states.find((x) => x.id === raw.trim())?.styles ?? [])];
        }
        break;
      }
      default:
        break;
    }
  }

  private get model(): StateModel {
    if (!this.result) throw new Error('nothing parsed');
    return this.result.model;
  }

  getStates(): Map<string, TableState> {
    return this.table;
  }

  getState(id: string): TableState | undefined {
    return this.table.get(id);
  }

  getRelations(): { id1: string; id2: string; relationTitle: string }[] {
    return this.relations;
  }

  getClasses(): Map<string, StateModel['classes'][number]> {
    return new Map(this.model.classes.map((c) => [c.id, c]));
  }

  getAccTitle(): string {
    return this.model.accTitle;
  }

  getAccDescription(): string {
    return this.model.accDescr;
  }

  getDirection(): string {
    return this.model.direction;
  }

  getLinks(): Map<string, { url: string; tooltip: string }> {
    return new Map(this.model.links.map((l) => [l.id, { url: l.url, tooltip: l.tooltip }]));
  }

  getData(): {
    nodes: { id: string; label: string; cssClasses: string; cssStyles: string[] }[];
    edges: { start: string; end: string; label: string }[];
    direction: string;
  } {
    const m = this.model;
    return {
      nodes: m.states.map((s) => ({
        id: s.id,
        label: s.descriptions[0] ?? s.id,
        cssClasses: [...s.classes, 'statediagram-state'].join(' '),
        cssStyles: [...s.styles],
      })),
      edges: m.transitions.map((t) => ({ start: t.from, end: t.to, label: t.label })),
      direction: m.direction,
    };
  }
}

/** v12's parser object: `parse` fills `yy` (a {@link StateDB}) or throws v12's error. */
export const parser = {
  yy: undefined as StateDB | undefined,
  parse(text: string): void {
    const result = parseState(text);
    const error = result.diagnostics.find((d) => d.severity === 'error');
    if (error?.code === 'MULTI_WORD_STATE') {
      throw new Error('Error: State name must be a single word.');
    }
    if (error) throw new Error(`${error.code}: ${error.message}`);
    (this.yy ??= new StateDB(2)).load(result);
  },
};

export default { parser };
