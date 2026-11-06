/**
 * The fixed domain texts (v12 `cynefinRenderer.ts` :23-29, `mermaid@12.2.0`): each quadrant's
 * decision model and practice, and confusion's `Disorder`. Plain constants, drawn as written
 * (D363): U+2192 arrows and British "Analyse" and "Categorise", as in v12.
 */
import type { CynefinDomainName } from '../model.ts';

export interface CynefinDomainMeta {
  /** The decision model; confusion has none. */
  readonly model: string;
  readonly practice: string;
}

export const DOMAIN_META: Readonly<Record<CynefinDomainName, CynefinDomainMeta>> = {
  complex: { model: 'Probe → Sense → Respond', practice: 'Emergent Practices' },
  complicated: { model: 'Sense → Analyse → Respond', practice: 'Good Practices' },
  clear: { model: 'Sense → Categorise → Respond', practice: 'Best Practices' },
  chaotic: { model: 'Act → Sense → Respond', practice: 'Novel Practices' },
  confusion: { model: '', practice: 'Disorder' },
};

/** A domain's drawn name: `complex` → `Complex` (v12 :178). */
export function domainTitle(name: CynefinDomainName): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}
