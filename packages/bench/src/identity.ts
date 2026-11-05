/**
 * The identity gate (D200): every fixture rendered by the working tree (`v13`) and by the base
 * ref (`v13-base`), with the same id and source, must give the same SVG string.
 */

/**
 * One renderer's result for a fixture: its SVG string, the text of the error it threw, or the
 * timeout (ms) it ran past. A timeout is never identical to anything: nothing was compared.
 */
export type IdentityOutcome = { svg: string } | { error: string } | { timeout: number };

export interface IdentityPair {
  id: string;
  head: IdentityOutcome;
  base: IdentityOutcome;
}

export interface IdentityDifference {
  id: string;
  /** What differs, for the log. */
  reason: string;
}

export interface IdentityResult {
  compared: number;
  /** Identical fixtures that failed in both, with the same error text. */
  failedInBoth: number;
  differing: IdentityDifference[];
}

/** Index of the first character where `a` and `b` differ (the shorter length if one is a prefix). */
function firstDifference(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a.charCodeAt(i) === b.charCodeAt(i)) i++;
  return i;
}

/** Why `head` and `base` are not identical, or undefined when they are. */
function difference(head: IdentityOutcome, base: IdentityOutcome): string | undefined {
  if ('timeout' in head) return `head timed out after ${head.timeout} ms`;
  if ('timeout' in base) return `base timed out after ${base.timeout} ms`;
  if ('svg' in head && 'svg' in base) {
    if (head.svg === base.svg) return undefined;
    return `SVG differs at offset ${firstDifference(head.svg, base.svg)}`;
  }
  if ('error' in head && 'error' in base) {
    if (head.error === base.error) return undefined;
    return `errors differ: ${JSON.stringify(head.error)} (head), ${JSON.stringify(base.error)} (base)`;
  }
  if ('error' in head) return `head failed: ${head.error}`;
  return 'error' in base ? `base failed: ${base.error}` : undefined;
}

export function compareIdentity(pairs: IdentityPair[]): IdentityResult {
  const differing: IdentityDifference[] = [];
  let failedInBoth = 0;
  for (const { id, head, base } of pairs) {
    const reason = difference(head, base);
    if (reason !== undefined) differing.push({ id, reason });
    else if ('error' in head) failedInBoth++;
  }
  return { compared: pairs.length, failedInBoth, differing };
}

export interface IdentityReport {
  lines: string[];
  exitCode: number;
}

/** The lines the bench prints for the gate, and its exit code. */
export function identityReport(result: IdentityResult): IdentityReport {
  const { compared, failedInBoth, differing } = result;
  if (compared === 0) return { lines: ['Identity: no fixtures compared'], exitCode: 1 };
  const failed = failedInBoth > 0 ? ` (${failedInBoth} fail in both with the same error)` : '';
  const head = `Identity: ${compared - differing.length} of ${compared} identical${failed}`;
  if (differing.length === 0) return { lines: [head], exitCode: 0 };
  return {
    lines: [
      `${head}; ${differing.length} differ:`,
      ...differing.map((d) => `  ${d.id}: ${d.reason}`),
    ],
    exitCode: 1,
  };
}
