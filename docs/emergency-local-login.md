# Emergency Local Login

Reviewed against current implementation: 2026-10-16. See [Rules](rule.md), [Design](design.md) and dated [Verification](workflow-implementation-verification.md). Account setup instructions are deployment-specific; this document contains no password or secret.

## Account

- Username: `admin` (select **Local Admin** on the login page).
- Local authentication is separate from AD. An AD failure never falls back to local authentication.
- Only active accounts with a local username, password hash and ADMIN role may use local login.
- The prepared account has no default password and cannot sign in until its password is set.
- The application and PostgreSQL must still be available; local login bypasses AD only.

## Set The Password On The Server

Run from a PowerShell terminal you control:

```powershell
& 'D:\Internship\Stock\Stock_Management\scripts\set-local-admin-password.ps1'
```

Enter and confirm a unique password of at least 14 characters and at most 72 UTF-8 bytes. Input is hidden. Do not put passwords in command arguments, source files, chat or environment examples. The script stores a bcrypt hash with cost 12. A successful reset is recorded in `login_audits`.

For another deployment, use that checkout's script path. `node scripts/local-admin.cjs --create-only` prepares the account without resetting an existing password.

## Login Limits And Proxy Configuration

- PostgreSQL stores counters, shared by all application instances.
- Each normalized account and login mode permits 5 attempts per 15-minute window. Successful authentication clears that account counter.
- Without a trusted proxy identity, a shared application bucket permits 300 attempts per 15 minutes.
- Behind a proxy that **overwrites and validates** `X-Forwarded-For`, set `AUTH_TRUST_PROXY=true` to enforce 30 attempts per client address per 15 minutes instead.
- Do not enable this setting if clients can forge that header or directly reach the application around the proxy.
- Rejected attempts return HTTP 429 with `Retry-After`. AD connectivity/configuration failures return HTTP 503, distinct from HTTP 401 for invalid credentials.
- Login audits contain result, mode, user ID on success and timestamp, never passwords. Define retention and monitoring before production deployment.

## Signed PDF Limits

- Signed PDFs are limited to 10 MiB.
- The multipart request body is read with a 10 MiB + 64 KiB envelope limit, including chunked requests without Content-Length.
- File size is checked before converting the uploaded file to an ArrayBuffer. Existing PDF header validation remains active.
- Configure the ingress/proxy with a matching request size limit before cloud deployment. The application limit does not replace edge connection/concurrency controls.
