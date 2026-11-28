/**
 * Gantt's date and time-axis code (D271): the dayjs subset v12's gantt uses (`dates.ts`) and the
 * d3-time / d3-time-format subset its axis uses (`axis.ts`). Local time
 * (D270); nothing here reads the clock, so callers pass `now`.
 */
export {
  WEEKDAYS,
  add,
  addDays,
  format,
  isValid,
  isoDate,
  isoWeekday,
  parseDuration,
  parseStrict,
  readEndDate,
  readStartDate,
  type Unit,
} from './dates.ts';
export { autoTicks, intervalTicks, timeFormat, type TickUnit } from './axis.ts';
