// ============================================================
// api/_lib/dates.ts — calendar window helpers.
//
// The original PHP used the server's local date()/strtotime(). Vercel
// functions run in UTC, so these helpers work in UTC consistently — pick a
// single, predictable timezone rather than depending on the host's locale.
// ============================================================

const DAY_MS = 24 * 60 * 60 * 1000;

export function startOfTodayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** Monday 00:00 UTC of the week containing `date` (ISO week, Monday-based). */
export function mondayOfWeekUtc(date: Date = new Date()): Date {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = start.getUTCDay(); // 0 = Sunday .. 6 = Saturday
  const diffToMonday = day === 0 ? 6 : day - 1;
  start.setUTCDate(start.getUTCDate() - diffToMonday);
  return start;
}

export function startOfMonthUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export function daysAgoUtc(days: number): Date {
  return new Date(startOfTodayUtc().getTime() - days * DAY_MS);
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}
