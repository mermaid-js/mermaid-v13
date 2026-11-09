/**
 * A node name as v12's record action read its field: trimmed, and `""` read as `"` (only a
 * quoted field holds `""`, so a bare one reads as itself trimmed). The parser, the facet's name
 * syntax and its completion share it.
 */
export function fieldName(raw: string): string {
  const trimmed = raw.trim();
  return trimmed.includes('""') ? trimmed.replaceAll('""', '"') : trimmed;
}
