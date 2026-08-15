// ============================================================
// api/notifications/[action].ts — consolidated notifications group.
// Replaces api/notification-settings.ts, api/notification-history.ts,
// api/test-email.ts. See api/auth/[action].ts for why this consolidation
// exists.
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSql } from "../_lib/db.js";
import { applyCors, jsonOut, methodNotAllowed, serverError, field, query, requireCsrfHeader } from "../_lib/http.js";
import { requireLogin } from "../_lib/auth.js";
import { rateLimit } from "../_lib/rateLimit.js";
import { sendEmail, renderTestEmail } from "../_lib/mailer.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;

  const action = Array.isArray(req.query.action) ? req.query.action[0] : req.query.action;

  switch (action) {
    case "notification-settings":
      return handleNotificationSettings(req, res);
    case "notification-history":
      return handleNotificationHistory(req, res);
    case "test-email":
      return handleTestEmail(req, res);
    default:
      return jsonOut(res, { success: false, message: "Unknown notifications action" }, 404);
  }
}

// ---- notification-settings (was api/notification-settings.ts) ----
async function handleNotificationSettings(req: VercelRequest, res: VercelResponse) {
  const uid = await requireLogin(req, res);
  if (uid === null) return;

  const sql = getSql();

  if (req.method === "GET") {
    try {
      const rows = (await sql`
        SELECT notification_email, notify_leakage FROM users WHERE id = ${uid}
      `) as { notification_email: string | null; notify_leakage: boolean }[];
      const row = rows[0];
      return jsonOut(res, {
        success: true,
        notification_email: row?.notification_email ?? "",
        notify_leakage: row?.notify_leakage ? 1 : 0,
      });
    } catch (err) {
      return serverError(res, err, "notification-settings");
    }
  }

  if (req.method !== "POST") return methodNotAllowed(res);
  if (!requireCsrfHeader(req, res)) return;

  const email = field(req, "notification_email");
  const notify = field(req, "notify_leakage", "1") === "1";

  if (email !== "" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonOut(res, { success: false, message: "Invalid notification email" });
  }

  try {
    await sql`
      UPDATE users SET notification_email = ${email}, notify_leakage = ${notify} WHERE id = ${uid}
    `;
    return jsonOut(res, { success: true, message: "Notification preferences saved" });
  } catch (err) {
    return serverError(res, err, "notification-settings");
  }
}

// ---- notification-history (was api/notification-history.ts) ----
async function handleNotificationHistory(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return methodNotAllowed(res);

  const uid = await requireLogin(req, res);
  if (uid === null) return;

  const limit = Math.max(1, Math.min(100, Number(query(req, "limit", "25")) || 25));

  try {
    const sql = getSql();
    const rows = (await sql`
      SELECT n.id, n.event_id, n.recipient, n.status, n.message, n.created_at,
             l.severity, l.volume
        FROM notifications_log n
   LEFT JOIN leakage_events l ON l.id = n.event_id
       WHERE n.user_id = ${uid}
    ORDER BY n.created_at DESC
       LIMIT ${limit}
    `) as {
      id: number;
      event_id: number | null;
      recipient: string;
      status: string;
      message: string | null;
      created_at: string;
      severity: string | null;
      volume: string | null;
    }[];

    const history = rows.map((r) => ({
      id: r.id,
      eventId: r.event_id,
      recipient: r.recipient,
      status: r.status,
      message: r.message,
      time: r.created_at,
      severity: r.severity,
      volume: r.volume !== null ? Number(r.volume) : null,
    }));

    return jsonOut(res, { success: true, history });
  } catch (err) {
    return serverError(res, err, "notification-history");
  }
}

// ---- test-email (was api/test-email.ts) ----
async function handleTestEmail(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return methodNotAllowed(res);

  const uid = await requireLogin(req, res);
  if (uid === null) return;

  if (!(await rateLimit(`test_email:${uid}`, 5, 600))) {
    return jsonOut(res, { success: false, message: "Too many test emails, try again later" }, 429);
  }

  try {
    const sql = getSql();
    const rows = (await sql`
      SELECT email, notification_email FROM users WHERE id = ${uid}
    `) as { email: string; notification_email: string | null }[];
    const user = rows[0];
    if (!user) {
      return jsonOut(res, { success: false, message: "User not found" }, 404);
    }

    const to = user.notification_email || user.email;
    const sentAt = new Date().toISOString().replace("T", " ").slice(0, 19);
    const html = renderTestEmail(sentAt);

    const result = await sendEmail(to, "Test Email — Automated Household Water Management System", html);

    await sql`
      INSERT INTO notifications_log (user_id, event_id, recipient, status, message)
      VALUES (${uid}, NULL, ${to}, ${result.success ? "sent" : "failed"}, ${result.message})
    `;

    return jsonOut(res, { success: true, sent: result.success, to, mail: result.message });
  } catch (err) {
    return serverError(res, err, "test-email");
  }
}
