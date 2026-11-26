/**
 * The HTML labels extension over an environment: where it measures, how it sanitizes and how it
 * mounts. `index.ts` gives it the browser's; the specs give it stand-ins, since Node has no DOM.
 */
import type { ExtensionPlugin, HookContext } from '@mermaid-js/core';
import { translate } from '@mermaid-js/core/svg';
import type { InlineBox, LabelRequest, SvgFragment } from '@mermaid-js/core/text';
import {
  LABEL_CLASS,
  PLACEHOLDER_CLASS,
  type measure,
  type Measured,
  type mountLabels,
} from './dom.ts';
import { configFragment } from './generated/config-fragment.ts';
import { labelHtml } from './html.ts';
import type { LinkRules, Sanitize } from './sanitize.ts';

/** What the extension needs from where it runs. */
export interface Env {
  /** The document to measure in, or `undefined` when there is none that lays out. */
  document(): Document | undefined;
  /** A sanitizer for that document with the render's link rules. */
  sanitizer(document: Document, links: LinkRules): Sanitize;
  measure: typeof measure;
  mount: typeof mountLabels;
}

/** A label as measured, with the inline boxes it left room for (D698). */
interface Laid extends Measured {
  readonly boxes: readonly InlineBox[];
}

/** What one render keeps between its labels, and for `afterMount`. */
interface State {
  sanitize?: Sanitize;
  measured?: Map<string, Laid>;
}

/** Whether this render draws HTML labels at all (D696, D697). */
function enabled(ctx: HookContext): boolean {
  const html = (ctx.config as { html?: { labels?: unknown } }).html;
  return html?.labels !== false && ctx.deterministic !== true;
}

/** The wrapper's classes: v12 gave a node's and a group's label `nodeLabel`, an edge's `edgeLabel`. */
const classOf = (role: LabelRequest['role']): string =>
  role ? `${LABEL_CLASS} ${role === 'edge' ? 'edgeLabel' : 'nodeLabel'}` : LABEL_CLASS;

/**
 * The label `raw` measured in `document`, once per render for each font, wrap width and role.
 * Its math and icons are boxed by the render's inline providers first (D698): the HTML is made
 * from what is left, with a placeholder character where each box goes.
 */
function measured(
  env: Env,
  document: Document,
  raw: string,
  request: LabelRequest,
  ctx: HookContext
): Laid {
  const { font, maxWidth, markup, role } = request;
  const state = ctx.state as State;
  // Layout and drawing may both ask for a label.
  const key = [markup, maxWidth, role, font.family, font.size, font.weight, raw].join('\n');
  const known = (state.measured ??= new Map<string, Laid>());
  let label = known.get(key);
  if (!label) {
    state.sanitize ??= env.sanitizer(document, ctx);
    const spans = request.inline(raw);
    const boxes = spans?.boxes ?? [];
    const html = labelHtml(spans?.source ?? raw, markup);
    const source = { html, font, maxWidth, className: classOf(role), boxes };
    label = { ...env.measure(document, state.sanitize, source), boxes };
    known.set(key, label);
  }
  return label;
}

/** Each inline box of `label` at the place its room has in the HTML. */
function placed({ boxes, at }: Laid): SvgFragment[] {
  return boxes.flatMap((box, i) => {
    const where = at[i];
    return where
      ? [{ tag: 'g', attrs: { transform: translate(where.x, where.y) }, children: [box.node] }]
      : [];
  });
}

/** The extension that measures, sanitizes and mounts through `env`. */
export function extensionWith(env: Env): ExtensionPlugin<Element, unknown> {
  return {
    id: 'html-labels',
    config: configFragment,
    label: {
      box(raw, request, ctx): InlineBox | undefined {
        if (!enabled(ctx) || raw.trim() === '') return undefined;
        const document = env.document();
        if (!document) return undefined;
        const label = measured(env, document, raw, request, ctx);
        const { width, height, html } = label;
        const { ascent, lineHeight } = request.metrics;
        return {
          width,
          height,
          // Centred on the line: a label taller than a line of text grows it evenly.
          baseline: ascent + Math.max(0, height - lineHeight) / 2,
          node: {
            tag: 'g',
            attrs: { class: PLACEHOLDER_CLASS },
            children: [
              { tag: 'rect', attrs: { width, height, fill: 'none' } },
              { tag: 'desc', children: [html] },
              ...placed(label),
            ],
          },
        };
      },
    },
    afterMount(el, _result, state) {
      const { sanitize } = state as State;
      // Without a sanitizer, this render boxed no label: there is nothing to swap.
      if (sanitize) env.mount(el, sanitize);
    },
  };
}
