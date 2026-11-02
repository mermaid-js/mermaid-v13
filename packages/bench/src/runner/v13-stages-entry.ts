// Entry of the instrumented v13 build (`__MERMAID_BENCH__` = true). Bundling the stage clock
// with `mermaid` keeps one copy of core, so the clock the runner installs is the one the
// pipeline reads.
export * from 'mermaid';
export { installStageClock } from '@mermaid-js/core/timing';
