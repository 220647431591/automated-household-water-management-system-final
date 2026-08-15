// ============================================================
// api/_lib/http.ts — small helpers shared by every /api/*.ts function.
//
// Vercel Node.js functions use the classic (req, res) signature
// (VercelRequest/VercelResponse), which are Node's IncomingMessage /
// ServerResponse with a few conveniences layered on (req.query, req.body,
// req.cookies are parsed automatically for standard content types).
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";

/** Origins allowed to call this API from a browser (comma-separated env var). */
function allowedOrigins(): string[] {
  const raw = process.env.ALLOWED_ORIGINS;
  if (raw && raw.trim() !== "") {
    return raw.split(",").map((o) => o.trim()).filter(Boolean);
  }
  // Sensible local-dev defaults when ALLOWED_ORIGINS isn't set yet.
  return ["http://localhost:8080", "http://localhost:3000", "http://localhost:5173"];
}

/**
 * Apply CORS + baseline security headers, and short-circuit CORS preflight
 * (OPTIONS) requests. Returns true if the caller should stop processing
 * (i.e. this was a preflight request and a response was already sent).
 *
 * Note: when the frontend and API are deployed together on the same Vercel
 * project (the recommended setup), the browser never even sends a CORS
 * preflight, because the calls are same-origin. This exists for:
 *   - local development (frontend on :5173/:8080, API on :3000 or Vercel dev)
 *   - a frontend hosted on a different domain than the API
 * The ESP32 is not a browser, so CORS headers don't apply to it at all —
 * device auth is handled separately (see requireDevice in auth.ts).
 */
export function applyCors(req: VercelRequest, res: VercelResponse): boolean {
  const origin = (req.headers.origin as string) || "";
  if (origin && allowedOrigins().includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Requested-With, X-Device-Token");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  }

  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return true;
  }
  return false;
}

/** Send a JSON payload, matching the PHP backend's `json_out()` helper. */
export function jsonOut(res: VercelResponse, payload: Record<string, unknown>, status = 200): void {
  res.status(status).json(payload);
}

export function methodNotAllowed(res: VercelResponse): void {
  jsonOut(res, { success: false, message: "Method not allowed" }, 405);
}

/**
 * Log the real error server-side, but never leak internals (DB details,
 * stack traces, file paths) to the client — mirrors the PHP `server_error()`
 * helper. In development (VERCEL_ENV !== 'production'), the message is also
 * included in the response to speed up debugging.
 */
export function serverError(res: VercelResponse, err: unknown, context = ""): void {
  // eslint-disable-next-line no-console
  console.error(`[${context || "server_error"}]`, err);
  const payload: Record<string, unknown> = {
    success: false,
    message: "Something went wrong on our end. Please try again.",
  };
  if (process.env.VERCEL_ENV !== "production") {
    payload.debug = err instanceof Error ? err.message : String(err);
  }
  jsonOut(res, payload, 500);
}

/**
 * Read a string field out of the parsed request body (works whether the
 * client sent JSON or a form-encoded body — Vercel parses both into
 * req.body automatically based on Content-Type).
 */
export function field(req: VercelRequest, key: string, fallback = ""): string {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const value = body[key];
  if (value === undefined || value === null) return fallback;
  return String(value).trim();
}

/** Read a string field out of the query string. */
export function query(req: VercelRequest, key: string, fallback = ""): string {
  const value = req.query[key];
  if (Array.isArray(value)) return value[0] ?? fallback;
  return value ?? fallback;
}

export function clientIp(req: VercelRequest): string {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length > 0) return fwd.split(",")[0].trim();
  return req.socket?.remoteAddress || "0.0.0.0";
}

/**
 * A bare HTML <form> cannot set a custom header, and only an origin already
 * on the ALLOWED_ORIGINS CORS allowlist can send one cross-site from a
 * browser via fetch(). This is the same lightweight CSRF defense the PHP
 * backend used (see src/lib/api.ts, which always sends this header).
 */
export function requireCsrfHeader(req: VercelRequest, res: VercelResponse): boolean {
  const requested = req.headers["x-requested-with"];
  if (typeof requested !== "string" || requested.toLowerCase() !== "xmlhttprequest") {
    jsonOut(res, { success: false, message: "Invalid request" }, 403);
    return false;
  }
  return true;
}
