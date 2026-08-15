// ============================================================
// api/_lib/mailer.ts — pluggable email sender.
//
// Default: Gmail SMTP via nodemailer, using the same free Gmail App
// Password setup the PHP backend used (PHPMailer → SMTP). Nodemailer is the
// Node-native equivalent and works the same way from a Vercel function.
//
// If Gmail SMTP ever becomes unreliable from your Vercel plan/region, set
// MAIL_DRIVER=resend and RESEND_API_KEY to switch to Resend's free tier
// (https://resend.com, 3,000 emails/month free, HTTP API — no outbound SMTP
// port needed) without touching any other file.
// ============================================================

import nodemailer from "nodemailer";

export interface MailResult {
  success: boolean;
  message: string;
}

export async function sendEmail(to: string, subject: string, html: string): Promise<MailResult> {
  const driver = process.env.MAIL_DRIVER || "smtp";
  if (driver === "resend") return sendViaResend(to, subject, html);
  return sendViaSmtp(to, subject, html);
}

async function sendViaSmtp(to: string, subject: string, html: string): Promise<MailResult> {
  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER || "";
  const pass = process.env.SMTP_PASS || "";
  const from = process.env.MAIL_FROM || user;
  const fromName = process.env.MAIL_FROM_NAME || "Water Management System";

  if (!user || !pass) {
    return { success: false, message: "SMTP not configured (SMTP_USER / SMTP_PASS missing)" };
  }

  try {
    const transport = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
    await transport.sendMail({
      from: `"${fromName}" <${from}>`,
      to,
      subject,
      html,
      text: html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
    });
    return { success: true, message: "sent" };
  } catch (err) {
    return { success: false, message: "SMTP error: " + (err instanceof Error ? err.message : String(err)) };
  }
}

async function sendViaResend(to: string, subject: string, html: string): Promise<MailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM || "onboarding@resend.dev";
  if (!apiKey) return { success: false, message: "Resend not configured (RESEND_API_KEY missing)" };

  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, html }),
    });
    if (!resp.ok) {
      const body = await resp.text();
      return { success: false, message: `Resend error: ${resp.status} ${body}` };
    }
    return { success: true, message: "sent" };
  } catch (err) {
    return { success: false, message: "Resend error: " + (err instanceof Error ? err.message : String(err)) };
  }
}

// ---------------------------------------------------------------
// Branded HTML templates — ported verbatim (same content/markup) from
// Backend/mailer.php so outgoing emails look identical to before.
// ---------------------------------------------------------------

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderResetEmail(resetUrl: string): string {
  const url = escapeHtml(resetUrl);
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#0f172a;font-family:Segoe UI,Arial,sans-serif;color:#e2e8f0">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0"
             style="max-width:600px;background:#111827;border:1px solid #1f2937;border-radius:14px;overflow:hidden">
        <tr><td style="padding:22px 28px;background:linear-gradient(90deg,#0d9488,#2563eb,#7c3aed);color:#fff">
          <div style="font-size:13px;letter-spacing:.15em;text-transform:uppercase;opacity:.9">Water Management System</div>
          <div style="font-size:22px;font-weight:800;margin-top:4px">🔑 Reset Your Password</div>
        </td></tr>
        <tr><td style="padding:24px 28px;font-size:15px;line-height:1.6">
          <p>We received a request to reset the password on your account. Click the button below to choose a new one.</p>
          <p style="text-align:center;margin:28px 0">
            <a href="${url}" style="display:inline-block;padding:12px 28px;border-radius:8px;background:linear-gradient(90deg,#0d9488,#2563eb);color:#fff;text-decoration:none;font-weight:700">Reset Password</a>
          </p>
          <p style="color:#94a3b8;font-size:13px">Or copy and paste this link into your browser:</p>
          <p style="word-break:break-all;font-size:13px"><a href="${url}" style="color:#38bdf8">${url}</a></p>
          <p style="color:#94a3b8;font-size:12px;margin-top:22px">
            This link expires in 1 hour. If you didn't request a password reset, you can safely ignore this email.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export interface LeakEmailData {
  detectedAt: string;
  currentUsage: number | string;
  volume: number | string;
  severity: string;
  valveStatus: string; // "Activated" | "Deactivated"
  location?: string;
}

export function renderLeakEmail(ev: LeakEmailData): string {
  const when = escapeHtml(ev.detectedAt);
  const usage = escapeHtml(String(ev.currentUsage ?? "—"));
  const volume = escapeHtml(String(ev.volume ?? "—"));
  const severity = escapeHtml(ev.severity || "Medium");
  const status = escapeHtml(ev.valveStatus === "Activated" ? "Closed" : "Open");
  const location = (ev.location || "").trim();

  const color =
    severity.toLowerCase() === "critical"
      ? "#ef4444"
      : severity.toLowerCase() === "high"
        ? "#f97316"
        : severity.toLowerCase() === "medium"
          ? "#f59e0b"
          : "#0ea5e9";

  const locationRow =
    location !== ""
      ? `<tr><td style="padding:8px 0;color:#94a3b8">Location</td><td style="padding:8px 0;text-align:right"><b>${escapeHtml(location)}</b></td></tr>`
      : "";

  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#0f172a;font-family:Segoe UI,Arial,sans-serif;color:#e2e8f0">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0"
             style="max-width:600px;background:#111827;border:1px solid #1f2937;border-radius:14px;overflow:hidden">
        <tr><td style="padding:22px 28px;background:linear-gradient(90deg,#0d9488,#2563eb,#7c3aed);color:#fff">
          <div style="font-size:13px;letter-spacing:.15em;text-transform:uppercase;opacity:.9">Water Management System</div>
          <div style="font-size:22px;font-weight:800;margin-top:4px">🚨 Water Leakage Alert</div>
        </td></tr>
        <tr><td style="padding:24px 28px;font-size:15px;line-height:1.6">
          <p>
            A water leakage has been detected on your system. Please inspect the affected
            area as soon as possible to prevent further water loss or property damage.
          </p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border-collapse:collapse">
            <tr><td style="padding:8px 0;color:#94a3b8">Detected at</td><td style="padding:8px 0;text-align:right"><b>${when}</b></td></tr>
            ${locationRow}
            <tr><td style="padding:8px 0;color:#94a3b8">Leakage volume</td><td style="padding:8px 0;text-align:right"><b>${volume} L</b></td></tr>
            <tr><td style="padding:8px 0;color:#94a3b8">Total usage today</td><td style="padding:8px 0;text-align:right"><b>${usage} L</b></td></tr>
            <tr><td style="padding:8px 0;color:#94a3b8">Severity</td>
                <td style="padding:8px 0;text-align:right">
                  <span style="display:inline-block;padding:4px 10px;border-radius:999px;background:${color};color:#fff;font-weight:700;font-size:12px">${severity}</span>
                </td></tr>
            <tr><td style="padding:8px 0;color:#94a3b8">Valve status</td><td style="padding:8px 0;text-align:right"><b>${status}</b></td></tr>
          </table>
          <div style="background:#0b1220;border:1px solid #1f2937;border-radius:10px;padding:14px;margin-top:8px">
            <b style="color:#fca5a5">Recommended action</b><br>
            Inspect the affected area promptly. If the leak persists, close the main water
            valve to prevent further water loss and potential property damage.
          </div>
          <p style="color:#94a3b8;font-size:12px;margin-top:22px">
            You received this alert because leakage notifications are enabled on your account.
            You can change this in <b>Settings → Notifications</b>.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export function renderTestEmail(sentAt: string): string {
  const when = escapeHtml(sentAt);
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#0f172a;font-family:Segoe UI,Arial,sans-serif;color:#e2e8f0">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:24px 12px">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#111827;border:1px solid #1f2937;border-radius:14px;overflow:hidden">
<tr><td style="padding:22px 28px;background:linear-gradient(90deg,#0d9488,#2563eb,#7c3aed);color:white">
<div style="font-size:13px;letter-spacing:.15em;text-transform:uppercase;opacity:.9">Automated Household Water Management System</div>
<div style="font-size:22px;font-weight:800;margin-top:4px">✅ Test Email Verification</div>
</td></tr>
<tr><td style="padding:24px 28px;font-size:15px;line-height:1.6">
<p>This is a test email from your <strong>Automated Household Water Management System</strong> backend.</p>
<p>If you're reading this, your SMTP configuration is working correctly and water leakage alerts and password reset notifications will successfully reach this inbox.</p>
<p style="color:#94a3b8;font-size:12px;margin-top:22px">Sent at ${when}.</p>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}
