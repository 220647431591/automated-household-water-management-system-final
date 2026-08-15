# Automated Household Water Management System — PHP Backend

Complete PHP + MySQL backend for the React frontend in this project.

## 1. Install (XAMPP / WAMP / MAMP)

1. Start **Apache** and **MySQL** from your XAMPP control panel.
2. Copy this entire `backend/` folder into:
   ```
   C:\xampp\htdocs\automated household water management system web\Backend\
   ```
   (Rename `backend` → `Backend` so the folder matches the URL the frontend calls.)
3. Open http://localhost/phpmyadmin, click **Import**, and load
   `Backend/schema.sql`. This creates the `water_management` database and all
   tables, plus a demo user:
   - email: `demo@water.local`
   - password: `Password1`
4. If your MySQL root user has a password, edit `Backend/config.php` and set
   `DB_PASS`.

## 2. Test it

Visit http://localhost/automated%20household%20water%20management%20system%20web/Backend/login.php
in a browser — you should see a JSON error (`Method not allowed`), which
confirms PHP + MySQL are wired up.

## 3. Run the React frontend

From the project root:

```bash
bun install
bun dev
```

The app opens at http://localhost:8080. Log in with the demo credentials.

## 4. Endpoints

| Endpoint              | Method | Auth | Purpose                                    |
| --------------------- | ------ | ---- | ------------------------------------------ |
| `login.php`           | POST   | –    | Sign in with email + password              |
| `register.php`        | POST   | –    | Create a new account                       |
| `forgot_password.php` | POST   | –    | Generate a reset token (email step is TODO)|
| `logout.php`          | POST   | –    | End session                                |
| `update_profile.php`  | POST   | ✅   | Update name / household / location / email |
| `change_password.php` | POST   | ✅   | Change password (requires old password)    |
| `delete_account.php`  | POST   | ✅   | Delete current account                     |
| `usage.php`           | GET    | ✅   | `?period=current|week|lastWeek|month`      |
| `leakage.php`         | GET    | ✅   | `?period=latest|week|month`                |
| `reports.php`         | GET    | ✅   | Aggregate usage + leakage summary          |
| `usage_trend.php`     | GET    | ✅   | Last 7 days, one bucket per day            |
| `export.php`              | GET    | ✅   | `?format=CSV|PDF` — file download          |
| `notification_settings.php` | GET/POST | ✅ | Read/save leakage-alert email + on-off     |
| `ingest_leakage.php`      | POST   | 🔐   | ESP32/Arduino leak event → DB + email      |

## 5. Email notifications (FREE — Gmail SMTP)

1. In your Google Account, turn on **2-Step Verification**:
   https://myaccount.google.com/security
2. Create an **App Password** (choose "Mail" / "Other"):
   https://myaccount.google.com/apppasswords — copy the 16-char password.
3. Set these env vars on your PHP host (Apache `SetEnv`, cPanel env, Docker
   env, systemd, or a `.env` loader):
   ```
   MAIL_DRIVER=smtp
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=your.address@gmail.com
   SMTP_PASS=xxxx-xxxx-xxxx-xxxx     # the 16-char App Password
   MAIL_FROM=your.address@gmail.com
   MAIL_FROM_NAME="Water Management System"
   DEVICE_INGEST_TOKEN=change-me-to-a-long-random-string
   ```
4. Install PHPMailer once (recommended — falls back to `mail()` otherwise):
   ```bash
   cd backend
   composer require phpmailer/phpmailer
   ```
5. Test the full flow:
   ```bash
   # a) log in through the app, open Settings → Notifications, set your email
   # b) simulate a leak:
   curl -X POST https://your-domain.com/Backend/ingest_leakage.php \
        -H "X-Device-Token: <your DEVICE_INGEST_TOKEN>" \
        -d "user_id=1&volume=42&flow_rate=8.5&severity=High&valve_status=Deactivated&event_key=demo-001"
   ```
   You should receive a branded `🚨 Water Leakage Detected` email within a
   few seconds. Every send is recorded in the `notifications_log` table, and
   repeated calls with the same `event_key` are de-duplicated.

The mailer is pluggable: to switch to Resend / Brevo / SES later, add a case
to `send_email()` in `backend/mailer.php` and change `MAIL_DRIVER` — no
frontend or app code changes required.

## 6. Deploying to the internet

`localhost` PHP is only reachable from the same machine. To use the app from a
Lovable hosted preview:

1. Deploy this folder to any PHP host that supports HTTPS (Hostinger,
   InfinityFree, Render, a VPS, etc.).
2. In `config.php`, add your Lovable URL to `$ALLOWED_ORIGINS`, e.g.
   `'https://your-app.lovable.app'`.
3. In your Lovable project, set the env var
   `VITE_API_BASE_URL=https://your-domain.com/Backend`.
4. HTTPS is required for cross-site session cookies — the backend already
   sets `SameSite=None; Secure` when it detects HTTPS.

## 6. Security notes

- Passwords are hashed with `password_hash` (bcrypt).
- All queries use PDO prepared statements — no string concatenation.
- Sessions are HTTP-only and (over HTTPS) `SameSite=None; Secure`.
- `config.php` and `bootstrap.php` are blocked from direct HTTP access by
  `.htaccess`.
- `forgot_password.php` never reveals whether an email exists, to prevent
  account enumeration.
