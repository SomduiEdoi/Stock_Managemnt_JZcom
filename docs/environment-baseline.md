# Environment Baseline And CI

Reviewed: 2026-10-16. Application baseline: commit `c1b9e38` (already on main before this CI change).

## Repository Hygiene

- `.env*` is ignored except the sanitized `.env.example` template. Copy the template and configure secrets outside Git.
- Dependencies, build outputs, logs, temporary files, database backups and `.artifacts` are ignored.
- Previously tracked encoding scratch file and Prisma Studio logs are untracked, not deleted from the owner's machine. This does not erase them from earlier Git history.
- Do not commit imported customer data, signed PDFs, database dumps, credentials or private keys. Ignore rules do not replace reviewing the staged diff.
- The targeted credential-pattern check found no high-confidence token/private-key patterns in the current tracked files. This is not a full historical secret-scanning guarantee.

## CI Contract

Workflow: [ci.yml](../.github/workflows/ci.yml). Required job: `Quality and PostgreSQL Tests`.

Runs on pushes, PRs targeting main and manual dispatch. Node 22, Ubuntu 24.04 and a disposable PostgreSQL 16 service are used. No deployed database or GitHub environment secret is required.

1. `npm ci` and Prisma client generation.
2. Install Thai fonts and use the runner's Chrome for the real bilingual PDF test.
3. `npx prisma migrate deploy` on an empty `stock_ci` database.
4. `node scripts/ci-seed.cjs`: reference roles only; no demo accounts, imported stock or default passwords.
5. `npx tsc --noEmit` and `npm run lint`.
6. All tests with PostgreSQL workflow, concurrency, auth and scope flags enabled, plus `DAMAGE_PDF_LAYOUT_SAMPLE`.
7. `scripts/check-ci-results.cjs` fails if tests are skipped/todo or a required integration suite is missing.

Test files run sequentially to avoid unrelated Serializable fixtures conflicting on shared tables. Concurrency tests still execute simultaneous operations inside their test cases. Failures are not hidden with retries or continue-on-error.

## Local Reproduction

Use a separate disposable PostgreSQL database named `stock_ci`, not the live application database. Set DATABASE_URL explicitly for every shell/session. Run the migration, CI reference seed and test commands above. Set `CI=true`, all four RUN_POSTGRES_* flags to `1`, and an absolute output path in DAMAGE_PDF_LAYOUT_SAMPLE. Chrome and Thai fonts must be installed; configure CHROME_EXECUTABLE_PATH and THAI_PDF_FONT_PATH / THAI_PDF_FONT_BOLD_PATH for the host OS.

The local empty-database rehearsal applied all 58 migrations and passed 390 tests with no skips. Typecheck passed; lint passed with four existing unused-variable warnings. Hosted CI results remain the merge authority, not these local results.

## Main Protection

Main must require a PR, the successful `Quality and PostgreSQL Tests` check and an up-to-date branch. Protection should also apply to administrators, disallow force pushes/deletion, and contain no push bypass actors. This is a GitHub repository setting, not a behavior provided by the workflow file alone. No automatic merge or production deployment is performed by CI.
