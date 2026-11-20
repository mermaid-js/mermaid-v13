/**
 * c4-beta model builder: the AST in, a {@link C4BetaModel} and the diagnostics the grammar
 * cannot give out (spec #730, the "prototype oddities" table). Errors are one per occurrence;
 * every warning is one per parse, naming each place (D226).
 *
 * - a duplicate id is an error naming both lines, and the second element is left out; the
 *   elements in its body join the first;
 * - a relation end that names no element is an error (`C4_UNKNOWN_END`, D457), and the relation
 *   is left out; ends resolve after the whole text, so a relation may come before its elements;
 * - a technology on a person or a software system, `instances` off a deployment node, a step
 *   outside a `dynamic` diagram and a style entry the renderer has no use for are dropped, each
 *   with a warning;
 * - a `style` line whose value the lexer cannot read (`fill:#12`) is dropped by the parser, which
 *   hands it here for one `C4_COLOR_INVALID` warning (D635).
 */
import type { Diagnostics, Range } from '@mermaid-js/core/parser-kit';
import * as codes from '../codes.ts';
import type {
  C4BetaDocument,
  C4BetaElementNode,
  C4BetaRelationNode,
  C4BetaStyleNode,
} from './ast.ts';
import type {
  C4BetaDirection,
  C4BetaElement,
  C4BetaKind,
  C4BetaModel,
  C4BetaRelation,
  C4BetaStyle,
} from './model.ts';

/** The keys of a `style` entry, and the values the ones with a fixed set take; the rest take a colour. */
export const STYLE_KEYS: Readonly<Record<string, readonly string[] | undefined>> = {
  fill: undefined,
  stroke: undefined,
  color: undefined,
  line: ['solid', 'dashed', 'dotted'],
  shape: ['cylinder'],
};

/** The colour forms a style value may take (D635), for the `C4_COLOR_INVALID` messages. */
export const COLOUR_FORMS =
  'a colour is a CSS colour name, `currentColor`, `#` and 3, 4, 6 or 8 hex digits, or `rgb(…)`, `rgba(…)`, `hsl(…)` or `hsla(…)`';

/** The words in backticks, joined by commas and `last` before the final one. */
const listed = (words: readonly string[], last: string): string => {
  const quoted = words.map((w) => `\`${w}\``);
  return quoted.length < 2
    ? quoted.join('')
    : `${quoted.slice(0, -1).join(', ')} ${last} ${quoted.at(-1)}`;
};

/** What each style key takes, from {@link STYLE_KEYS}: "`fill`, `stroke` and `color` take a colour; …". */
function styleKeysText(): string {
  const keys = Object.entries(STYLE_KEYS);
  const colours = keys.filter(([, values]) => !values).map(([key]) => key);
  const fixed = keys.flatMap(([key, values]) =>
    values ? [`\`${key}\` takes ${listed(values, 'or')}`] : []
  );
  return [`${listed(colours, 'and')} take a colour`, ...fixed].join('; ');
}
/** Kinds that have no technology. */
const NO_TECHNOLOGY: ReadonlySet<string> = new Set(['person', 'softwareSystem']);

/** What a warning names: the place, and what it says about it. */
export interface Place {
  range: Range;
  what: string;
}

/**
 * Build the model of `doc`; `lineOf` turns an offset into a line number for messages, and
 * `unreadable` are the `style` lines the parser dropped for a value it cannot read.
 */
export function buildModel(
  doc: C4BetaDocument,
  diagnostics: Diagnostics,
  lineOf: (at: number) => number,
  unreadable: readonly Place[] = []
): Omit<C4BetaModel, 'warnings'> {
  return new Builder(doc, diagnostics, lineOf, unreadable).build();
}

class Builder {
  private kind: C4BetaKind = 'context';
  private direction: C4BetaDirection = 'TB';
  private legend = true;
  private title: string | undefined;
  private accTitle = '';
  private accDescr = '';
  private readonly elements: C4BetaElement[] = [];
  private readonly byId = new Map<string, { element: C4BetaElement; node: C4BetaElementNode }>();
  private readonly styles: C4BetaStyle[] = [];
  private readonly dropped = {
    technology: [] as Place[],
    instances: [] as Place[],
    step: [] as Place[],
    style: [] as Place[],
  };

  constructor(
    private readonly doc: C4BetaDocument,
    private readonly diagnostics: Diagnostics,
    private readonly lineOf: (at: number) => number,
    private readonly unreadable: readonly Place[]
  ) {}

  build(): Omit<C4BetaModel, 'warnings'> {
    const relations: C4BetaRelationNode[] = [];
    const elements: C4BetaElementNode[] = [];
    for (const node of this.doc.children) {
      if (node.type === 'Element') elements.push(node);
      else if (node.type === 'Relation') relations.push(node);
      else this.statement(node);
    }
    this.addElements(elements);
    const model = relations.flatMap((r) => this.relation(r));
    this.warn(
      codes.C4BETA_TECHNOLOGY_DROPPED,
      'A person and a software system have no technology; it is not drawn',
      this.dropped.technology
    );
    this.warn(
      codes.C4BETA_INSTANCES_DROPPED,
      '`instances` belongs to a deployment node; it is not drawn',
      this.dropped.instances
    );
    this.warn(
      codes.C4BETA_STEP_IGNORED,
      'A step number counts in a `dynamic` diagram; it is not drawn',
      this.dropped.step
    );
    this.warn(
      codes.C4BETA_STYLE_IGNORED,
      `These style entries are ignored (${styleKeysText()})`,
      this.dropped.style
    );
    this.warn(
      codes.C4_COLOR_INVALID,
      `These style lines are not drawn, as a value is not a colour (${COLOUR_FORMS})`,
      this.unreadable
    );
    return {
      kind: this.kind,
      direction: this.direction,
      legend: this.legend,
      ...(this.title === undefined ? {} : { title: this.title }),
      accTitle: this.accTitle,
      accDescr: this.accDescr,
      elements: this.elements,
      relations: model,
      styles: this.styles,
    };
  }

  /** The statements that are neither elements nor relations; the last of each kind wins. */
  private statement(node: C4BetaDocument['children'][number]): void {
    if (node.type === 'Header' && node.kind) this.kind = node.kind;
    else if (node.type === 'Title') this.title = node.text;
    else if (node.type === 'AccTitle') this.accTitle = node.text;
    else if (node.type === 'AccDescr') this.accDescr = node.text;
    else if (node.type === 'Direction') this.direction = node.direction;
    else if (node.type === 'Legend') this.legend = node.on;
    else if (node.type === 'Style') this.style(node);
  }

  private style(node: C4BetaStyleNode): void {
    const entries = node.entries.filter((e) => {
      const values = STYLE_KEYS[e.key];
      const ok = Object.hasOwn(STYLE_KEYS, e.key) && (!values || values.includes(e.value));
      if (!ok) this.dropped.style.push({ range: e.range, what: `\`${e.key}:${e.value}\`` });
      return ok;
    });
    const kept = entries.map(({ key, value }) => ({ key, value }));
    const line = this.lineOf(node.range.start);
    this.styles.push({ target: node.target, entries: kept, line, ast: node.id });
  }

  /** The elements in statement order, a parent before its children, on a stack. */
  private addElements(top: readonly C4BetaElementNode[]): void {
    const work = top.map((node) => ({ node, parent: undefined as string | undefined })).reverse();
    for (let item = work.pop(); item; item = work.pop()) {
      const { node } = item;
      const first = this.byId.get(node.name);
      if (first) this.duplicate(node, first.node);
      else this.add(node, item.parent);
      const parent = first?.element.id ?? node.name;
      for (let k = node.children.length - 1; k >= 0; k--) {
        const child = node.children[k];
        if (child) work.push({ node: child, parent });
      }
    }
  }

  private duplicate(node: C4BetaElementNode, first: C4BetaElementNode): void {
    this.diagnostics.error(
      codes.C4BETA_DUPLICATE_ID,
      `The id \`${node.name}\` is declared twice, at line ${this.lineOf(first.range.start)} and at line ${this.lineOf(node.range.start)}. Every element needs its own id.`,
      node.idRange,
      { related: [{ message: 'First declared here.', range: first.idRange }] }
    );
  }

  private add(node: C4BetaElementNode, parent: string | undefined): void {
    const technology = node.technology ?? '';
    if (technology && NO_TECHNOLOGY.has(node.kind)) {
      this.dropped.technology.push({ range: node.range, what: `\`${node.name}\`` });
    }
    const keepsInstances = node.kind === 'deploymentNode';
    if (node.instances !== undefined && !keepsInstances) {
      this.dropped.instances.push({ range: node.range, what: `\`${node.name}\`` });
    }
    const element: C4BetaElement = {
      id: node.name,
      kind: node.kind,
      name: node.label,
      description: node.description ?? '',
      technology: NO_TECHNOLOGY.has(node.kind) ? '' : technology,
      ...(keepsInstances && node.instances !== undefined ? { instances: node.instances } : {}),
      tags: node.tags,
      ...(parent === undefined ? {} : { parent }),
      boundary: node.children.length > 0 || node.kind === 'group' || keepsInstances,
      ast: node.id,
    };
    this.elements.push(element);
    this.byId.set(node.name, { element, node });
  }

  /** The relation, or nothing when an end names no element. */
  private relation(node: C4BetaRelationNode): C4BetaRelation[] {
    const ends: [string, Range][] = [
      [node.from, node.fromRange],
      [node.to, node.toRange],
    ];
    const missing = ends.filter(([id]) => !this.byId.has(id));
    for (const [id, range] of missing) {
      this.diagnostics.error(
        codes.C4_UNKNOWN_END,
        `The relation \`${node.from} --> ${node.to}\` names \`${id}\`, which is no element. Declare it with a statement such as \`person ${id} "Name"\`.`,
        range
      );
    }
    if (missing.length > 0) return [];
    const inDynamic = this.kind === 'dynamic';
    if (node.step !== undefined && !inDynamic) {
      this.dropped.step.push({ range: node.range, what: `\`${node.step}:\`` });
    }
    return [
      {
        from: node.from,
        to: node.to,
        start: node.start,
        end: node.end,
        description: node.description ?? '',
        technology: node.technology ?? '',
        ...(node.step !== undefined && inDynamic ? { step: node.step } : {}),
        tags: node.tags,
        ast: node.id,
      },
    ];
  }

  /** One warning for every place `what` happened, at the first, naming each line. */
  private warn(code: string, text: string, places: readonly Place[]): void {
    const first = places[0];
    if (!first) return;
    const named = places.map((p) => `${p.what} at line ${this.lineOf(p.range.start)}`);
    this.diagnostics.warning(code, `${text}: ${named.join(', ')}.`, first.range);
  }
}
