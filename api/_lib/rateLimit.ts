// ============================================================
// api/_lib/rateLimit.ts — rate limiting for login/reset/test-email.
//
// The PHP backend used a local temp-file counter. Vercel functions don't
// share a filesystem across invocations (each one may run on a different
// machine, and disk is wiped between cold starts), so that approach can't
// carry over. This uses a small Postgres table instead — cheap, correct
// across all regions/instances, and needs no extra service.
// ============================================================

import { getSql } from "./db.js";

/**
 * Returns true if the caller is still within their allowed rate, and
 * records this attempt. Returns false if they've exceeded `max` attempts
 * within the last `windowSeconds`.
 */
export async function rateLimit(bucket: string, max: number, windowSeconds: number): Promise<boolean> {
  const sql = getSql();

  const rows = (await sql`
    SELECT COUNT(*)::int AS count
    FROM rate_limit_hits
    WHERE bucket = ${bucket}
      AND created_at >= NOW() - (${windowSeconds} || ' seconds')::interval
  `) as { count: number }[];

  const count = rows[0]?.count ?? 0;
  if (count >= max) return false;

  await sql`INSERT INTO rate_limit_hits (bucket) VALUES (${bucket})`;
  return true;
}
