// ============================================================
// api/auth/[action].ts — consolidated auth group.
//
// Vercel Hobby caps a deployment at 12 Serverless Functions. This project
// originally had one file per endpoint (login.ts, register.ts, logout.ts,
// me.ts, forgot-password.ts, reset-password.ts, ...) which is easy to read
// but creates one Function per file. A dynamic route file like this one
// ([action].ts) is still exactly ONE Serverless Function no matter how many
// `action` values it handles, so grouping related endpoints here (and in
// api/account, api/data, api/notifications, api/device) drops the total
// function count from 19 to 5 while keeping each handler's logic untouched.
//
// vercel.json rewrites map the original flat paths the frontend already
// calls (/api/login, /api/register, /api/me, ...) onto
// /api/auth/<action>, so src/lib/api.ts and every frontend call site are
// completely unchanged.
//
// Each action below is copied verbatim from the original single-purpose
// file it replaces — same validation, same status codes, same messages.
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import crypto from "crypto";
import { getSql } from "../_lib/db.js";
import { applyCors, jsonOut, methodNotAllowed, serverError, field, clientIp } from "../_lib/http.js";
import { verifyPassword, hashPassword } from "../_lib/password.js";
import { createSession, clearSession, readSession } from "../_lib/auth.js";
import { rateLimit } from "../_lib/rateLimit.js";
import { sendEmail, renderResetEmail } from "../_lib/mailer.js";

interface UserRow {
  id: number;
  email: string;
  password_hash: string;
  name: string | null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;

  const action = Array.isArray(req.query.action) ? req.query.action[0] : req.query.action;

  switch (action) {
    case "login":
      return handleLogin(req, res);
    case "register":
      return handleRegister(req, res);
    case "logout":
      return handleLogout(req, res);
    case "me":
      return handleMe(req, res);
    case "forgot-password":
      return handleForgotPassword(req, res);
    case "reset-password":
      return handleResetPassword(req, res);
    default:
      return jsonOut(res, { success: false, message: "Unknown auth action" }, 404);
  }
}

// ---- login (was api/login.ts) ----
async function handleLogin(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return methodNotAllowed(res);

  const email = field(req, "email").toLowerCase();
  const password = field(req, "password");

  if (email === "" || password === "") {
    return jsonOut(res, { success: false, message: "Email and password are required" });
  }

  const bucket = `login:${clientIp(req)}:${email}`;
  if (!(await rateLimit(bucket, 10, 300))) {
    return jsonOut(res, { success: false, message: "Too many attempts. Try again in a few minutes." }, 429);
  }

  try {
    const sql = getSql();
    const rows = (await sql`
      SELECT id, email, password_hash, name FROM users WHERE email = ${email} LIMIT 1
    `) as UserRow[];
    const user = rows[0];

    if (!user || !(await verifyPassword(password, user.password_hash))) {
      await new Promise((r) => setTimeout(r, 200)); // constant-ish delay to reduce timing signal
      return jsonOut(res, { success: false, message: "Invalid email or password" });
    }

    // Opportunistically rehash old PHP $2y$ hashes into our native $2b$ format.
    if (user.password_hash.startsWith("$2y$")) {
      const rehash = await hashPassword(password);
      await sql`UPDATE users SET password_hash = ${rehash} WHERE id = ${user.id}`;
    }

    await createSession(res, { userId: user.id, email: user.email });

    return jsonOut(res, {
      success: true,
      message: "Login successful",
      user: { id: user.id, email: user.email, name: user.name ?? null },
    });
  } catch (err) {
    return serverError(res, err, "login");
  }
}

// ---- register (was api/register.ts) ----
async function handleRegister(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return methodNotAllowed(res);

  const email = field(req, "email");
  const password = field(req, "password");

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!emailOk) {
    return jsonOut(res, { success: false, message: "Invalid email address" });
  }
  if (password.length < 8) {
    return jsonOut(res, { success: false, message: "Password must be at least 8 characters" });
  }
  if (email.length > 100) {
    return jsonOut(res, { success: false, message: "Email is too long" });
  }

  try {
    const sql = getSql();
    const existing = await sql`SELECT 1 FROM users WHERE email = ${email} LIMIT 1`;
    if (existing.length > 0) {
      return jsonOut(res, { success: false, message: "An account with this email already exists" });
    }

    const hash = await hashPassword(password);
    await sql`INSERT INTO users (email, password_hash) VALUES (${email}, ${hash})`;

    return jsonOut(res, { success: true, message: "Account created" });
  } catch (err) {
    return serverError(res, err, "register");
  }
}

// ---- logout (was api/logout.ts) ----
async function handleLogout(req: VercelRequest, res: VercelResponse) {
  clearSession(res);
  return jsonOut(res, { success: true, message: "Logged out" });
}

// ---- me (was api/me.ts) ----
async function handleMe(req: VercelRequest, res: VercelResponse) {
  const session = await readSession(req);
  if (!session) {
    return jsonOut(res, { success: false, user: null }, 200);
  }

  try {
    const sql = getSql();
    const rows = (await sql`
      SELECT id, email, name, household_id, location FROM users WHERE id = ${session.userId} LIMIT 1
    `) as {
      id: number;
      email: string;
      name: string | null;
      household_id: string | null;
      location: string | null;
    }[];
    const user = rows[0];
    if (!user) {
      return jsonOut(res, { success: false, user: null }, 200);
    }

    return jsonOut(res, {
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name ?? null,
        householdId: user.household_id ?? "",
        location: user.location ?? "",
      },
    });
  } catch (err) {
    return serverError(res, err, "me");
  }
}

// ---- forgot-password (was api/forgot-password.ts) ----
async function handleForgotPassword(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return methodNotAllowed(res);

  if (!(await rateLimit(`forgot:${clientIp(req)}`, 5, 600))) {
    return jsonOut(res, { success: false, message: "Too many requests, try again later" }, 429);
  }

  const email = field(req, "email").toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonOut(res, { success: false, message: "Invalid email address" });
  }

  // Prefer the Origin header (normal browser requests). Fall back to
  // FRONTEND_URL for callers that don't send one, so the emailed link is
  // never a bare relative path.
  const origin = (req.headers.origin as string) || process.env.FRONTEND_URL || "";
  const resetUrlBase = origin.replace(/\/$/, "") + "/reset-password";

  try {
    const sql = getSql();
    const rows = (await sql`SELECT id FROM users WHERE email = ${email} LIMIT 1`) as { id: number }[];
    const user = rows[0];

    let devLink: string | null = null;

    // Always report success so an attacker can't enumerate valid emails.
    if (user) {
      const token = crypto.randomBytes(32).toString("hex");
      const expires = new Date(Date.now() + 3600 * 1000); // 1 hour

      await sql`UPDATE users SET reset_token = ${token}, reset_expires = ${expires.toISOString()} WHERE id = ${user.id}`;

      devLink = `${resetUrlBase}?token=${encodeURIComponent(token)}`;
      const mailResult = await sendEmail(email, "Reset your password", renderResetEmail(devLink));
      // eslint-disable-next-line no-console
      console.log(`[forgot-password] Reset email to ${email}: ${mailResult.message}`);
    }

    const payload: Record<string, unknown> = {
      success: true,
      message: "If that email exists, a reset link has been sent",
    };

    // Expose the dev link only outside production, so real deployments never leak it.
    if (process.env.VERCEL_ENV !== "production" && devLink) {
      payload.dev_reset_link = devLink;
    }

    return jsonOut(res, payload);
  } catch (err) {
    return serverError(res, err, "forgot-password");
  }
}

// ---- reset-password (was api/reset-password.ts) ----
async function handleResetPassword(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return methodNotAllowed(res);

  if (!(await rateLimit(`reset:${clientIp(req)}`, 10, 600))) {
    return jsonOut(res, { success: false, message: "Too many requests, try again later" }, 429);
  }

  const token = field(req, "token");
  const newPassword = field(req, "password");

  if (token === "" || token.length < 32) {
    return jsonOut(res, { success: false, message: "Invalid or missing reset token" });
  }

  // Password strength — must match the frontend zod schema.
  if (
    newPassword.length < 8 ||
    !/[A-Z]/.test(newPassword) ||
    !/[a-z]/.test(newPassword) ||
    !/\d/.test(newPassword)
  ) {
    return jsonOut(res, {
      success: false,
      message: "Password must be 8+ chars with upper, lower, and a number",
    });
  }

  try {
    const sql = getSql();
    const rows = (await sql`
      SELECT id, reset_expires FROM users WHERE reset_token = ${token} LIMIT 1
    `) as { id: number; reset_expires: string | null }[];
    const user = rows[0];

    if (!user) {
      return jsonOut(res, { success: false, message: "Invalid or expired reset token" });
    }
    if (!user.reset_expires || new Date(user.reset_expires).getTime() < Date.now()) {
      return jsonOut(res, { success: false, message: "This reset link has expired" });
    }

    const hash = await hashPassword(newPassword);
    await sql`
      UPDATE users
         SET password_hash = ${hash}, reset_token = NULL, reset_expires = NULL
       WHERE id = ${user.id}
    `;

    return jsonOut(res, { success: true, message: "Password updated. You can now sign in." });
  } catch (err) {
    return serverError(res, err, "reset-password");
  }
}
