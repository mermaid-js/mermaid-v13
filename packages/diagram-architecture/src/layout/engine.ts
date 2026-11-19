/**
 * The engine architecture is laid out with (#673, D560): the one the `layout` config names,
 * `compass` when no config layer names one (D284, D326), as for any graph diagram (D327).
 * `compass` places every node on the side its edges name. `layered` (v12's `dagre`) ranks nodes
 * down the flow instead: it reads a side only for where a line leaves and enters its node (D503)
 * and reads neither `{group}` ends nor `align` (core `LayoutGraph`: only `compass` does). It
 * still draws the diagram, and the layout says what it left out with one
 * {@link ARCHITECTURE_PLACEMENT_IGNORED} warning. ELK maps the sides to fixed ports (D503).
 */
import type { LayoutGraph } from '@mermaid-js/core/layout';
import { ARCHITECTURE_PLACEMENT_IGNORED } from '../codes.ts';
import type { ArchitectureLayoutContext } from './context.ts';

/** The plugin's `layoutEngine` (D284): `compass` unless a config layer names another. */
export const architectureLayoutEngine = { default: 'compass' } as const satisfies {
  default: string;
};

/** The first-party engines that rank nodes down the flow: `layered` and its v12 name. */
const FLOW_ENGINES: ReadonlySet<unknown> = new Set(['layered', 'dagre']);

/** Whether `config.layout` names `layered` or `dagre`, which rank services down the flow. */
export const flowEngine = (ctx: ArchitectureLayoutContext): boolean =>
  FLOW_ENGINES.has(ctx.config.layout);

/** What `graph` asks of placement that a flow engine leaves out, as clauses of the warning. */
function ignoredBy(graph: LayoutGraph): string[] {
  const clauses: string[] = [];
  if (graph.edges.some((e) => e.border?.source === true || e.border?.target === true))
    clauses.push('`{group}` on an edge end (the line meets the service, not the group border)');
  if ((graph.align?.length ?? 0) > 0) clauses.push('`align` rows and columns');
  return clauses;
}

/**
 * One {@link ARCHITECTURE_PLACEMENT_IGNORED} warning when `config.layout` names `layered` or
 * `dagre` and `graph` has an edge or an `align`: what that engine does not honour. `path` is
 * `architecture.layout` when the section set it.
 */
export function warnPlacementIgnored(graph: LayoutGraph, ctx: ArchitectureLayoutContext): void {
  const name = ctx.config.layout;
  if (!flowEngine(ctx)) return;
  const layout = `Layout "${String(name)}"`;
  const parts =
    graph.edges.length === 0
      ? []
      : [
          `${layout} does not place services on the sides their edges name (L, R, T, B); the sides only set where lines attach.`,
        ];
  const also = ignoredBy(graph);
  if (also.length > 0)
    parts.push(`${parts.length > 0 ? 'It also' : layout} ignores ${also.join(' and ')}.`);
  if (parts.length === 0) return;
  const scoped = (ctx.config as { architecture?: { layout?: unknown } }).architecture?.layout;
  ctx.warn({
    code: ARCHITECTURE_PLACEMENT_IGNORED,
    message: parts.join(' '),
    path: scoped === name ? 'architecture.layout' : 'layout',
  });
}
