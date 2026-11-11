// What agentflow text output cannot show (D82, D469, R-ASCII-5): one `ASCII_DROPPED` warning per
// feature kind, with the AST ids of what it dropped: the elements from the views, and the
// statements when the AST is given. An option text output cannot honour is one more kind
// (pitfall 22), set in the diagram or in config: the `agentflow` lengths and `useMaxWidth`
// that only shape the SVG, and the `flowchart` keys agentflow reads (D466) for its SVG. Every
// agentflow shape has a text form (`shapes.ts`), so there is no `ASCII_SHAPE`.
import type { ResolvedConfig } from '@mermaid-js/core/config';
import type { AstNode } from '@mermaid-js/core/parser-kit';
import type { CheckedStyle } from '@mermaid-js/core/svg';
import { Style, type MeasuredLabel } from '@mermaid-js/core/text';
import { agentflowConfigDefaults } from '../generated/config-defaults.ts';
import { emphasisBits, numericValue, TITLE_MARGIN_DEFAULTS } from '../layout/index.ts';
import type { AgentflowPrepared, AgentflowWarning } from '../layout/index.ts';
import type { AgentflowModel } from '../parser/index.ts';
import { styled } from '@mermaid-js/shared/ascii';
import { statements } from '@mermaid-js/shared/ascii';
import { asciiDropped } from '@mermaid-js/shared/ascii';

/** The feature kinds an `ASCII_DROPPED` warning names, in the order they are reported. */
export type AsciiDroppedFeature =
  | 'style'
  | 'curve'
  | 'emphasis'
  | 'animation'
  | 'link'
  | 'config'
  | 'accessibility';

/** One feature kind text output dropped (D82). */
export interface AsciiDroppedWarning extends AgentflowWarning {
  readonly code: 'ASCII_DROPPED';
  readonly feature: AsciiDroppedFeature;
  readonly astIds: readonly string[];
}

/** Edges the repair router found no free lane for (D78). */
export interface AsciiRouteWarning extends AgentflowWarning {
  readonly code: 'ASCII_ROUTE';
  readonly astIds: readonly string[];
}

export type AsciiWarning = AsciiDroppedWarning | AsciiRouteWarning;

const WHAT: Record<AsciiDroppedFeature, string> = {
  style: 'colours and styles (style, classDef, class, linkStyle)',
  curve: 'edge curves',
  emphasis: 'bold and italic text',
  animation: 'edge animation',
  link: 'links, tooltips and callbacks',
  config: 'options that only shape the SVG',
  accessibility: 'accTitle and accDescr',
};

// The statements behind each feature kind (`AgentflowSimpleKind`).
const STATEMENTS: Record<AsciiDroppedFeature, readonly string[]> = {
  style: ['Style', 'ClassDef', 'Class', 'LinkStyle'],
  curve: ['LinkStyle'],
  emphasis: [],
  animation: [],
  link: ['Click'],
  config: [],
  accessibility: ['AccTitle', 'AccDescr'],
};

/** `agentflow` keys only the SVG reads: text has no least width, margins or SVG width. */
const UNDRAWN = ['useMaxWidth', 'diagramPadding', 'minNodeWidth', 'titleTopMargin'] as const;

/**
 * The config keys set off their default that text output cannot honour, as paths: the
 * `agentflow` keys in {@link UNDRAWN} (the resolved section carries the defaults, so a value
 * equal to its default is not set), and `flowchart.padding` and a `flowchart.subGraphTitleMargin`
 * off its default (D466: read for the SVG; agentflow has no section default for them).
 */
export function undrawnConfig(config: ResolvedConfig): string[] {
  const out: string[] = [];
  const section = (config.agentflow ?? {}) as Readonly<Record<string, unknown>>;
  const defaults = agentflowConfigDefaults as Readonly<Record<string, unknown>>;
  for (const key of UNDRAWN) {
    const value = section[key];
    if (value !== undefined && numericValue(value) !== defaults[key]) out.push(`agentflow.${key}`);
  }
  const flowchart = (config.flowchart ?? {}) as Readonly<Record<string, unknown>>;
  if (flowchart.padding !== undefined) out.push('flowchart.padding');
  const margin = flowchart.subGraphTitleMargin as Readonly<Record<string, unknown>> | undefined;
  const sides = ['top', 'bottom'] as const;
  const moved = (side: (typeof sides)[number]) =>
    margin?.[side] !== undefined && numericValue(margin[side]) !== TITLE_MARGIN_DEFAULTS[side];
  if (sides.some(moved)) out.push('flowchart.subGraphTitleMargin');
  return out;
}

// Bold or italic the label has beyond what its style asked for.
function emphasised(label: MeasuredLabel, style: CheckedStyle): boolean {
  const mask = (Style.Bold | Style.Italic) & ~emphasisBits(style);
  return label.lines.some((line) => line.some((run) => (run.style & mask) !== 0));
}

type Found = Partial<Record<AsciiDroppedFeature, Set<string>>>;

// Which features the drawing uses, with the AST ids of the elements that use them.
function features(model: AgentflowModel, prepared: AgentflowPrepared, config: ResolvedConfig) {
  const found: Found = {};
  const add = (feature: AsciiDroppedFeature, id?: string): void => {
    const ids = (found[feature] ??= new Set());
    if (id) ids.add(id);
  };
  for (const v of [...prepared.groups, ...prepared.nodes]) {
    if (styled(v.style)) add('style', v.ast);
    if (emphasised(v.label, v.style)) add('emphasis', v.ast);
  }
  for (const e of prepared.edges) {
    if (styled(e.style)) add('style', e.edge.ast);
    if (emphasised(e.label, e.style)) add('emphasis', e.edge.ast);
    if ((e.edge.interpolate ?? model.defaultInterpolate) !== undefined) add('curve', e.edge.ast);
    if (e.edge.animate === true || e.edge.animation !== undefined) add('animation', e.edge.ast);
  }
  // A curve set in config (site, front matter or directive) draws every edge with it in SVG.
  if (config.flowchart?.curve !== undefined) add('curve');
  const astOf = new Map(prepared.nodes.map((v) => [v.id, v.ast]));
  for (const v of model.vertices) if (v.link) add('link', astOf.get(v.id) ?? v.ast);
  for (const [id] of model.tooltips) add('link', astOf.get(id));
  for (const c of model.callbacks) add('link', astOf.get(c.id));
  if (undrawnConfig(config).length > 0) add('config');
  if (model.accTitle || model.accDescr) add('accessibility');
  return found;
}

/**
 * The warnings for one drawing: one `ASCII_DROPPED` per feature kind without a text form (D82).
 * `ast` adds the statements' ids (`style:1`, `accTitle:1`, …).
 */
export function asciiWarnings(
  model: AgentflowModel,
  prepared: AgentflowPrepared,
  config: ResolvedConfig,
  ast?: AstNode
): AsciiDroppedWarning[] {
  const found = features(model, prepared, config);
  const stmts = new Map<string, string[]>();
  statements(ast, stmts);
  const out: AsciiDroppedWarning[] = [];
  for (const feature of Object.keys(WHAT) as AsciiDroppedFeature[]) {
    const ids = found[feature];
    if (!ids) continue;
    for (const kind of STATEMENTS[feature]) for (const id of stmts.get(kind) ?? []) ids.add(id);
    const keys = feature === 'config' ? ` (${undrawnConfig(config).join(', ')})` : '';
    out.push(asciiDropped(feature, [...ids], WHAT[feature], keys));
  }
  return out;
}
