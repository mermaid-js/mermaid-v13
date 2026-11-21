/**
 * The time each e2e fixture is rendered at. A gantt's today marker sits at the clock's "now",
 * so the snapshot run (`e2e/rendering/mmd-snapshots.spec.ts`) pins the browser clock and the
 * hash run (`cli/visual-hashes.ts`) pins Node's, both from this table. Browser-safe: no imports.
 *
 * Keyed by top-level folder (`gantt`) as the default for a diagram type, by a type's tier folder
 * (`gantt/baseline`), or by a fixture's full relative path when it needs the marker at a
 * specific spot (checked first).
 */
export const FIXED_CLOCKS: Readonly<Partial<Record<string, string>>> = {
  // Gantt fixtures are dated around 1010-10-10 and several of them exercise the today marker.
  gantt: '1010-10-10',
  // The v13 baselines (#385) are dated January 2024.
  'gantt/baseline': '2024-01-10T12:00:00Z',
  // Seconds-based dateFormat: lands the marker between the "01" and "02"
  // tick marks, clear of both the task-start edge and any task boundary.
  'gantt/pr-check/should-render-a-gantt-diagram-with-a-vert-tag.mmd': '1010-10-10T00:00:01.500Z',
  // An `after`/`until` naming no task falls back to today: keep today beside the 2013 task.
  'gantt/nightly-check/should-warn-about-unknown-ids-in-an-after-statement-issue-4121.mmd':
    '2013-01-10T12:00:00Z',
  'gantt/nightly-check/should-warn-about-unknown-ids-in-an-until-statement.mmd':
    '2013-01-10T12:00:00Z',
};

/** The fixed time for a fixture (a path relative to `e2e/diagrams`), if it has one. */
export const fixedClockFor = (relativePath: string): string | undefined => {
  const [type, tier] = relativePath.split('/');
  return FIXED_CLOCKS[relativePath] ?? FIXED_CLOCKS[`${type}/${tier}`] ?? FIXED_CLOCKS[type ?? ''];
};
