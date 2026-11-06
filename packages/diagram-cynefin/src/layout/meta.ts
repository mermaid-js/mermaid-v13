/**
 * The fixed domain texts the layout draws (`../domains.ts`, shared with the language facet's
 * hover) and the drawn domain names.
 */
import type { CynefinDomainName } from '../model.ts';

export { DOMAIN_META } from '../domains.ts';
export type { CynefinDomainMeta } from '../domains.ts';

/** A domain's drawn name: `complex` → `Complex` (v12 :178). */
export function domainTitle(name: CynefinDomainName): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}
