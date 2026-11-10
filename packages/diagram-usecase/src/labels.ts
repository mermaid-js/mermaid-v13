import type { DiagramIcon } from '@mermaid-js/core';
import { relationText, stereotypeText } from './layout/prepare.ts';
import { ANGLE_QUOTES, ASCII_QUOTES, type Quotes } from './layout/sizing.ts';
import type { UsecaseModel } from './model.ts';

/**
 * Every text the usecase layout hands to core's label layout (D176, D178), as written, with the
 * stereotype and include/extend `quotes` the layout measures (`«s»`; text output's `ascii`
 * charset `<<s>>`): the front-matter title, each actor's and use case's label and stereotype,
 * each note, each JSON table's id, keys and values, each boundary's title and each
 * relationship's label (`«include»`, `«extend»`, an association's).
 */
export function usecaseLabels(model: UsecaseModel, quotes: Quotes = ANGLE_QUOTES): string[] {
  const out: string[] = [];
  if (model.title?.trim()) out.push(model.title);
  for (const e of [...model.actors, ...model.useCases]) {
    out.push(e.label);
    if (e.stereotype !== undefined) out.push(stereotypeText(e.stereotype, quotes));
  }
  for (const n of model.notes) out.push(n.label);
  for (const t of model.jsonTables) {
    out.push(t.id);
    for (const r of t.rows) out.push(r.key, r.value);
  }
  for (const b of model.boundaries) out.push(b.label);
  for (const r of model.relationships) {
    const text = relationText(r, quotes);
    if (text !== undefined) out.push(text);
  }
  return out;
}

/**
 * The plugin's `labels` (`DiagramPlugin.labels`, which takes no config): what either output
 * measures, the SVG's quotes and the `ascii` charset's, each text once.
 */
export function pluginLabels(model: UsecaseModel): readonly string[] {
  return [...new Set([...usecaseLabels(model), ...usecaseLabels(model, ASCII_QUOTES)])];
}

/**
 * Every icon the renderer draws outside labels (D293): each icon actor's `icon`, with v12's
 * fallback pack `fa` (`usecaseActorIcon.ts`, `getIconSVG(… fallbackPrefix: 'fa')`).
 */
export function usecaseIcons(model: UsecaseModel): readonly DiagramIcon[] {
  const out: DiagramIcon[] = [];
  for (const a of model.actors)
    if (a.type === 'icon' && a.icon) out.push({ name: a.icon, fallbackPrefix: ICON_PACK });
  return out;
}

/** The pack a name without one is looked up in, as v12 did. */
export const ICON_PACK = 'fa';
