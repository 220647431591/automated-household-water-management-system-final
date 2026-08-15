// ============================================================
// api/data/[action].ts — consolidated read/reporting group.
// Replaces api/usage.ts, api/usage-trend.ts, api/leakage.ts, api/reports.ts,
// api/export.ts. See api/auth/[action].ts for why this consolidation exists.
//
// export.ts is the one endpoint here that doesn't return JSON (it streams a
// CSV/PDF file), so it keeps its own response shape and its own
// session-check style (a 401 text/plain response, matching the original),
// rather than going through jsonOut/requireLogin like the others.
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSql } from "../_lib/db.js";
import { applyCors, jsonOut, serverError, query } from "../_lib/http.js";
import { requireLogin, readSession } from "../_lib/auth.js";
import { startOfTodayUtc, mondayOfWeekUtc, startOfMonthUtc, daysAgoUtc, isoDate } from "../_lib/dates.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;

  const action = Array.isArray(req.query.action) ? req.query.action[0] : req.query.action;

  switch (action) {
    case "usage":
      return handleUsage(req, res);
    case "usage-trend":
      return handleUsageTrend(req, res);
    case "leakage":
      return handleLeakage(req, res);
    case "reports":
      return handleReports(req, res);
    case "export":
      return handleExport(req, res);
    default:
      return jsonOut(res, { success: false, message: "Unknown data action" }, 404);
  }
}

// ---- usage (was api/usage.ts) ----
async function handleUsage(req: VercelRequest, res: VercelResponse) {
  const uid = await requireLogin(req, res);
  if (uid === null) return;

  const period = query(req, "period", "current");

  let since: Date;
  let until: Date | null = null;
  switch (period) {
    case "week":
      since = mondayOfWeekUtc();
      break;
    case "lastWeek":
      since = mondayOfWeekUtc(daysAgoUtc(7));
      until = mondayOfWeekUtc();
      break;
    case "month":
      since = startOfMonthUtc();
      break;
    case "current":
    default:
      since = startOfTodayUtc();
  }

  try {
    const sql = getSql();
    const rows = (until
      ? await sql`
          SELECT room, COALESCE(SUM(liters), 0) AS total
            FROM usage_readings
           WHERE user_id = ${uid} AND recorded_at >= ${since.toISOString()} AND recorded_at < ${until.toISOString()}
        GROUP BY room
        `
      : await sql`
          SELECT room, COALESCE(SUM(liters), 0) AS total
            FROM usage_readings
           WHERE user_id = ${uid} AND recorded_at >= ${since.toISOString()}
        GROUP BY room
        `) as { room: string; total: string }[];

    let kitchen = 0;
    let washroom = 0;
    for (const row of rows) {
      if (row.room === "kitchen") kitchen = Number(row.total);
      if (row.room === "washroom") washroom = Number(row.total);
    }

    return jsonOut(res, {
      success: true,
      period,
      kitchen,
      washroom,
      overall: kitchen + washroom,
    });
  } catch (err) {
    return serverError(res, err, "usage");
  }
}

// ---- usage-trend (was api/usage-trend.ts) ----
async function handleUsageTrend(req: VercelRequest, res: VercelResponse) {
  const uid = await requireLogin(req, res);
  if (uid === null) return;

  const period = query(req, "period", "week");
  const days = period === "month" ? 30 : 7;

  try {
    const sql = getSql();
    const since = daysAgoUtc(days - 1);
    const rows = (await sql`
      SELECT DATE(recorded_at) AS day, COALESCE(SUM(liters), 0) AS liters
        FROM usage_readings
       WHERE user_id = ${uid} AND recorded_at >= ${since.toISOString()}
    GROUP BY DATE(recorded_at)
    ORDER BY day ASC
    `) as { day: string; liters: string }[];

    const totals = new Map<string, number>();
    for (const r of rows) {
      totals.set(isoDate(new Date(r.day)), Number(r.liters));
    }

    const labelFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      ...(days > 7 ? { month: "numeric", day: "numeric" } : { weekday: "short" }),
    });

    const labels: string[] = [];
    const data: number[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = daysAgoUtc(i);
      labels.push(labelFormatter.format(d));
      data.push(totals.get(isoDate(d)) ?? 0);
    }

    return jsonOut(res, { success: true, period, labels, data });
  } catch (err) {
    return serverError(res, err, "usage-trend");
  }
}

// ---- leakage (was api/leakage.ts) ----
async function handleLeakage(req: VercelRequest, res: VercelResponse) {
  const uid = await requireLogin(req, res);
  if (uid === null) return;

  const period = query(req, "period", "latest");

  let since: Date | null = null;
  let limit = 1;
  switch (period) {
    case "today":
      since = startOfTodayUtc();
      limit = 1000;
      break;
    case "week":
      since = mondayOfWeekUtc();
      limit = 1000;
      break;
    case "month":
      since = startOfMonthUtc();
      limit = 1000;
      break;
    case "latest":
    default:
      since = null;
      limit = 1;
  }

  try {
    const sql = getSql();
    const rows = (since
      ? await sql`
          SELECT id, volume, valve_status, detected_at
            FROM leakage_events
           WHERE user_id = ${uid} AND detected_at >= ${since.toISOString()}
        ORDER BY detected_at DESC
           LIMIT ${limit}
        `
      : await sql`
          SELECT id, volume, valve_status, detected_at
            FROM leakage_events
           WHERE user_id = ${uid}
        ORDER BY detected_at DESC
           LIMIT ${limit}
        `) as { id: number; volume: string; valve_status: string; detected_at: string }[];

    const events = rows.map((r) => ({
      id: r.id,
      volume: Number(r.volume),
      time: r.detected_at,
      valveStatus: r.valve_status,
    }));

    return jsonOut(res, { success: true, period, events });
  } catch (err) {
    return serverError(res, err, "leakage");
  }
}

// ---- reports (was api/reports.ts) ----
// Configurable system thresholds (not report data — used only to label real
// numbers as Excellent/Good/etc.), same values as reports.php.
const BASELINE_MONTHLY_LITERS = 1600;
const LEAK_ACTIVE_WINDOW_HOURS = 24;
const LEAK_PCT_SAFE_MAX = 5.0;
const LEAK_PCT_WARN_MAX = 15.0;
const FREQUENT_EVENTS_THRESHOLD = 3;
const VALVE_RATE_GOOD_MIN = 90.0;
const VALVE_RATE_OK_MIN = 75.0;
const VALVE_RATE_POOR_MIN = 50.0;

async function handleReports(req: VercelRequest, res: VercelResponse) {
  const uid = await requireLogin(req, res);
  if (uid === null) return;

  try {
    const sql = getSql();

    const todayStart = startOfTodayUtc().toISOString();
    const weekStart = mondayOfWeekUtc().toISOString();
    const monthStart = startOfMonthUtc().toISOString();

    const usageRows = (await sql`
      SELECT
        COALESCE(SUM(CASE WHEN recorded_at >= ${todayStart} THEN liters ELSE 0 END), 0) AS today,
        COALESCE(SUM(CASE WHEN recorded_at >= ${weekStart} THEN liters ELSE 0 END), 0) AS week,
        COALESCE(SUM(CASE WHEN recorded_at >= ${monthStart} THEN liters ELSE 0 END), 0) AS month
      FROM usage_readings
      WHERE user_id = ${uid}
    `) as { today: string; week: string; month: string }[];
    const usageRow = usageRows[0];
    const todayUsage = Number(usageRow.today);
    const weekUsage = Number(usageRow.week);
    const monthUsage = Number(usageRow.month);

    const leakRows = (await sql`
      SELECT
        COALESCE(SUM(volume), 0) AS total_volume,
        COUNT(*)::int AS events,
        SUM(CASE WHEN valve_status = 'Activated' THEN 1 ELSE 0 END)::int AS closures
      FROM leakage_events
      WHERE user_id = ${uid} AND detected_at >= ${monthStart}
    `) as { total_volume: string; events: number; closures: number | null }[];
    const leakRow = leakRows[0];
    const leakTotalVolume = Number(leakRow.total_volume);
    const leakEvents = Number(leakRow.events);
    const valveClosures = Number(leakRow.closures ?? 0);

    const leakagePercent = monthUsage > 0 ? Math.round((leakTotalVolume / monthUsage) * 1000) / 10 : null;
    const valveSuccessRate = leakEvents > 0 ? Math.round((valveClosures / leakEvents) * 100) : null;

    const latestLeakRows = (await sql`
      SELECT severity, valve_status, detected_at
        FROM leakage_events
       WHERE user_id = ${uid}
    ORDER BY detected_at DESC
       LIMIT 1
    `) as { severity: string; valve_status: string; detected_at: string }[];
    const latestLeak = latestLeakRows[0];

    let currentLeakStatus = "No Leak";
    let currentValveStatus = "Open";
    if (latestLeak) {
      currentValveStatus = latestLeak.valve_status === "Activated" ? "Closed" : "Open";
      const ageHours = (Date.now() - new Date(latestLeak.detected_at).getTime()) / 3600000;
      if (ageHours <= LEAK_ACTIVE_WINDOW_HOURS) {
        currentLeakStatus = latestLeak.severity;
      }
    }

    const lastUpdatedRows = (await sql`
      SELECT GREATEST(
        COALESCE((SELECT MAX(recorded_at) FROM usage_readings WHERE user_id = ${uid}), TIMESTAMP '1970-01-01'),
        COALESCE((SELECT MAX(detected_at) FROM leakage_events WHERE user_id = ${uid}), TIMESTAMP '1970-01-01')
      ) AS last_updated
    `) as { last_updated: string }[];
    const lastUpdatedRaw = lastUpdatedRows[0]?.last_updated ?? null;
    const lastUpdated =
      lastUpdatedRaw && new Date(lastUpdatedRaw).getFullYear() !== 1970 ? lastUpdatedRaw : null;

    // ---------------- Overall system efficiency ----------------
    let leakScore = 0;
    if (leakagePercent === null || leakagePercent <= LEAK_PCT_SAFE_MAX) leakScore = 3;
    else if (leakagePercent <= LEAK_PCT_WARN_MAX) leakScore = 2;
    else if (leakagePercent <= 30.0) leakScore = 1;

    let valveScore = 3; // no events yet = nothing has failed
    if (valveSuccessRate !== null) {
      if (valveSuccessRate >= VALVE_RATE_GOOD_MIN) valveScore = 3;
      else if (valveSuccessRate >= VALVE_RATE_OK_MIN) valveScore = 2;
      else if (valveSuccessRate >= VALVE_RATE_POOR_MIN) valveScore = 1;
      else valveScore = 0;
    }

    let usageScore = 0;
    if (monthUsage <= BASELINE_MONTHLY_LITERS) usageScore = 2;
    else if (monthUsage <= BASELINE_MONTHLY_LITERS * 1.15) usageScore = 1;

    const totalScore = leakScore + valveScore + usageScore; // max 8
    let efficiency: string;
    if (totalScore >= 7) efficiency = "Excellent";
    else if (totalScore >= 5) efficiency = "Good";
    else if (totalScore >= 3) efficiency = "Moderate";
    else efficiency = "Poor";

    // ---------------- Recommendations ----------------
    const recommendations: string[] = [];

    if (leakagePercent !== null && leakagePercent > LEAK_PCT_WARN_MAX) {
      recommendations.push(
        `Leakage is ${leakagePercent}% of this month's usage — exceeds the safe threshold. Inspect plumbing immediately.`,
      );
    } else if (leakEvents >= FREQUENT_EVENTS_THRESHOLD) {
      recommendations.push(`Frequent leakage events detected (${leakEvents} this month). Schedule maintenance.`);
    } else {
      recommendations.push("Water usage is within the expected range for leakage.");
    }

    if (valveSuccessRate !== null) {
      if (valveSuccessRate < VALVE_RATE_OK_MIN) {
        recommendations.push(`Valve response success rate is ${valveSuccessRate}% — schedule valve maintenance.`);
      } else {
        recommendations.push("Valve response is operating correctly.");
      }
    }

    if (monthUsage > BASELINE_MONTHLY_LITERS) {
      recommendations.push(
        `Water consumption (${monthUsage} L) is higher than the typical baseline of ${BASELINE_MONTHLY_LITERS} L. Consider reducing unnecessary usage.`,
      );
    } else {
      recommendations.push("Water usage is within the expected range.");
    }

    recommendations.push("Continue monitoring the system regularly.");

    return jsonOut(res, {
      success: true,
      lastUpdated,
      usage: { today: todayUsage, week: weekUsage, month: monthUsage, baseline: BASELINE_MONTHLY_LITERS },
      leakage: {
        totalVolume: leakTotalVolume,
        events: leakEvents,
        percentage: leakagePercent,
        currentStatus: currentLeakStatus,
      },
      valve: {
        currentStatus: currentValveStatus,
        successfulClosures: valveClosures,
        responseSuccessRate: valveSuccessRate,
      },
      efficiency,
      recommendations,
    });
  } catch (err) {
    return serverError(res, err, "reports");
  }
}

// ---- export (was api/export.ts) ----
interface ExportRow {
  recorded_at: string;
  room: string;
  liters: string;
}

function toCsv(rows: ExportRow[]): string {
  const escape = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = ["Timestamp,Room,Liters"];
  for (const r of rows) {
    lines.push([escape(r.recorded_at), escape(r.room), escape(String(r.liters))].join(","));
  }
  return lines.join("\r\n") + "\r\n";
}

/** Minimal single-page PDF, no external libraries — same approach as export.php. */
function toPdf(rows: ExportRow[]): Buffer {
  let body = "Water Usage Report\n\n";
  for (const r of rows) {
    const room = r.room.padEnd(9, " ");
    const liters = Number(r.liters).toFixed(2).padStart(6, " ");
    body += `${r.recorded_at}  ${room}  ${liters} L\n`;
  }
  body = body.replace(/[()]/g, (m) => "\\" + m);

  const stream = "BT /F1 10 Tf 40 780 Td 12 TL (" + body.replace(/\n/g, ") Tj T* (") + ") Tj ET";
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer << /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;

  return Buffer.from(pdf, "latin1");
}

async function handleExport(req: VercelRequest, res: VercelResponse) {
  const session = await readSession(req);
  if (!session) {
    res.status(401).setHeader("Content-Type", "text/plain").end("Not authenticated");
    return;
  }

  const formatParam = req.query.format;
  const format = (Array.isArray(formatParam) ? formatParam[0] : formatParam || "CSV").toUpperCase();

  try {
    const sql = getSql();
    const rows = (await sql`
      SELECT recorded_at, room, liters FROM usage_readings
       WHERE user_id = ${session.userId}
    ORDER BY recorded_at DESC
       LIMIT 5000
    `) as ExportRow[];

    if (format === "PDF") {
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", 'attachment; filename="water-usage.pdf"');
      res.status(200).send(toPdf(rows));
      return;
    }

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="water-usage.csv"');
    res.status(200).send(toCsv(rows));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[export]", err);
    res.status(500).setHeader("Content-Type", "text/plain").end("Export failed. Please try again, or contact support if this continues.");
  }
}
