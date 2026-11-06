/**
 * The fixed domain texts (v12 `cynefinRenderer.ts` :23-29, :178, `mermaid@12.2.0`): each
 * domain's drawn name, each quadrant's decision model and practice, and confusion's `Disorder`. Plain constants, drawn as written
 * (D363): U+2192 arrows and British "Analyse" and "Categorise", as in v12. The layout draws
 * them as subtitles and the language facet's hover shows them, so they live outside `layout/`
 * (the `./language` bundle holds no layout code, R-LANG-8).
 */
import type { CynefinDomainName } from './model.ts';

export interface CynefinDomainMeta {
  /** The decision model; confusion has none. */
  readonly model: string;
  readonly practice: string;
}

/** A domain's drawn name: `complex` → `Complex` (v12 :178). */
export function domainTitle(name: CynefinDomainName): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export const DOMAIN_META: Readonly<Record<CynefinDomainName, CynefinDomainMeta>> = {
  complex: { model: 'Probe → Sense → Respond', practice: 'Emergent Practices' },
  complicated: { model: 'Sense → Analyse → Respond', practice: 'Good Practices' },
  clear: { model: 'Sense → Categorise → Respond', practice: 'Best Practices' },
  chaotic: { model: 'Act → Sense → Respond', practice: 'Novel Practices' },
  confusion: { model: '', practice: 'Disorder' },
};
