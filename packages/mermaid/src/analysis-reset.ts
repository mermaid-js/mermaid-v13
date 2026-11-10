/**
 * Non-public performance-harness seam. Clearing analyses preserves the instance's config,
 * registry and loaded resources. This module is deliberately absent from package exports.
 */
const resets = new WeakMap<object, () => void>();

export function registerAnalysisReset(instance: object, reset: () => void): void {
  resets.set(instance, reset);
}

/** Fails closed if a harness is paired with an instance from a different module/build. */
export function resetAnalysis(instance: object): void {
  const reset = resets.get(instance);
  if (!reset) throw new Error('Analysis reset is not registered for this Mermaid instance');
  reset();
}
