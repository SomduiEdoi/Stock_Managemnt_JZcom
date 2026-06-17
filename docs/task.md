# Task Plan

## Project

Stock Management System

## Document Purpose

เอกสารนี้ใช้เป็น task tracker หลักของโปรเจกต์ โดยอ้างอิงจาก requirement ล่าสุดที่มีทั้ง asset workflow และ transaction workflow

## Status Legend

```text
[ ] Not started
[~] In progress
[x] Done
[!] Blocked
```

## Current Focus

```text
Phase 9: Log and Request Pages
Next task: Create Request page on top of the existing workflow
```

## Locked MVP Decisions

- [x] Use PostgreSQL
- [x] Use TypeScript
- [x] Use Next.js full-stack monolith
- [x] Use Microsoft 365 login
- [x] Use `assets.status` as current asset state
- [x] Use `asset_status_histories` as audit trail for asset status changes
- [x] Use `transactions` and `transaction_items` for business workflow
- [x] Use domain permission for Server/Network
- [x] Use manual CSV/Excel import from SharePoint
- [x] Use CSV/Excel only as one-time migration input
- [x] Use PostgreSQL as the runtime source of truth after migration
- [x] Store paper document references as note/reference only in MVP
- [x] Use `data/Network.csv` and `data/Server.csv` as source migration files
- [x] Require serial no. for every MVP asset
- [x] Use `REQUEST` as temporary lock status before submit
- [x] Use transaction type `BORROW | USING | SOLD`

## Working Rules

- ทำงานทีละ phase ตามลำดับ ยกเว้นมีเหตุผลชัดเจน
- ห้ามกลับไปใช้ stock quantity model ใน MVP
- 1 physical item ต้องเป็น 1 asset record
- Asset ทุกตัวต้องมี serial no. และ serial no. ต้องไม่ซ้ำ
- Asset จะไม่ถูกลบเพราะเหตุผลทางธุรกิจ เช่น sold, fail, lost, borrow
- ทุกการเปลี่ยน asset status ต้องสร้าง `asset_status_histories`
- API ทุกจุดที่แก้ข้อมูลต้องตรวจ role และ domain permission
- `QTY` และ `FG` จาก SharePoint เป็น legacy/reference fields only
- CSV importer ต้องข้ามบรรทัดแรก `ListSchema=...`
- หลัง migration แล้ว runtime features ต้องอ่าน/เขียนจาก PostgreSQL เท่านั้น
- ห้ามให้ dashboard, asset pages, request flow, log page หรือ reports อ่าน CSV เป็น data source
- Asset ที่อยู่ `REQUEST` ห้ามถูก request ซ้ำ
- `OVERDUE` เป็น transaction status ไม่ใช่ asset status
- ตอนนี้ login ยังเป็น user/password ชั่วคราวสำหรับ MVP bootstrap ส่วน Microsoft 365 login ยังรอทำต่อ
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

- `npm install` works
- dev server starts
- lint command exists
- test command exists

## Phase 1: Database Foundation

- [x] Configure PostgreSQL connection
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
- [x] Add Microsoft 365 identity fields to `users`
- [ ] Replace legacy password auth fields if no longer needed
- [x] Add `transactions` table
- [x] Add `transaction_items` table
- [x] Add request lock fields to `assets`
- [x] Add transaction reference to `asset_status_histories`
- [x] Update seed roles to `ADMIN`, `SERVER_OWNER`, `NETWORK_OWNER`, `STAFF`

Acceptance checks:

- migrations run successfully
- user schema supports Microsoft 365 login
- transaction schema supports many assets per transaction
- duplicate serial no. is rejected
- no quantity-based stock tables are created

## Phase 2: Authentication and Authorization

- [ ] Implement Microsoft 365 login
- [x] Implement logout
- [x] Implement current user helper/API
- [x] Implement protected routes
- [x] Implement role loading
- [x] Implement domain permission loading
- [x] Implement permission checker
- [x] Add API guard for manage Server
- [x] Add API guard for manage Network
- [x] Add requester permission rules for Staff

Acceptance checks:

- unauthenticated users cannot access protected pages
- P' Oak can manage all domains
- P' Arm can manage Server only
- P' Mek can manage Network only
- Staff can request but cannot manage master data or override status

## Phase 3: Master Data

- [x] Create default Server domain
- [x] Create default Network domain
- [ ] Prevent deleting domains used by assets
- [ ] Create category list page
- [ ] Create category form
- [ ] Implement create/edit category
- [ ] Implement active/inactive category status
- [ ] Create asset model list page
- [ ] Create asset model form
- [ ] Implement create/edit asset model
- [ ] Scope models by domain
- [ ] Create location list page
- [ ] Create location form
- [ ] Implement create/edit location

Acceptance checks:

- admin manages all master data
- owners manage only allowed domain data
- asset model domain cannot conflict with asset domain

## Phase 4: Asset CRUD and Browse

- [ ] Create asset list API
- [ ] Create asset detail API
- [ ] Create asset related transactions API
- [ ] Create asset PDF export API
- [ ] Create asset create API
- [ ] Create asset update API
- [x] Create Server page
- [x] Create Network page
- [x] Create asset detail page
- [x] Show all asset information on asset detail page
- [x] Show asset-specific status history on asset detail page
- [x] Show asset-related transaction history on asset detail page
- [x] Add export PDF action for asset detail
- [x] Show `REQUEST` status in asset tables
- [x] Add search by serial no.
- [x] Add search by model name
- [x] Add filters for domain, status, category, and location
- [x] Add pagination
- [x] Add duplicate serial no. validation

Acceptance checks:

- one asset record represents one physical item
- assets can be searched by serial no.
- asset detail page shows complete asset data
- asset detail page shows status history for that asset
- asset detail page can export asset information as PDF
- asset PDF export reads from PostgreSQL, not CSV/SharePoint
- `REQUEST` assets are visible but cannot be requested again
- owners cannot edit cross-domain assets

## Phase 5: Asset Status and History

- [x] Implement asset status enum
- [x] Implement asset status transition rules
- [x] Implement note-required rules
- [x] Implement `changeAssetStatus` service
- [x] Lock asset row during status update
- [x] Update `assets.status`
- [x] Insert `asset_status_histories`
- [x] Show status history timeline on asset detail
- [ ] Add owner/admin manual override flow

Acceptance checks:

- every asset status change creates history
- sold asset is locked from normal reuse workflow
- fail/lost/need check are blocked from new transactions until reviewed
- API enforces domain permission before status update

## Phase 6: Request and Transaction Workflow

- [x] Implement request hold API/service
- [x] Change asset from `READY` to `REQUEST` when staff selects it
- [x] Prevent duplicate request on `REQUEST` asset
- [ ] Implement request cart / draft transaction UI
- [x] Allow one transaction to contain many assets
- [x] Implement transaction type `BORROW`
- [x] Implement transaction type `USING`
- [x] Implement transaction type `SOLD`
- [x] Require purpose when submitting transaction
- [x] Require `due_date` for `BORROW`
- [x] Submit transaction and move assets to target status
- [x] Implement return flow for `BORROW`
- [x] Implement return flow for `USING`
- [x] Implement automatic `OVERDUE` update
- [x] Link transaction records to asset status histories

Acceptance checks:

- staff can hold assets in request state before submit
- one transaction can contain Server and Network assets together
- borrow creates `BORROWED` transaction status
- using creates `ACTIVE` transaction status
- sold creates `COMPLETED` transaction status
- borrow and using can return asset to `READY`
- overdue is computed automatically when borrow passes due date

## Phase 7: SharePoint Migration

- [x] Define expected SharePoint export fields
- [x] Confirm `data/Network.csv` has 594 rows, no blank serial no., no duplicate serial no.
- [x] Confirm `data/Server.csv` has 551 rows, no blank serial no., no duplicate serial no.
- [x] Build CSV parser
- [x] Skip SharePoint `ListSchema=...` first line before parsing CSV header
- [ ] Build Excel parser
- [ ] Build field mapping preview
- [x] Validate required fields
- [x] Validate status mapping to new asset enum
- [x] Infer domain from file name
- [x] Validate duplicate serial no.
- [x] Reject blank serial no.
- [x] Store `QTY` and `FG` as legacy/reference fields only
- [x] Create migration batch records
- [x] Create migration row records
- [x] Import valid rows as assets
- [x] Persist all imported source data into PostgreSQL permanent tables
- [x] Create initial asset status history for imported assets
- [x] Mark invalid rows as failed or needs review
- [ ] Create import summary page
- [x] Ensure runtime APIs do not read CSV files after import

Acceptance checks:

- admin can preview SharePoint import before commit
- valid rows become assets
- invalid rows do not silently disappear
- imported assets keep source system and migration batch reference
- imported assets are served from PostgreSQL after migration
- Server/Network pages, dashboard, request flow, log page, and reports do not depend on CSV files

## Phase 8: Dashboard

- [x] Create dashboard layout
- [x] Show asset count by status
- [x] Show asset count by Server/Network
- [x] Show borrow assets summary
- [x] Show using assets summary
- [x] Show sold assets summary
- [x] Show fail/lost/need check summary
- [x] Show recent asset activity
- [x] Show recently table grouped by registered/borrow/using/sold
- [x] Scope dashboard data by user permission

Acceptance checks:

- admin sees all domains
- owners see data for their domain plus allowed read-only context
- staff sees request-relevant overview without manage actions

## Phase 9: Log and Request Pages

- [ ] Create transaction log API
- [x] Create Log page
- [x] Show `Transaction ID`, `Asset`, `Borrower`, `Borrow Date`, `Status`
- [x] Add filters and search for log page
- [ ] Create Request page
- [ ] Show request list for current staff user
- [ ] Show current draft request/cart

Acceptance checks:

- log page is driven by transactions, not only asset histories
- log page supports `BORROWED`, `RETURNED`, `OVERDUE`, `ACTIVE`, `COMPLETED`
- staff can view their own request history

## Phase 10: Users and Settings

- [x] Create user list page
- [ ] Create user form
- [ ] Assign roles to users
- [ ] Assign domain permissions to users
- [ ] Activate/deactivate users
- [x] Store position and last login
- [x] Support block/unblock in UI

Acceptance checks:

- admin can manage users and permissions
- non-admin users cannot manage permissions
- inactive users cannot login

## Phase 11: Quality and Hardening

- [ ] Add unit tests for permission checker
- [ ] Add unit tests for asset status transition rules
- [ ] Add unit tests for transaction status rules
- [ ] Add unit tests for overdue calculation
- [ ] Add integration tests for request hold flow
- [ ] Add integration tests for submit transaction flow
- [ ] Add integration tests for return flow
- [ ] Add integration tests for domain permission blocking
- [ ] Add integration tests for SharePoint import
- [ ] Add integration test proving runtime asset reads come from PostgreSQL after import
- [ ] Add integration test for asset detail PDF export
- [ ] Add UI smoke tests for login, asset search, request cart, submit transaction, and log page
- [ ] Review all API authorization checks
- [ ] Review all status update transactions
- [ ] Review loading, empty, and error states
- [x] Run lint
- [ ] Run tests
- [ ] Run build

Acceptance checks:

- lint passes
- tests pass
- build passes
- request and transaction workflows work manually
- no API can mutate assets outside the user's allowed permission

## Backlog

- [ ] Generate PDF ใบยืม/คืนราย transaction
- [ ] Upload paper documents as image/PDF
- [ ] Digital signature
- [ ] Approval workflow
- [ ] Export reports to Excel
- [ ] Notifications for overdue or need check items
- [ ] Mobile-friendly stock check

## Known Risks

- request lock อาจซ้อนกันถ้า transaction isolation ไม่พอ
- overdue job อาจไม่อัปเดตทันถ้า scheduler ยังไม่ถูกตั้งค่า
- CSV parser อาจ fail ถ้า SharePoint export format เปลี่ยน
- ทีมอาจเผลอใช้ CSV เป็น mock runtime data หลัง import ต้องกันด้วย architecture และ tests
- สิทธิ์ข้าม domain อาจหลุดถ้า API ไม่ตรวจซ้ำฝั่ง server

## Notes

- `assets.status` คือ current asset state
- `asset_status_histories` คือ asset audit trail
- `transactions` และ `transaction_items` คือ business workflow records
- `REQUEST` ใช้กันของซ้ำก่อน submit
- `OVERDUE` อยู่ใน transaction layer
- CSV/SharePoint เป็น migration input เท่านั้น PostgreSQL เป็น source of truth ของระบบจริง
