/**
 * The drawn domain names. The fixed domain texts (decision model, practice) are in
 * `../domains.ts`, shared with the language facet's hover.
 */
import type { CynefinDomainName } from '../model.ts';

/** A domain's drawn name: `complex` → `Complex` (v12 :178). */
export function domainTitle(name: CynefinDomainName): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}
