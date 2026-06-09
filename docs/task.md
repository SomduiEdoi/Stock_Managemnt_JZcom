# Task Plan

---

## Document Purpose

เอกสารนี้ใช้เป็น task tracker หลักของโปรเจกต์ เพื่อบอกว่าต้องทำอะไร ตอนไหน อะไรเสร็จแล้ว และตอนนี้ควรทำอะไรต่อ

ทุกครั้งที่ AI หรือ developer ทำงานในโปรเจกต์นี้ ควรอ่านไฟล์นี้ก่อนเริ่ม และอัปเดตสถานะหลังทำงานเสร็จ

---

## Status Legend

```text
[ ] Not started
[~] In progress
[x] Done
[!] Blocked
```

---

## Working Rules

- ทำงานทีละ phase ตามลำดับ เว้นแต่มีเหตุผลชัดเจน
- ก่อนเริ่ม task ใหม่ ให้อ่าน `prd.md`, `design.md`, `docs/task.md` และ `docs/skill.md` หากมี
- เมื่อทำ task เสร็จ ต้องอัปเดต checklist ในไฟล์นี้
- หาก requirement เปลี่ยน ต้องอัปเดต `prd.md` หรือ `design.md` ก่อนหรือพร้อมกับ task ที่เกี่ยวข้อง
- ห้ามเริ่ม feature ใหญ่โดยไม่มี acceptance criteria ที่ชัดเจน
- ทุก stock transaction ต้องมี test หรือ manual verification อย่างน้อยหนึ่งแบบ

---

## Current Focus

```text
Phase 0: Project foundation
Next task: Confirm tech stack and initialize project
```
---

## Phase 0: Project Foundation

- [ ] Confirm final tech stack
- [ ] Decide application structure: full-stack Next.js or separated frontend/backend
- [ ] Decide ORM: Prisma or Drizzle
- [ ] Decide auth strategy: cookie session or JWT
- [ ] Create or update `README.md`
- [ ] Create or update `.env.example`
- [ ] Move or confirm document locations
- [ ] Create `docs/skill.md` if not already created
- [ ] Create initial project scaffold
- [ ] Add formatting and linting setup
- [ ] Add basic test setup

Acceptance checks:

- Developer can run install command
- Developer can run dev server
- Developer can run lint command
- Developer can run test command
- Documentation paths are clear

---

## Phase 1: Database Foundation

- [ ] Configure database connection
- [ ] Create migration system
- [ ] Create `users` table
- [ ] Create `roles` table
- [ ] Create `user_roles` table
- [ ] Create `categories` table
- [ ] Create `products` table
- [ ] Create `locations` table
- [ ] Create `stock_transfer_groups` table
- [ ] Create `stock_movements` table
- [ ] Create `inventory_balances` table
- [ ] Add required indexes
- [ ] Add seed data

Acceptance checks:

- Migrations run successfully
- Seed creates default users, roles, categories, locations, and sample products
- SKU uniqueness is enforced at database level
- Inventory balance cannot be negative

---

## Phase 2: Authentication and Authorization

- [ ] Implement password hashing
- [ ] Implement login
- [ ] Implement logout
- [ ] Implement current user endpoint or helper
- [ ] Implement protected routes
- [ ] Implement role loading
- [ ] Implement permission checker
- [ ] Add Admin role
- [ ] Add Manager role
- [ ] Add Staff role
- [ ] Add Viewer role

Acceptance checks:

- Unauthenticated users cannot access protected pages
- Authenticated users can logout
- Users only see actions allowed by their role
- API rejects forbidden actions

---

## Phase 3: Core Master Data

### Products

- [ ] Create product list page
- [ ] Create product search
- [ ] Create product filters
- [ ] Create product form
- [ ] Implement create product
- [ ] Implement edit product
- [ ] Implement active/inactive product status
- [ ] Prevent duplicate SKU

### Categories

- [ ] Create category list
- [ ] Implement create category
- [ ] Implement edit category
- [ ] Implement active/inactive category status

### Locations

- [ ] Create location list
- [ ] Implement create location
- [ ] Implement edit location
- [ ] Implement active/inactive location status

Acceptance checks:

- Admin can manage products, categories, and locations
- Staff and Viewer cannot manage master data unless explicitly allowed
- Product search works by SKU and name
- Inactive records are not used in new stock transactions

---

## Phase 4: Inventory Balance Foundation

- [ ] Implement inventory balance repository
- [ ] Implement get balance by product and location
- [ ] Implement upsert balance
- [ ] Implement balance row locking strategy
- [ ] Implement rebuild balance from movements utility
- [ ] Create inventory balance page
- [ ] Add product search
- [ ] Add category filter
- [ ] Add location filter
- [ ] Add low stock indicator

Acceptance checks:

- Inventory page shows current quantity by product and location
- Low stock is calculated using reorder point
- Balance data can be rebuilt from stock movements

---

## Phase 5: Stock In

- [ ] Create stock in API/service
- [ ] Validate product exists and is active
- [ ] Validate location exists and is active
- [ ] Validate quantity is greater than 0
- [ ] Create stock movement type `IN`
- [ ] Increase inventory balance in database transaction
- [ ] Create stock in page/form
- [ ] Show recent stock in records
- [ ] Add tests

Acceptance checks:

- Stock in increases balance
- Stock movement history records the transaction
- User and timestamp are recorded
- Invalid quantity is rejected

---

## Phase 6: Stock Out

- [ ] Create stock out API/service
- [ ] Validate product exists and is active
- [ ] Validate location exists and is active
- [ ] Validate quantity is greater than 0
- [ ] Lock inventory balance row before checking quantity
- [ ] Reject insufficient stock
- [ ] Create stock movement type `OUT`
- [ ] Decrease inventory balance in database transaction
- [ ] Create stock out page/form
- [ ] Show current balance before submit
- [ ] Add tests

Acceptance checks:

- Stock out decreases balance
- Stock out cannot make balance negative
- Insufficient stock returns clear error
- Movement history records the transaction

---

## Phase 7: Stock Adjustment

- [ ] Create stock adjustment API/service
- [ ] Validate product exists and is active
- [ ] Validate location exists and is active
- [ ] Validate quantity is greater than 0
- [ ] Validate direction
- [ ] Require reason
- [ ] Lock inventory balance row
- [ ] Reject decrease adjustment if it makes balance negative
- [ ] Create stock movement type `ADJUSTMENT`
- [ ] Update inventory balance in database transaction
- [ ] Create adjustment page/form
- [ ] Add tests

Acceptance checks:

- Adjustment requires reason
- Increase adjustment increases balance
- Decrease adjustment decreases balance
- Decrease adjustment cannot make balance negative
- Movement history shows reason and user

---

## Phase 8: Stock Transfer

- [ ] Create stock transfer API/service
- [ ] Validate product exists and is active
- [ ] Validate source location exists and is active
- [ ] Validate destination location exists and is active
- [ ] Reject same source and destination
- [ ] Validate quantity is greater than 0
- [ ] Lock source balance row
- [ ] Reject insufficient source stock
- [ ] Create transfer group
- [ ] Create `TRANSFER_OUT` movement
- [ ] Create `TRANSFER_IN` movement
- [ ] Decrease source balance
- [ ] Increase destination balance
- [ ] Create transfer page/form
- [ ] Add tests

Acceptance checks:

- Source location balance decreases
- Destination location balance increases
- Transfer cannot exceed source stock
- Transfer movements are linked by transfer group

---

## Phase 9: Movement History

- [ ] Create movement history API
- [ ] Create movement history page
- [ ] Add product filter
- [ ] Add location filter
- [ ] Add type filter
- [ ] Add date range filter
- [ ] Add pagination
- [ ] Show reference number, note, reason, user, and timestamp

Acceptance checks:

- User can audit stock changes
- Filters work together
- Large history does not load all records at once

---

## Phase 10: Dashboard

- [ ] Create dashboard layout
- [ ] Show total products
- [ ] Show low stock count
- [ ] Show recent movements
- [ ] Show stock in/out summary
- [ ] Add loading and error states

Acceptance checks:

- Dashboard gives useful stock overview after login
- Recent movements match movement history
- Low stock count matches inventory page

---

## Phase 11: Reports

- [ ] Create current inventory report
- [ ] Create low stock report
- [ ] Create stock movement report
- [ ] Add report filters
- [ ] Add pagination where needed
- [ ] Decide whether export is included in MVP

Acceptance checks:

- Current inventory report matches inventory balances
- Low stock report only shows low stock items
- Movement report filters by date range

---

## Phase 12: User and Settings Management

- [ ] Create user list page
- [ ] Create user form
- [ ] Assign roles to users
- [ ] Activate/deactivate users
- [ ] Create settings page shell

Acceptance checks:

- Admin can manage users
- Non-admin users cannot manage users
- Inactive users cannot login

---

## Phase 13: Quality and Hardening

- [ ] Add unit tests for stock services
- [ ] Add integration tests for stock transaction APIs
- [ ] Add UI smoke tests for critical flows
- [ ] Add validation tests
- [ ] Review all permission checks
- [ ] Review all database transaction usage
- [ ] Review error messages
- [ ] Review loading and empty states
- [ ] Review responsive layout
- [ ] Run lint
- [ ] Run tests
- [ ] Run build

Acceptance checks:

- Lint passes
- Tests pass
- Build passes
- Critical stock flows work manually
- No stock transaction can bypass server-side validation

---

## Backlog

- [ ] Supplier management
- [ ] Purchase order
- [ ] Barcode scanner
- [ ] Import products from CSV/Excel
- [ ] Export reports to CSV/Excel
- [ ] Approval workflow for adjustment
- [ ] Audit log beyond stock movements
- [ ] Notification for low stock
- [ ] Costing method such as FIFO or weighted average
- [ ] Mobile optimized warehouse workflow

---

## Known Risks

- Race condition during stock out or transfer
- Balance cache diverging from stock movements
- Permission checks missing from some API routes
- Soft-deleted or inactive records being used in new transactions
- Reports becoming slow as movement history grows

---

## Notes

- `stock_movements` should remain the audit source of truth
- `inventory_balances` may be used as a read-optimized balance cache
- Any task that updates stock must be handled with database transaction
- Any task that decreases stock must check current balance while holding a lock
