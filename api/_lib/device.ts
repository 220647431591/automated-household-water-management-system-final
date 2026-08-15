// ============================================================
// api/_lib/device.ts — ESP32 device authentication.
//
// The ingestion endpoints (usage + leakage) must be reachable by hardware
// that cannot hold a browser session/cookie. They authenticate instead with
// a shared secret sent as `X-Device-Token`, compared against
// DEVICE_INGEST_TOKEN (server-side only — never bundled into the frontend,
// since anything prefixed VITE_ is public).
//
// A logged-in browser session is also accepted, so the same endpoints keep
// working if you ever want to POST test data from the web app itself.
//
// Note: the token authenticates "this request came from a legitimate
// device", not "this device owns user X". The device still declares which
// user's data it's reporting (via user_id / a per-device mapping) — same
// trust model as most single-tenant home-IoT setups. If you provision
// multiple households, give each ESP32 its own token mapped to its own
// user_id server-side instead of trusting a client-supplied user_id.
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { jsonOut } from "./http.js";
import { readSession } from "./auth.js";

export async function requireDeviceOrSession(
  req: VercelRequest,
  res: VercelResponse,
): Promise<{ authenticatedAs: "device" | "session"; sessionUserId: number | null } | null> {
  const provided = req.headers["x-device-token"];
  const expected = process.env.DEVICE_INGEST_TOKEN;

  if (typeof provided === "string" && expected && provided.length > 0 && provided === expected) {
    return { authenticatedAs: "device", sessionUserId: null };
  }

  const session = await readSession(req);
  if (session) {
    return { authenticatedAs: "session", sessionUserId: session.userId };
  }

  jsonOut(res, { success: false, message: "Not authenticated" }, 401);
  return null;
}
