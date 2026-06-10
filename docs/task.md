# Task Plan

## Project

Stock Management System

## Document Purpose

เอกสารนี้ใช้เป็น task tracker หลักของโปรเจกต์ เพื่อบอกว่าต้องทำอะไร ตอนไหน อะไรเสร็จแล้ว และตอนนี้ควรทำอะไรต่อ

ทุกครั้งที่ AI หรือ developer ทำงานในโปรเจกต์นี้ ควรอ่าน `docs/prd.md`, `docs/design.md`, `docs/task.md`, `docs/decision-log.md` และ `docs/rule.md` หากมี ก่อนเริ่มทำงาน

## Status Legend

```text
[ ] Not started
[~] In progress
[x] Done
[!] Blocked
```

## Current Focus

```text
Phase 4: Asset CRUD
Next task: Build read-only asset list using authenticated user domain permissions
```

## Locked MVP Decisions

- [x] Use PostgreSQL
- [x] Use TypeScript
- [x] Use Next.js full-stack monolith
- [x] Use `assets.status` as current asset state
- [x] Use `asset_status_histories` as audit trail
- [x] Use domain permission for Server/Network
- [x] Use manual CSV/Excel import from SharePoint
- [x] Store paper document references as note/reference only in MVP
- [x] Use `data/Network.csv` and `data/Server.csv` as source migration files
- [x] Require serial no. for every MVP asset
- [x] Give Viewer read-only access
- [x] Treat rent and borrow as the same `BORROW` workflow

## Working Rules

- ทำงานทีละ phase ตามลำดับ เว้นแต่มีเหตุผลชัดเจน
- ห้ามกลับไปใช้ stock quantity model ใน MVP
- 1 physical item ต้องเป็น 1 asset record
- Asset ที่มี serial no. ต้องมี serial no. ไม่ซ้ำ
- ทุกการเปลี่ยน status ต้องสร้าง `asset_status_histories`
- การแก้ไข asset ต้องตรวจ role และ domain permission ทั้งฝั่ง API
- P' Arm แก้ไขได้เฉพาะ Server
- P' Mek แก้ไขได้เฉพาะ Network
- P' Oak แก้ไขได้ทุก domain
- เอกสารกระดาษเก็บเป็น note/reference ก่อน ยังไม่ upload file ใน MVP
- `QTY` และ `FG` จาก SharePoint เป็น legacy/reference fields เท่านั้น
- CSV importer ต้องข้ามบรรทัดแรก `ListSchema=...`
- เมื่อทำ task เสร็จ ต้องอัปเดต checklist ในไฟล์นี้

## Phase 0: Project Foundation

- [x] Create Next.js full-stack TypeScript project
- [x] Install and configure Tailwind CSS
- [ ] Install and configure shadcn/ui
- [x] Configure ESLint and Prettier
- [x] Configure basic test tooling
- [x] Create `.env.example`
- [x] Update `README.md` with install/dev/build/test commands
- [x] Confirm document links in README

Acceptance checks:

- `npm install` or selected package manager install works
- Dev server starts
- Lint command exists
- Test command exists
- README points to `docs/prd.md`, `docs/design.md`, `docs/task.md`, and `docs/decision-log.md`

## Phase 1: Database Foundation

- [ ] Configure PostgreSQL connection
- [x] Configure ORM and migrations
- [x] Create `users` table
- [x] Create `roles` table
- [x] Create `user_roles` table
- [x] Create `asset_domains` table
- [x] Create `user_domain_permissions` table
- [x] Create `asset_categories` table
- [x] Create `asset_models` table
- [x] Create `locations` table
- [x] Create `assets` table
- [x] Create `asset_status_histories` table
- [x] Create `migration_batches` table
- [x] Create `migration_rows` table
- [x] Add legacy/reference fields for `stock_code`, `image_ref`, `legacy_qty`, `legacy_fg`, and `location_text`
- [x] Add indexes for serial no., status, domain, model, and location
- [x] Add seed data for P' Oak, P' Arm, P' Mek, and Viewer

Acceptance checks:

- Migrations run successfully
- Seed creates Server and Network domains
- Seed creates correct domain permissions
- Duplicate serial no. is rejected
- No quantity-based stock tables are created

## Phase 2: Authentication and Authorization

- [x] Implement password hashing
- [x] Implement cookie-based login
- [x] Implement logout
- [x] Implement current user helper/API
- [x] Implement protected routes
- [x] Implement role loading
- [x] Implement domain permission loading
- [x] Implement permission checker
- [~] Add API guard for manage Server
- [~] Add API guard for manage Network

Acceptance checks:

- Unauthenticated users cannot access protected pages
- P' Oak can manage all domains
- P' Arm can manage Server only
- P' Mek can manage Network only
- Viewer cannot mutate asset data
- API blocks forbidden actions even if UI is bypassed

Implementation notes:

- MVP auth uses seeded email/password accounts through `/api/auth/login`
- Session cookie stores a signed user id and loads roles/permissions from database on each request
- `/dashboard` is protected and shows the signed-in user's Server/Network permissions
- `assertCanManageDomain` and `assertCanViewDomain` exist for future asset mutation/read APIs
- Actual Server/Network mutation endpoints are not built yet, so API guards must be applied when Phase 4/5 APIs are implemented

## Phase 3: Master Data

### Asset Domains

- [ ] Create default Server domain
- [ ] Create default Network domain
- [ ] Prevent deleting domains used by assets

### Categories

- [ ] Create category list page
- [ ] Create category form
- [ ] Implement create/edit category
- [ ] Implement active/inactive category status
- [ ] Scope categories by domain

### Asset Models

- [ ] Create asset model list page
- [ ] Create asset model form
- [ ] Implement create/edit asset model
- [ ] Scope models by domain
- [ ] Search models by name, brand, and model no.

### Locations

- [ ] Create location list page
- [ ] Create location form
- [ ] Implement create/edit location
- [ ] Implement active/inactive location status

Acceptance checks:

- Admin can manage all master data
- Stock owners can manage only allowed domain data where applicable
- Asset model domain cannot conflict with asset domain

## Phase 4: Asset CRUD

- [ ] Create asset list API
- [ ] Create asset detail API
- [ ] Create asset create API
- [ ] Create asset update API
- [ ] Create asset list page
- [ ] Create asset detail page
- [ ] Create register asset form
- [ ] Add search by serial no.
- [ ] Add search by model name
- [ ] Add filters for domain, status, category, and location
- [ ] Add pagination
- [ ] Add duplicate serial no. validation

Acceptance checks:

- One asset record represents one physical item
- Assets can be searched by serial no.
- Duplicate serial no. is rejected
- P' Arm cannot create or edit Network assets
- P' Mek cannot create or edit Server assets

## Phase 5: Asset Status and History

- [ ] Implement status enum
- [ ] Implement status transition rules
- [ ] Implement note-required rules
- [ ] Implement `changeAssetStatus` service
- [ ] Lock asset row during status update
- [ ] Update `assets.status`
- [ ] Insert `asset_status_histories`
- [ ] Create change status UI
- [ ] Show status history timeline on asset detail
- [ ] Add action-specific shortcuts for Borrow, Return, Using, Sold, Fail, Lost, Need Check, and Wait

Acceptance checks:

- Every status change creates history
- Borrow, Using, Sold, Fail, Lost, Need Check, and Wait require note
- Returning Borrow to Ready requires note
- Sold asset is locked from normal reuse workflow
- API enforces domain permission before status update

## Phase 6: SharePoint Migration

- [x] Define expected SharePoint export fields
- [x] Confirm `data/Network.csv` has 594 rows, no blank serial no., no duplicate serial no.
- [x] Confirm `data/Server.csv` has 551 rows, no blank serial no., no duplicate serial no.
- [ ] Build CSV parser
- [ ] Skip SharePoint `ListSchema=...` first line before parsing CSV header
- [ ] Build Excel parser
- [ ] Build field mapping preview
- [ ] Validate required fields
- [ ] Validate status mapping
- [ ] Infer domain from file name: `data/Network.csv` -> Network, `data/Server.csv` -> Server
- [ ] Validate duplicate serial no.
- [ ] Reject blank serial no.
- [ ] Store `QTY` and `FG` as legacy/reference fields only
- [ ] Create migration batch records
- [ ] Create migration row records
- [ ] Import valid rows as assets
- [ ] Create initial status history for imported assets
- [ ] Mark invalid rows as failed or needs review
- [ ] Create import summary page

Acceptance checks:

- Admin can preview SharePoint import before commit
- Valid rows become assets
- Invalid rows do not silently disappear
- Duplicate serial no. is reported
- Blank serial no. is rejected
- Imported assets keep source system and migration batch reference
- Imported row counts match expected source counts unless user intentionally filters rows

## Phase 7: Dashboard

- [ ] Create dashboard layout
- [ ] Show asset count by status
- [ ] Show asset count by Server/Network
- [ ] Show Borrow assets summary
- [ ] Show Using assets summary
- [ ] Show Sold assets summary
- [ ] Show Fail/Lost/Need Check summary
- [ ] Show recent status changes
- [ ] Scope dashboard data by user permission

Acceptance checks:

- P' Oak sees all domains
- P' Arm sees Server-focused data
- P' Mek sees Network-focused data
- Dashboard matches asset list filters

## Phase 8: Reports

- [ ] Create assets by status report
- [ ] Create assets by domain report
- [ ] Create borrowed assets report
- [ ] Create using assets report
- [ ] Create sold assets report
- [ ] Create problem assets report for Fail/Lost/Need Check
- [ ] Create status history report
- [ ] Add filters for domain, status, date range, model, and location
- [ ] Add pagination

Acceptance checks:

- Reports respect domain permissions
- Reports can find Sold assets without deleting them
- Status history report shows changed by, changed at, from status, to status, and note

## Phase 9: Users and Settings

- [ ] Create user list page
- [ ] Create user form
- [ ] Assign roles to users
- [ ] Assign domain permissions to users
- [ ] Activate/deactivate users
- [ ] Create settings page shell

Acceptance checks:

- Admin can manage users and permissions
- Non-admin users cannot manage permissions
- Inactive users cannot login

## Phase 10: Quality and Hardening

- [ ] Add unit tests for permission checker
- [ ] Add unit tests for status transition rules
- [ ] Add unit tests for note-required rules
- [ ] Add integration tests for asset CRUD
- [ ] Add integration tests for status changes
- [ ] Add integration tests for domain permission blocking
- [ ] Add integration tests for SharePoint import
- [ ] Add UI smoke tests for login, asset search, register asset, change status, and import preview
- [ ] Review all API authorization checks
- [ ] Review all status update transactions
- [ ] Review loading, empty, and error states
- [ ] Run lint
- [ ] Run tests
- [ ] Run build

Acceptance checks:

- Lint passes
- Tests pass
- Build passes
- Critical asset workflows work manually
- No API can mutate an asset outside the user's allowed domain

## Backlog

- [ ] Upload paper documents as image/PDF
- [ ] Digital signature
- [ ] Barcode/QR code scanner
- [ ] Employee request workflow before paper document
- [ ] Approval workflow
- [ ] Export reports to Excel
- [ ] SharePoint sync after initial migration
- [ ] Notifications for Need Check or long-borrowed items
- [ ] Mobile-friendly stock check

## Known Risks

- CSV parser may fail if it does not skip the SharePoint schema line
- Future SharePoint exports may add or rename columns
- Users bypassing UI and calling API directly without proper permission checks
- Sold assets accidentally reused if status rules are incomplete
- Status history missing if status update and history insert are not transactional

## Notes

- `assets.status` is the current state
- `asset_status_histories` is the audit trail
- SharePoint import is manual CSV/Excel upload in MVP
- Paper documents remain outside the system in MVP and are referenced by note/reference
- Source CSV files have no blank serial no. and no duplicate serial no. based on current inspection
