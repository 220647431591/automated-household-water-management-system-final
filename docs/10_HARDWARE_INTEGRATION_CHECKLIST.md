# 10. Hardware Integration Checklist

Use this checklist when bringing up the ESP32 against the (already
production-ready) backend. Each item states what "done" looks like.

## 10.1 Backend Readiness (should already be true — verify, don't redo)
- [ ] `Backend/.env` has a real `DEVICE_INGEST_TOKEN` set (not the
      `change-me-to-a-long-random-string` placeholder from `.env.example`).
- [ ] Backend is reachable over HTTPS from the network the ESP32 will use.
- [ ] `ALLOWED_ORIGINS` doesn't need to include the ESP32 at all — CORS
      only applies to browser requests; a device using `X-Device-Token`
      is not subject to it.

## 10.2 Device Configuration
- [ ] Configure the device token: flash `DEVICE_INGEST_TOKEN`'s value into
      the firmware (as a build-time constant or provisioned secret — not
      hardcoded in a way that's extractable from a resold unit).
- [ ] Connect the ESP32 to Wi-Fi and confirm it can resolve/reach your
      backend's domain.
- [ ] Confirm the target `user_id` for this device (the household account
      it's reporting for) — there is no device-registration/pairing flow
      in this codebase; `user_id` is simply a form field the device sends
      on every request.

## 10.3 Test API Authentication
- [ ] Send one request with a **deliberately wrong** token and confirm you
      get HTTP 401 `{"success":false,"message":"Not authenticated"}`.
- [ ] Send one request with the **correct** token and confirm you get a
      200 with `"success":true`.

## 10.4 Upload Water Usage
- [ ] `POST ingest_usage.php` with `kitchen` and/or `washroom` (liters).
- [ ] Confirm the response's `inserted` object has an ID for each room you
      sent.
- [ ] Confirm negative values are rejected (`400`, "Usage values must be
      >= 0") — sanity-check your sensor code isn't sending them
      accidentally.

## 10.5 Upload Leakage Event
- [ ] `POST ingest_leakage.php` with `volume`, `severity`, `valve_status`,
      and a stable `event_key`.
- [ ] Confirm the response has `"success":true` and a numeric `event_id`.
- [ ] Re-send the **exact same** `event_key` and confirm you get
      `{"success":true,"duplicate":true,"sent":false}` instead of a second
      event/email (see §10.12).

## 10.6 Upload Valve Status
- [ ] Valve status is sent **as part of** the leakage payload
      (`valve_status=Activated|Deactivated`) — there is no separate
      standalone valve-status endpoint. Confirm your firmware includes it
      on every leak event, and confirm the Leakage Events / Reports pages
      show the correct Open/Closed label (`Deactivated` → shown as
      **Open**; `Activated` → shown as **Closed** — the stored value and
      the displayed label are intentionally inverted; see
      `03_DATABASE_DOCUMENTATION.md` §3.3).

## 10.7 Upload Device Status
- [ ] **There is no device-status/heartbeat endpoint in this backend.**
      If your firmware needs to report online/offline or diagnostic
      status, that's new functionality to design and build (see
      `09_MAINTENANCE_GUIDE.md` §9.1) — don't assume one exists. Confirm
      this checklist item as "not applicable / future work," not "done."

## 10.8 Verify Database Updates
- [ ] After an `ingest_usage.php` call, confirm a new row exists in
      `usage_readings` with the correct `user_id`, `room`, `liters`,
      `recorded_at`.
- [ ] After an `ingest_leakage.php` call, confirm a new row exists in
      `leakage_events` with the correct `event_key` (and that a duplicate
      `event_key` did **not** create a second row — enforced by the
      `UNIQUE(user_id, event_key)` constraint even if the app-level check
      were somehow bypassed).

## 10.9 Verify Dashboard Updates
- [ ] Log in as the affected user and confirm the Dashboard's Daily
      Average / Peak Usage KPIs reflect the new usage data within 30
      seconds (auto-polling — no manual refresh needed).

## 10.10 Verify Reports
- [ ] Confirm `reports.php`'s Today/Week/Month usage totals include the
      new reading, and (for a leak event) that "Leakage (this month)",
      "Events (this month)", and "Current Status" all updated.

## 10.11 Verify Notification History
- [ ] Confirm the leak event produced a row in Settings → Notifications →
      Notification History within ~2 seconds, with the correct
      `severity`/`volume` and a `sent`/`failed` status matching whether
      the email actually went out.

## 10.12 Verify Automatic Email Notification
- [ ] Confirm the alert email actually arrived in the target inbox (check
      spam/junk on first test) with the correct volume, severity, and
      valve status rendered in the template.
- [ ] Confirm this happened **without any user pressing a button** — the
      only human action in this test should have been the `curl`/device
      POST itself.
- [ ] If `notify_leakage=0` for the test account (Settings → Notifications
      toggle), confirm the event is still stored but no email is sent —
      this is correct behavior, not a bug.

## 10.13 Verify Duplicate Event Protection
- [ ] Re-send the same `ingest_leakage.php` payload (same `event_key`)
      3–5 times in a row. Confirm: exactly one row in `leakage_events`,
      exactly one email sent, and every repeat call after the first
      returns `{"duplicate":true,"sent":false}` rather than erroring.
- [ ] If your firmware can't guarantee a stable `event_key` across
      retries, confirm the backend's auto-derived key
      (`auto-{YmdHi}-{severity}-{volume}`) still collapses retries sent
      within the same minute — but understand this is a fallback, not a
      substitute for sending your own stable key when you can.

## 10.14 Verify System Recovery After Network Interruption
- [ ] Disconnect the ESP32's Wi-Fi mid-test, then reconnect, and confirm
      it resumes posting (this is firmware-side retry/backoff logic — see
      `ESP32_INTEGRATION_GUIDE.md` / `05_ESP32_INTEGRATION_GUIDE.md` §5.6
      for the recommended strategy; the backend itself is stateless per
      request and needs no special "recovery" handling).
- [ ] If the firmware buffers readings locally during an outage, confirm
      the backlog uploads with correct historical `recorded_at` timestamps
      (`ingest_usage.php` accepts an explicit `recorded_at`) and that the
      Dashboard/Reports reflect the correct historical timeline, not a
      spike at the reconnect moment.
- [ ] Confirm a backend restart or brief unavailability doesn't corrupt
      state: `ingest_leakage.php`'s dedup check plus the DB's `UNIQUE`
      constraint mean a retried leak POST after a backend restart still
      can't create a duplicate event.
