# Account Provider Selection

Add User defaults to AD. Administrators can verify an email against LDAP, use the returned display name (or edit it), and create an account without a local password. Creation re-verifies the directory identity on the server and stores its username/UPN mapping.

Local accounts require a unique username and matching password confirmation, without email/name inputs. The display name is the normalized username and email is null. Usernames are normalized to lowercase and contain 3-64 letters/numbers/dots/underscores/hyphens. New passwords require at least 6 characters, an ASCII lowercase letter, uppercase letter, number and a special character (not whitespace or a letter/digit), with at most 72 UTF-8 bytes; only a bcrypt cost-12 hash is stored. ADMIN, STOREMAN and USER can sign in locally. Authorization still follows their assigned role and warehouse permissions.

Provider selection is for creation, not a conversion tool. Editing a Local user's email/name does not require LDAP verification or change credentials. The existing emergency `admin` username remains supported.

## Self-Service Password Changes

Every Local role can open Change Password from the profile menu. The current password is required; the new password must match its confirmation, differ from the current password, and meet the same 6-character complexity/72-UTF-8-byte policy. Existing passwords remain valid for login; the new policy applies when setting a password, not when checking the current one. AD accounts continue managing passwords through their directory.

The same-origin authenticated endpoint `/api/auth/change-password` derives the target from the session, rejects client-supplied account IDs, rate-limits attempts, and records a password-free PASSWORD_CHANGED audit. Hash replacement uses compare-and-swap inside a transaction to reject concurrent stale updates. Existing authenticated sessions are not revoked by this feature; this is a password change, not a sign-out-all-devices mechanism.

## Deployment

1. Back up the target database and review pending migrations, including the separate LDAP identity mapping migration.
2. Apply reviewed migrations with `npx prisma migrate deploy` before starting the updated app. Migration `202610200002_user_auth_provider` adds provider AD by default and backfills LOCAL for existing users with a local username; it does not delete accounts or change password hashes.
3. Regenerate Prisma Client with `npx prisma generate`. On Windows, stop/restart the relevant app process if its Prisma engine DLL is locked.
4. Verify AD directory settings and mappings, then smoke-test existing emergency admin and each Local role on an isolated environment. Existing AD accounts need a unique LDAP username/UPN mapping; the organization-specific bulk identity correction script is intentionally not distributed in this public repository. Do not assume that matching an email alone enables login.

Do not run cleanup/import scripts or `prisma migrate reset` as part of this deployment. This change does not apply migrations to the live database automatically.
