// ============================================================
// api/device/[action].ts — consolidated ESP32 ingestion group.
// Replaces api/ingest-usage.ts, api/ingest-leakage.ts. See
// api/auth/[action].ts for why this consolidation exists.
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSql } from "../_lib/db.js";
import { applyCors, jsonOut, methodNotAllowed, serverError, field } from "../_lib/http.js";
import { requireDeviceOrSession } from "../_lib/device.js";
import { sendEmail, renderLeakEmail } from "../_lib/mailer.js";
import { startOfTodayUtc } from "../_lib/dates.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;

  const action = Array.isArray(req.query.action) ? req.query.action[0] : req.query.action;

  switch (action) {
    case "ingest-usage":
      return handleIngestUsage(req, res);
    case "ingest-leakage":
      return handleIngestLeakage(req, res);
    default:
      return jsonOut(res, { success: false, message: "Unknown device action" }, 404);
  }
}

// ---- ingest-usage (was api/ingest-usage.ts) ----
async function handleIngestUsage(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return methodNotAllowed(res);

  const auth = await requireDeviceOrSession(req, res);
  if (!auth) return; // 401 already sent

  // A device-authenticated request declares which household it's reporting
  // for; a browser session always reports for the logged-in user only (a
  // session can never write another household's data).
  const bodyUserId = Number(field(req, "user_id", "0"));
  const uid = auth.authenticatedAs === "session" ? auth.sessionUserId! : bodyUserId;

  if (!uid || uid <= 0) {
    return jsonOut(res, { success: false, message: "A valid user_id is required" }, 400);
  }

  const kitchenRaw = field(req, "kitchen", "");
  const washroomRaw = field(req, "washroom", "");
  const hasKitchen = kitchenRaw !== "";
  const hasWashroom = washroomRaw !== "";

  if (!hasKitchen && !hasWashroom) {
    return jsonOut(res, { success: false, message: "Provide at least one of: kitchen, washroom (liters)" }, 400);
  }

  const kitchen = hasKitchen ? Number(kitchenRaw) : null;
  const washroom = hasWashroom ? Number(washroomRaw) : null;

  if ((hasKitchen && (kitchen === null || kitchen < 0)) || (hasWashroom && (washroom === null || washroom < 0))) {
    return jsonOut(res, { success: false, message: "Usage values must be >= 0" }, 400);
  }

  const recordedAt = field(req, "recorded_at", "") || new Date().toISOString();

  try {
    const sql = getSql();

    // Reject ingestion for a user_id that doesn't exist, rather than
    // silently creating an orphaned reading no one will ever see.
    const owner = await sql`SELECT 1 FROM users WHERE id = ${uid} LIMIT 1`;
    if (owner.length === 0) {
      return jsonOut(res, { success: false, message: "Unknown user_id" }, 404);
    }

    const insertedIds: Record<string, number> = {};

    if (hasKitchen) {
      const rows = (await sql`
        INSERT INTO usage_readings (user_id, room, liters, recorded_at)
        VALUES (${uid}, 'kitchen', ${kitchen}, ${recordedAt}) RETURNING id
      `) as { id: number }[];
      insertedIds.kitchen = rows[0].id;
    }
    if (hasWashroom) {
      const rows = (await sql`
        INSERT INTO usage_readings (user_id, room, liters, recorded_at)
        VALUES (${uid}, 'washroom', ${washroom}, ${recordedAt}) RETURNING id
      `) as { id: number }[];
      insertedIds.washroom = rows[0].id;
    }

    return jsonOut(res, {
      success: true,
      inserted: insertedIds,
      recorded_at: recordedAt,
      total: (kitchen ?? 0) + (washroom ?? 0),
    });
  } catch (err) {
    return serverError(res, err, "ingest-usage");
  }
}

// ---- ingest-leakage (was api/ingest-leakage.ts) ----
async function handleIngestLeakage(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return methodNotAllowed(res);

  const auth = await requireDeviceOrSession(req, res);
  if (!auth) return;

  const bodyUserId = Number(field(req, "user_id", "0"));
  const uid = auth.authenticatedAs === "session" ? auth.sessionUserId! : bodyUserId;
  if (!uid || uid <= 0) {
    return jsonOut(res, { success: false, message: "A valid user_id is required" }, 400);
  }

  const volume = Number(field(req, "volume", "0"));
  const flowRate = Number(field(req, "flow_rate", String(volume)));
  const severity = field(req, "severity", "Medium");
  const valveStatus = field(req, "valve_status", "Deactivated");
  const eventKeyInput = field(req, "event_key", "");

  try {
    const sql = getSql();

    const owner = await sql`SELECT 1 FROM users WHERE id = ${uid} LIMIT 1`;
    if (owner.length === 0) {
      return jsonOut(res, { success: false, message: "Unknown user_id" }, 404);
    }

    // De-duplication: if the device omits event_key, derive one from
    // severity + rounded volume + current minute, so retries within the
    // same minute collapse into a single event/email instead of spamming.
    const minuteBucket = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
    const eventKey = eventKeyInput || `auto-${minuteBucket}-${severity}-${Math.round(volume * 10) / 10}`;

    const dupeRows = await sql`
      SELECT id FROM leakage_events WHERE user_id = ${uid} AND event_key = ${eventKey} LIMIT 1
    `;
    if (dupeRows.length > 0) {
      return jsonOut(res, { success: true, duplicate: true, sent: false });
    }

    const insertedRows = (await sql`
      INSERT INTO leakage_events (user_id, volume, flow_rate, severity, valve_status, event_key)
      VALUES (${uid}, ${volume}, ${flowRate}, ${severity}, ${valveStatus}, ${eventKey})
      RETURNING id
    `) as { id: number }[];
    const eventId = insertedRows[0].id;

    const userRows = (await sql`
      SELECT email, notification_email, notify_leakage, location FROM users WHERE id = ${uid}
    `) as { email: string; notification_email: string | null; notify_leakage: boolean; location: string | null }[];
    const user = userRows[0];

    let sent = false;
    let mailMsg = "skipped";

    if (user?.notify_leakage) {
      const to = user.notification_email || user.email;
      if (to) {
        const usageRows = (await sql`
          SELECT COALESCE(SUM(liters), 0) AS total
            FROM usage_readings
           WHERE user_id = ${uid} AND recorded_at >= ${startOfTodayUtc().toISOString()}
        `) as { total: string }[];
        const currentUsage = Number(usageRows[0]?.total ?? 0);

        const html = renderLeakEmail({
          detectedAt: new Date().toISOString().replace("T", " ").slice(0, 19),
          currentUsage,
          volume,
          severity,
          valveStatus,
          location: user.location ?? "",
        });
        const result = await sendEmail(to, "🚨 Water Leakage Detected", html);
        sent = result.success;
        mailMsg = result.message;

        await sql`
          INSERT INTO notifications_log (user_id, event_id, recipient, status, message)
          VALUES (${uid}, ${eventId}, ${to}, ${sent ? "sent" : "failed"}, ${mailMsg})
        `;
      }
    }

    return jsonOut(res, { success: true, event_id: eventId, sent, mail: mailMsg });
  } catch (err) {
    return serverError(res, err, "ingest-leakage");
  }
}
