/** Local calendar date as YYYY-MM-DD (browser timezone) */
export function getToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function formatDateISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseDateISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso: string, days: number): string {
  const date = parseDateISO(iso);
  date.setDate(date.getDate() + days);
  return formatDateISO(date);
}

export function compareDates(a: string, b: string): number {
  return a.localeCompare(b);
}

export function isToday(iso: string): boolean {
  return iso === getToday();
}

export function isPastDate(iso: string): boolean {
  return compareDates(iso, getToday()) < 0;
}

export function isFutureDate(iso: string): boolean {
  return compareDates(iso, getToday()) > 0;
}

export function formatDisplayDate(iso: string): string {
  const date = parseDateISO(iso);
  const today = getToday();
  const tomorrow = addDays(today, 1);
  const yesterday = addDays(today, -1);

  if (iso === today) return "Today";
  if (iso === tomorrow) return "Tomorrow";
  if (iso === yesterday) return "Yesterday";

  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function formatFullDate(iso: string): string {
  return parseDateISO(iso).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/** Days of completion history to load from Supabase */
export const COMPLETION_HISTORY_DAYS = 365;

/** Days ahead to preview upcoming tasks */
export const COMPLETION_FUTURE_DAYS = 30;

export function getCompletionDateRange(anchor = getToday()): {
  from: string;
  to: string;
} {
  return {
    from: addDays(anchor, -COMPLETION_HISTORY_DAYS),
    to: addDays(anchor, COMPLETION_FUTURE_DAYS),
  };
}

export function filterCompletionsForDate<T extends { date: string }>(
  completions: T[],
  date: string
): T[] {
  return completions.filter((c) => c.date === date);
}
