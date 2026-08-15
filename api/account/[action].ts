// ============================================================
// api/account/[action].ts — consolidated account-management group.
// Replaces api/change-password.ts, api/update-profile.ts, api/delete-account.ts.
// See api/auth/[action].ts for why this consolidation exists.
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSql } from "../_lib/db.js";
import { applyCors, jsonOut, methodNotAllowed, serverError, field, requireCsrfHeader } from "../_lib/http.js";
import { requireLogin, clearSession } from "../_lib/auth.js";
import { verifyPassword, hashPassword } from "../_lib/password.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;

  const action = Array.isArray(req.query.action) ? req.query.action[0] : req.query.action;

  switch (action) {
    case "change-password":
      return handleChangePassword(req, res);
    case "update-profile":
      return handleUpdateProfile(req, res);
    case "delete-account":
      return handleDeleteAccount(req, res);
    default:
      return jsonOut(res, { success: false, message: "Unknown account action" }, 404);
  }
}

// ---- change-password (was api/change-password.ts) ----
async function handleChangePassword(req: VercelRequest, res: VercelResponse) {
  const uid = await requireLogin(req, res);
  if (uid === null) return;
  if (!requireCsrfHeader(req, res)) return;
  if (req.method !== "POST") return methodNotAllowed(res);

  const oldPassword = field(req, "oldPassword");
  const newPassword = field(req, "newPassword");

  if (newPassword.length < 8) {
    return jsonOut(res, { success: false, message: "New password must be at least 8 characters" });
  }

  try {
    const sql = getSql();
    const rows = (await sql`SELECT password_hash FROM users WHERE id = ${uid} LIMIT 1`) as {
      password_hash: string;
    }[];
    const row = rows[0];

    if (!row || !(await verifyPassword(oldPassword, row.password_hash))) {
      return jsonOut(res, { success: false, message: "Current password is incorrect" });
    }

    const hash = await hashPassword(newPassword);
    await sql`UPDATE users SET password_hash = ${hash} WHERE id = ${uid}`;

    return jsonOut(res, { success: true, message: "Password updated" });
  } catch (err) {
    return serverError(res, err, "change-password");
  }
}

// ---- update-profile (was api/update-profile.ts) ----
async function handleUpdateProfile(req: VercelRequest, res: VercelResponse) {
  const uid = await requireLogin(req, res);
  if (uid === null) return;
  if (!requireCsrfHeader(req, res)) return;
  if (req.method !== "POST") return methodNotAllowed(res);

  const name = field(req, "name");
  const householdId = field(req, "householdId");
  const location = field(req, "location");
  const email = field(req, "email");

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonOut(res, { success: false, message: "Invalid email address" });
  }

  try {
    const sql = getSql();
    const dupe = await sql`SELECT 1 FROM users WHERE email = ${email} AND id != ${uid} LIMIT 1`;
    if (dupe.length > 0) {
      return jsonOut(res, { success: false, message: "That email is already in use by another account" });
    }

    await sql`
      UPDATE users
         SET name = ${name}, household_id = ${householdId}, location = ${location}, email = ${email}
       WHERE id = ${uid}
    `;

    return jsonOut(res, { success: true, message: "Profile updated" });
  } catch (err) {
    return serverError(res, err, "update-profile");
  }
}

// ---- delete-account (was api/delete-account.ts) ----
async function handleDeleteAccount(req: VercelRequest, res: VercelResponse) {
  const uid = await requireLogin(req, res);
  if (uid === null) return;
  if (!requireCsrfHeader(req, res)) return;
  if (req.method !== "POST") return methodNotAllowed(res);

  try {
    const sql = getSql();
    await sql`DELETE FROM users WHERE id = ${uid}`;
    clearSession(res);
    return jsonOut(res, { success: true, message: "Account deleted" });
  } catch (err) {
    return serverError(res, err, "delete-account");
  }
}
