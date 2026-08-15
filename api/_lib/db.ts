// ============================================================
// api/_lib/db.ts — Postgres connection (Neon serverless driver).
//
// Uses @neondatabase/serverless, which talks to Postgres over HTTP/WebSocket
// instead of a long-lived TCP connection. This is what makes it safe to use
// from Vercel Serverless Functions, where every invocation is a fresh,
// short-lived process — a normal `pg` Pool would exhaust your database's
// connection limit under load.
//
// Works with any Postgres that's reachable from the internet, but is
// designed for Neon's free tier (https://neon.tech), which is what the
// deployment guide recommends.
// ============================================================

import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

let cached: NeonQueryFunction<false, false> | null = null;

/**
 * Tagged-template SQL client. Usage:
 *   const rows = await sql`SELECT * FROM users WHERE id = ${id}`;
 * Values are always sent as parameters — never interpolated into the query
 * string — so this is SQL-injection safe by construction.
 */
export function getSql(): NeonQueryFunction<false, false> {
  if (cached) return cached;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Add it in Vercel → Project → Settings → Environment Variables.",
    );
  }

  cached = neon(connectionString);
  return cached;
}
