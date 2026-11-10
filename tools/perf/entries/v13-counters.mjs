export const counters = { parserCalls: 0, measurerCalls: 0, metricsCalls: 0, stages: {} };
export function recordStage(stage, ms) {
  const entry = (counters.stages[stage] ??= { calls: 0, ms: 0 });
  entry.calls++;
  entry.ms += ms;
}
// Only inspect() enables the second, unwrapped layout. Counter collection never enables it.
export const inspection = { enabled: false, labels: 0, wideLabels: 0 };
export function observeLabel(raw, font, maxWidth, measurer, options, layout) {
  if (!inspection.enabled || !raw) return;
  inspection.labels++;
  if (
    Number.isFinite(maxWidth) &&
    maxWidth > 0 &&
    layout(raw, font, Infinity, measurer, options).width > maxWidth
  )
    inspection.wideLabels++;
}
