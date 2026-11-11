// Bundled only by diagnostics-hop4. Capture work stays outside the conversion clock.
let capture = false;
let durations = [];
let models = [];
let finalModels = [];
let calls = 0;
export function resetHop4(enabled = false) {
  capture = enabled;
  durations = [];
  models = [];
  finalModels = [];
  calls = 0;
}
export function observeHop4(model, duration) {
  calls++;
  if (duration !== undefined) durations.push(duration);
  if (capture) models.push(structuredClone(model));
}
export function observeFinal(model) {
  if (capture) finalModels.push(structuredClone(model));
}
export function hop4Stats() {
  return { calls, durations, models, finalModels };
}
export function clockPair() {
  const start = performance.now();
  return (performance.now() - start) * 1000;
}
