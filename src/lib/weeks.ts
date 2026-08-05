import { addDays, format, startOfWeek } from "date-fns";

/** Monday of the week containing `d`, as YYYY-MM-DD. */
export function weekStartOf(d: Date): string {
  return format(startOfWeek(d, { weekStartsOn: 1 }), "yyyy-MM-dd");
}

export function weekDays(weekStart: string): string[] {
  const start = new Date(weekStart + "T00:00:00");
  return Array.from({ length: 7 }, (_, i) => format(addDays(start, i), "yyyy-MM-dd"));
}

export function shiftWeek(weekStart: string, weeks: number): string {
  return format(addDays(new Date(weekStart + "T00:00:00"), weeks * 7), "yyyy-MM-dd");
}

export function weekEndOf(weekStart: string): string {
  return format(addDays(new Date(weekStart + "T00:00:00"), 6), "yyyy-MM-dd");
}

export const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
