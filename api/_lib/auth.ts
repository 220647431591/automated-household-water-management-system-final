// ============================================================
// api/_lib/auth.ts — session handling for the Vercel backend.
//
// PHP used server-side sessions ($_SESSION, a cookie holding just a
// session ID that pointed at server-stored state). Vercel functions are
// stateless — each invocation may run on a different machine — so there is
// nowhere to store that server-side state. The standard replacement is a
// signed, httpOnly JWT held in the cookie itself: the cookie *is* the
// session, cryptographically signed so it can't be forged or tampered with
// (JWT_SECRET never leaves the server).
//
// This preserves the same behavior the frontend relies on:
//   - the browser never sees the token's contents or the secret
//   - the cookie is sent automatically via `credentials: "include"`
//   - login sets it, logout clears it, `me` reads it
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { SignJWT, jwtVerify } from "jose";
import { serialize, parse as parseCookie } from "cookie";
import { jsonOut } from "./http.js";

const COOKIE_NAME = "whms_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days, similar to a typical PHP session lifetime

function secretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "JWT_SECRET is not set (or too short). Set a long random string in your Vercel environment variables.",
    );
  }
  return new TextEncoder().encode(secret);
}

export interface SessionPayload {
  userId: number;
  email: string;
}

/** Create the signed session cookie and attach it to the response (login). */
export async function createSession(res: VercelResponse, payload: SessionPayload): Promise<void> {
  const token = await new SignJWT({ email: payload.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(payload.userId))
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secretKey());

  const isProd = process.env.VERCEL_ENV === "production";
  res.setHeader(
    "Set-Cookie",
    serialize(COOKIE_NAME, token, {
      httpOnly: true,
      secure: isProd || process.env.VERCEL === "1",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_TTL_SECONDS,
    }),
  );
}

/** Clear the session cookie (logout). */
export function clearSession(res: VercelResponse): void {
  const isProd = process.env.VERCEL_ENV === "production";
  res.setHeader(
    "Set-Cookie",
    serialize(COOKIE_NAME, "", {
      httpOnly: true,
      secure: isProd || process.env.VERCEL === "1",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    }),
  );
}

/** Read + verify the session cookie. Returns null if absent/invalid/expired. */
export async function readSession(req: VercelRequest): Promise<SessionPayload | null> {
  const header = req.headers.cookie;
  if (!header) return null;
  const cookies = parseCookie(header);
  const token = cookies[COOKIE_NAME];
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secretKey());
    const userId = Number(payload.sub);
    if (!Number.isFinite(userId)) return null;
    return { userId, email: String(payload.email ?? "") };
  } catch {
    return null;
  }
}

/**
 * Mirrors the PHP `require_login()` helper: reads the session, and if
 * missing/invalid sends a 401 JSON response and returns null so the caller
 * can `return` immediately.
 */
export async function requireLogin(req: VercelRequest, res: VercelResponse): Promise<number | null> {
  const session = await readSession(req);
  if (!session) {
    jsonOut(res, { success: false, message: "Not authenticated" }, 401);
    return null;
  }
  return session.userId;
}
