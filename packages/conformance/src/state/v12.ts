/**
 * The v12 side of state parity: a plain-data snapshot of what mermaid@12's `StateDB` handed its
 * renderer (`getData()`: the graph `dataFetcher` built), plus classes, links, accessibility
 * fields and the diagram direction. The v13 normaliser (`v13.ts`) produces the same shape from a
 * `StateModel`.
 *
 * Normalisation: v12's entity placeholders are decoded back to what the author wrote; regions
 * (v12's `divider` groups, numbered by a global counter, the last one with a random id) are
 * renamed `<composite>:region<k>` in order within their composite, and the `[*]` states inside
 * them follow; note groups are left out (a note is `{ target, side, text }`).
 */
import { decodeEntities } from '../flowchart/v12.ts';

/** `diagram.type` mermaid@12 reports for `stateDiagram` and `stateDiagram-v2` alike. */
export const STATE_V12_TYPES = ['stateDiagram'];

export interface StateSnapshot {
  direction: string;
  accTitle: string;
  accDescr: string;
  states: {
    id: string;
    kind: string;
    label: string[];
    parent: string | undefined;
    classes: string[];
    styles: string[];
    dir: string | undefined;
  }[];
  regions: { id: string; parent: string; dir: string }[];
  transitions: { from: string; to: string; label: string }[];
  notes: { target: string; side: string; text: string }[];
  classes: { id: string; styles: string[]; textStyles: string[] }[];
  links: [id: string, url: string, tooltip: string][];
}

interface NodeV12 {
  id: string;
  shape?: string;
  label?: string;
  description?: string[];
  parentId?: string;
  isGroup?: boolean;
  cssClasses?: string;
  cssStyles?: string[];
  dir?: string;
  position?: string;
}

interface StateDbV12 {
  getData(): {
    nodes: NodeV12[];
    edges: { start: string; end: string; label?: string; classes: string }[];
    direction: string;
  };
  getClasses(): Map<string, { id: string; styles: string[]; textStyles: string[] }>;
  getLinks(): Map<{ id: string }, { url: string; tooltip: string }>;
  getAccTitle(): string;
  getAccDescription(): string;
}

const KINDS: Record<string, string> = {
  stateStart: 'start',
  stateEnd: 'end',
  fork: 'fork',
  join: 'join',
  choice: 'choice',
};

/** v12 class names on a node, without the `statediagram-…` ones v12 adds. */
export function userClasses(css: string): string[] {
  return css.split(' ').filter((c) => c !== '' && !c.startsWith('statediagram-'));
}

const unquote = (s: string) => s.replace(/^"+|"+$/g, '');

export function stateV12Snapshot(dbValue: unknown): StateSnapshot {
  const db = dbValue as StateDbV12;
  const data = db.getData();
  // Regions in order within their composite.
  const rename = new Map<string, string>();
  const perParent = new Map<string, number>();
  for (const n of data.nodes) {
    if (n.shape !== 'divider' || !n.isGroup) continue;
    const parent = n.parentId ?? 'root';
    const k = (perParent.get(parent) ?? 0) + 1;
    perParent.set(parent, k);
    rename.set(n.id, `${parent}:region${k}`);
  }
  const id = (raw: string): string => {
    const direct = rename.get(raw);
    if (direct !== undefined) return direct;
    const m = /^(.*)_(start|end)$/.exec(raw);
    const scope = m ? rename.get(m[1] ?? '') : undefined;
    return scope !== undefined ? `${scope}_${m?.[2] ?? ''}` : raw;
  };
  const opt = (v: string | undefined) => (v === undefined ? undefined : id(v));
  const snap: StateSnapshot = {
    direction: data.direction,
    accTitle: decodeEntities(db.getAccTitle()),
    accDescr: decodeEntities(db.getAccDescription()),
    states: [],
    regions: [],
    transitions: [],
    notes: [],
    classes: [...db.getClasses().values()].map((c) => ({
      id: c.id,
      styles: [...c.styles],
      textStyles: [...c.textStyles],
    })),
    links: [...db.getLinks().entries()].map(([k, v]) => [
      k.id,
      unquote(v.url),
      unquote(v.tooltip),
    ]),
  };
  for (const n of data.nodes) {
    if (n.shape === 'noteGroup') continue;
    if (n.shape === 'note') {
      snap.notes.push({
        target: n.id.replace(/----note-\d+$/, ''),
        side: n.position === 'left of' ? 'left' : 'right',
        text: decodeEntities(n.label ?? ''),
      });
      continue;
    }
    if (n.isGroup && n.shape === 'divider') {
      snap.regions.push({ id: id(n.id), parent: opt(n.parentId) ?? '', dir: n.dir ?? 'TB' });
      continue;
    }
    const kind = n.isGroup ? 'composite' : (KINDS[n.shape ?? ''] ?? 'plain');
    snap.states.push({
      id: id(n.id),
      kind,
      // A label that is the id is the renamed id.
      label: [n.label === n.id ? id(n.id) : (n.label ?? ''), ...(n.description ?? [])].map(
        decodeEntities
      ),
      parent: opt(n.parentId),
      classes: userClasses(n.cssClasses ?? ''),
      styles: [...(n.cssStyles ?? [])],
      dir: n.isGroup ? n.dir : undefined,
    });
  }
  for (const e of data.edges) {
    if (e.classes !== 'transition') continue;
    snap.transitions.push({ from: id(e.start), to: id(e.end), label: decodeEntities(e.label ?? '') });
  }
  return snap;
}
