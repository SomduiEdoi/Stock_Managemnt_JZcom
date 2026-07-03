# แผนงาน: Asset Flow Management System

อัปเดตล่าสุด: 2026-07-03

## ข้อตัดสินใจที่ล็อกแล้ว

- [x] PostgreSQL เป็น runtime source of truth
- [x] CSV/SharePoint ใช้เป็น migration/bootstrap input เท่านั้น
- [x] Login ใช้ระบบเดิมไปก่อน
- [x] Microsoft 365 / LDAP / SSO ยังไม่อยู่ใน current scope
- [x] Domains เป็น dynamic data โดยมี Server และ Network เป็น initial data
- [x] ระบบรองรับ assets ทั้งแบบ `SERIAL` และ `QUANTITY`
- [x] Request ทำงานเหมือน cart ก่อน submit
- [x] Request ต้อง lock serial assets ด้วย status `REQUEST`
- [x] Request ต้อง reserve quantity สำหรับ quantity assets
- [x] `BORROW` / `USING` ต้องผ่าน `BSD_STAFF`
- [x] `RETURN` / `SOLD` ต้องผ่าน `BSD_STAFF -> BSD_MANAGER`
- [x] Multi-domain transactions ต้องผ่าน Stock Controller approval ของทุก domain ที่เกี่ยวข้อง
- [x] Stock Controller domain approvals สามารถ run parallel ได้
- [x] Transaction history เห็นได้ภายในโดย authenticated users ทุกคน และควบคุมด้วย filters
- [x] Admin และ Stock Controller สามารถ create/edit category/type ตาม permission
- [x] ER baseline ใช้ `DOMAINS`, `ASSETS_CATEGORIES`, `ASSETS_TYPES`, `ASSETS`, `PROJECT`, `PROJECT_MEMBERS`, `TRANSACTIONS`, `TRANSACTIONS_ITEMS`, `TRANSACTIONS_APPROVALS`, `ASSET_STATUS_HISTORY`, และ `USER`

## Phase 0: ปรับ Requirement ให้ตรงกัน

- [x] กำหนด asset statuses
- [x] กำหนด transaction business statuses
- [x] กำหนด request cart behavior
- [x] กำหนด approval loop
- [x] กำหนด return/close flow
- [x] กำหนดกฎ PostgreSQL-only runtime
- [x] กำหนด requirement ของ asset detail page
- [x] กำหนด requirement เรื่อง domain expansion
- [x] กำหนด role/tag model
- [x] กำหนด organization unit tags และ project tags
- [x] กำหนด context-aware approval routing
- [x] กำหนด serial และ quantity tracking model

## Phase 1: Database Foundation

- [ ] Create หรือ update `domains` table
- [ ] Seed initial domains: Server และ Network
- [ ] เพิ่ม domain prefix สำหรับ stock code generation
- [ ] Create หรือ update `assets_categories`
- [ ] Create หรือ update `assets_types`
- [ ] เพิ่ม `track_method` ให้ asset type และ/หรือ asset
- [ ] เพิ่ม `asset_quantity` สำหรับ quantity/count assets
- [ ] อนุญาตให้ `serial_number` เป็น nullable สำหรับ quantity assets
- [ ] เพิ่ม unique rules สำหรับ stock code และ serial ตามกรณี
- [ ] Create หรือ update `project`
- [ ] Create หรือ update `project_members`
- [ ] Create หรือ update `transactions`
- [ ] Create หรือ update `transactions_items`
- [ ] Create หรือ update `transactions_approvals`
- [ ] Create หรือ update `asset_status_history`
- [ ] เพิ่ม workflow-required fields คือ `due_date` และ `requisition_no` แม้ไม่ได้แสดงใน ER ปัจจุบัน
- [ ] เพิ่ม indexes สำหรับ domain, category, type, status, project, requester, due date

เกณฑ์รับงาน:

- schema รองรับ serial และ quantity assets
- schema รองรับ project-based transactions
- schema รองรับ multi-step approval
- schema รองรับ asset status history
- schema ไม่บังคับใช้ Microsoft 365 identity fields

## Phase 2: Authentication and Permissions

- [ ] รักษา existing login flow ให้ยังทำงานได้
- [ ] Normalize primary roles: `ADMIN`, `STOCK_CONTROLLER`, `USER`
- [ ] Configure allowed values ของ `user.organization_tag`: `EXECUTIVE`, `MANAGER`, `SUPERVISOR`, `STAFF`, `BSD_MANAGER`, `BSD_STAFF`, `SCN_MANAGER`, `S1_SUPERVISOR`, `S1_STAFF`, `N1_SUPERVISOR`, `N1_STAFF`, `C1_SUPERVISOR`, `C1_STAFF`, `DL_MANAGER`, `DL_STAFF`, `EN_MANAGER`, `CMS_SUPERVISOR`, `CMS_STAFF`, `SD_SUPERVISOR`, `SD_STAFF`
- [ ] Configure values ของ `project_members.project_tag`: `LEAD_PROJECT`, `TEAM_MEMBER`
- [ ] เพิ่ม approval tag support สำหรับ `BSD_STAFF` และ `BSD_MANAGER`
- [ ] เพิ่ม domain permission mapping สำหรับ Stock Controller
- [ ] Enforce asset manage permission ในทุก mutating API
- [ ] Enforce category/type permission ในทุก mutating API
- [ ] Enforce approval permission ใน approve/reject APIs
- [ ] เพิ่ม tests สำหรับ permission blocking

เกณฑ์รับงาน:

- Admin จัดการได้ทุกอย่าง
- Stock Controller จัดการได้เฉพาะ assigned domain
- Stock Controller เห็น domain อื่นแบบ read-only
- User เห็น asset/log data ทั้งหมดแบบ read-only และสามารถ request ได้
- `BSD_STAFF` approve borrow/using BSD steps ได้
- `BSD_STAFF` และ `BSD_MANAGER` approve return/sold BSD steps ได้ตามลำดับ

## Phase 3: Migration from CSV to PostgreSQL

- [ ] สร้าง one-time CSV import command หรือ admin import endpoint
- [ ] Map CSV source ไปยัง domain
- [ ] Normalize category และ type
- [ ] Generate หรือ validate stock code
- [ ] Detect duplicate serial numbers
- [ ] Import serial assets ด้วย quantity 1
- [ ] Import count-based assets เป็น quantity assets ตามกรณี
- [ ] เขียน import summary report
- [ ] ป้องกัน runtime workflows ไม่ให้อ่าน CSV/SharePoint หลัง migration

เกณฑ์รับงาน:

- mock CSV data ทั้งหมดมีอยู่ใน PostgreSQL หลัง import
- runtime pages อ่านข้อมูลจาก PostgreSQL เท่านั้น
- import errors ต้องมองเห็นและนำไปแก้ได้

## Phase 4: Domain, Category, and Type Management

- [ ] เพิ่ม domain list และ detail page ถ้ายังไม่มี
- [ ] เพิ่ม create/edit domain สำหรับ Admin
- [ ] เพิ่ม create/edit category สำหรับ Admin
- [ ] เพิ่ม create/edit category สำหรับ Stock Controller ใน assigned domain
- [ ] เพิ่ม create/edit type สำหรับ Admin
- [ ] เพิ่ม create/edit type สำหรับ Stock Controller ใน assigned domain
- [ ] ป้องกันการ delete category/type ที่ถูกใช้โดย assets
- [ ] เพิ่ม validation สำหรับ duplicate type code ใน category เดียวกัน
- [ ] เพิ่ม active/inactive support

เกณฑ์รับงาน:

- Admin configure domain/category/type ได้
- Stock Controller maintain category/type ของ own domain ได้
- asset form ใช้ category/type จาก selected domain เท่านั้น

## Phase 5: Asset Management

- [ ] เพิ่ม asset create form สำหรับ serial assets
- [ ] เพิ่ม asset create form สำหรับ quantity assets
- [ ] เพิ่ม asset edit form
- [ ] เพิ่ม required-field validation และ warning
- [ ] เพิ่ม stock code generator `xx-yy0000`
- [ ] เพิ่ม status change logic พร้อม history
- [ ] จำกัดการ edit สำหรับ `REQUEST`, `BORROW`, `USING`, `SOLD`
- [ ] อนุญาต controlled status changes สำหรับ `READY`, `FAIL`, `LOST`, `NEED_CHECK`
- [ ] เพิ่ม asset search/filter ตาม domain, status, category, type, location, stock code, serial
- [ ] เพิ่ม sortable table columns พร้อม A-Z/Z-A dropdown behavior
- [ ] ใช้ orange active button style

เกณฑ์รับงาน:

- asset table แสดง status `REQUEST`
- asset status history ถูกบันทึกทุกครั้งที่เปลี่ยน
- Stock Controller แก้ cross-domain assets ไม่ได้
- `SOLD` กลับไป active workflow statuses ไม่ได้

## Phase 6: Asset Detail Page

- [ ] แสดง asset fields ทั้งหมด
- [ ] แสดง current status และ availability
- [ ] แสดง quantity summary สำหรับ quantity assets
- [ ] แสดง status history ของ asset ที่เลือก
- [ ] แสดง related transaction history
- [ ] แสดง related requester/project/approver information
- [ ] เพิ่ม PDF export สำหรับ asset detail
- [ ] เพิ่ม tests สำหรับ asset detail data loading

เกณฑ์รับงาน:

- user inspect asset data ทั้งหมดได้ในหน้าเดียว
- PDF export ใช้ PostgreSQL data
- history ที่แสดงใน detail page ต้องตรงกับ status/transaction history tables

## Phase 7: Project and Team Management

- [ ] เพิ่ม project list
- [ ] เพิ่ม create project
- [ ] เพิ่ม edit project
- [ ] เพิ่ม project detail popup/page
- [ ] Assign Lead Project
- [ ] เพิ่ม team members
- [ ] แก้ project name/code
- [ ] เปลี่ยน Lead Project
- [ ] เชื่อม transaction กับ project
- [ ] เพิ่ม project filters ใน log/history

เกณฑ์รับงาน:

- project เป็น core entity
- project membership รองรับ Lead Project และ Team Member
- project transactions filter และ review ได้

## Phase 8: Request Cart and Submit

- [ ] เพิ่ม request button สำหรับ available serial assets
- [ ] เพิ่ม request quantity input สำหรับ quantity assets
- [ ] สร้าง draft request/cart
- [ ] Set serial asset status เป็น `REQUEST` ทันที
- [ ] Reserve quantity ทันทีสำหรับ quantity assets
- [ ] ป้องกัน duplicate request สำหรับ locked serial asset
- [ ] ป้องกัน quantity request ที่เกิน available quantity
- [ ] อนุญาตให้ add assets ข้าม domains ใน request เดียว
- [ ] อนุญาตให้ remove item จาก cart และ release lock/reservation
- [ ] Capture purpose: `BORROW`, `USING`, `SOLD`
- [ ] Capture reason/detail, due date, project, quantity, remark
- [ ] Generate requisition no `REQ-yyyyMMdd-00`
- [ ] Submit request ไปที่ `PENDING_APPROVAL`

เกณฑ์รับงาน:

- request ทำงานเหมือน cart
- user คนอื่นเห็น requested asset ได้ แต่ request ซ้ำไม่ได้
- submit ต้องคง asset lock ไว้จนกว่า approval จะ complete

## Phase 9: Approval Workflow

- [ ] Generate approval steps ตาม transaction context
- [ ] Route `STAFF` request ไปที่ `SUPERVISOR` ของทีม requester
- [ ] Route `SUPERVISOR` request ไปที่ department `MANAGER`
- [ ] Skip business approver tier สำหรับ `MANAGER` และ `EXECUTIVE`
- [ ] Route project-bound `TEAM_MEMBER` request ไปที่ project `LEAD_PROJECT`
- [ ] Generate Stock Controller approvals สำหรับทุก domain ที่เกี่ยวข้อง
- [ ] อนุญาตให้ Stock Controller approvals ที่เกี่ยวข้อง run parallel
- [ ] Include `BSD_STAFF` สำหรับ `BORROW` / `USING`
- [ ] Include `BSD_STAFF -> BSD_MANAGER` สำหรับ `SOLD`
- [ ] เพิ่ม approve action
- [ ] เพิ่ม reject action พร้อม required reason
- [ ] อนุญาต requester แก้ rejected request และ resubmit
- [ ] อนุญาต requester cancel และ release lock/reservation
- [ ] Snapshot approver name/tag
- [ ] Export approval PDF placeholder เฉพาะเมื่อมี format ภายหลัง

เกณฑ์รับงาน:

- transaction complete ไม่ได้ถ้ายังไม่ผ่าน required Stock Controller approvals
- `BORROW` / `USING` complete ไม่ได้ถ้ายังไม่ผ่าน `BSD_STAFF`
- `SOLD` complete ไม่ได้ถ้ายังไม่ผ่าน `BSD_STAFF -> BSD_MANAGER`
- reject reason เป็น required field
- approved request ต้องเปลี่ยน final asset และ business status ถูกต้อง

## Phase 10: Borrow, Using, Sold Status Logic

- [ ] เมื่อ approved borrow ให้ set asset `BORROW` และ transaction `BORROWED`
- [ ] เมื่อ approved using ให้ set asset `USING` และ transaction `ACTIVE`
- [ ] เมื่อ approved sold ให้ set asset `SOLD` และ transaction `COMPLETED`
- [ ] สำหรับ quantity sold ต้อง reduce/mark completed quantity ให้ถูกต้อง
- [ ] เพิ่ม overdue job สำหรับ borrow transactions ที่เลย due date
- [ ] คง overdue asset status เป็น `BORROW`
- [ ] แสดง business status ใน log page

เกณฑ์รับงาน:

- Borrow ใช้ `BORROWED`, `RETURNED`, `OVERDUE`
- Using ใช้ `ACTIVE`, `RETURNED`
- Sold ใช้ `COMPLETED`
- overdue derive จาก due date

## Phase 11: Return and Close Outcome

- [ ] เพิ่ม return page จาก transaction log
- [ ] เลือก borrow/using item ที่ต้องการ return
- [ ] กรอก remark, condition, quantity
- [ ] รองรับ sold outcome เมื่อ workflow ต้องขายหลัง close
- [ ] Set asset เป็น `NEED_CHECK` ระหว่างรอ approval ตามกรณี
- [ ] Generate return approval steps
- [ ] Include Stock Controller approvals สำหรับทุก domain ที่เกี่ยวข้อง
- [ ] อนุญาตให้ Stock Controller approvals ที่เกี่ยวข้อง run parallel
- [ ] Include `BSD_STAFF -> BSD_MANAGER` สำหรับทุก return/close outcome
- [ ] Approved return set transaction `RETURNED`
- [ ] Approved return set asset `READY` หรือ restore quantity
- [ ] Approved sold outcome set asset `SOLD`
- [ ] Reject ต้องมี reason และสามารถ edit/resubmit ได้

เกณฑ์รับงาน:

- return ทุกครั้งต้องผ่าน `BSD_STAFF -> BSD_MANAGER`
- final returned item ต้องกลับมา available
- final sold item ต้องคงเป็น `SOLD`

## Phase 12: Transaction History / Logs

- [ ] สร้าง global internal transaction history page
- [ ] แสดง draft/requested/pending/rejected/cancelled/approved/completed/overdue data
- [ ] แสดงทุก projects และทุก users ให้ authenticated users เห็น
- [ ] เพิ่ม filters สำหรับ requester, project, domain, type, business status, workflow status, date range, approver
- [ ] เพิ่ม action dropdown ราย row
- [ ] แสดงเฉพาะ actions ที่ permission และ status อนุญาต
- [ ] เพิ่ม export/report hooks
- [ ] เพิ่ม tests สำหรับ visibility และ filters

เกณฑ์รับงาน:

- users ทุกคนเห็น transaction history ทั้งหมด
- filters ทำให้ global view ใช้งานได้จริง
- actions ต้อง permission-aware

## Phase 13: Dashboard and Reporting

- [ ] เพิ่ม stock summary by domain
- [ ] เพิ่ม status summary
- [ ] เพิ่ม request queue summary
- [ ] เพิ่ม pending approval summary
- [ ] เพิ่ม overdue summary
- [ ] เพิ่ม problem item summary สำหรับ roles ที่อนุญาต
- [ ] ซ่อน problem item section จาก general staff ถ้าไม่เกี่ยวข้อง
- [ ] เพิ่ม report/export entry points

เกณฑ์รับงาน:

- dashboard สะท้อน PostgreSQL data
- dashboard เคารพ permission และ role/tag rules

## Phase 14: PDF and Signature Backlog

- [ ] Implement asset detail PDF export
- [ ] คง borrow/return transaction PDF ไว้ pending จนกว่าจะได้ final format
- [ ] เตรียม fields สำหรับ requisition no และ signature snapshots
- [ ] Backlog: user uploaded signature
- [ ] Backlog: e-signature approval
- [ ] Backlog: document template customization

เกณฑ์รับงาน:

- asset detail PDF ใช้งานได้ตอนนี้
- transaction document generation รอ template

## Phase 15: Quality and Regression

- [ ] Unit test asset status transitions
- [ ] Unit test quantity availability calculation
- [ ] Unit test request lock and release
- [ ] Unit test approval chain generation
- [ ] Unit test organization approver routing
- [ ] Unit test project approver routing
- [ ] Unit test multi-domain Stock Controller approval generation
- [ ] Unit test BSD routing สำหรับ borrow/using vs return/sold
- [ ] Unit test overdue calculation
- [ ] Integration test request -> submit -> approve -> borrow
- [ ] Integration test request -> reject -> edit -> resubmit
- [ ] Integration test request -> cancel -> release
- [ ] Integration test return -> approve -> ready
- [ ] Integration test sold -> terminal status
- [ ] Migration test CSV -> PostgreSQL
- [ ] UI test table sorting/filtering
- [ ] UI test asset detail PDF trigger

## ความเสี่ยง

- Quantity availability อาจ inconsistent ถ้า reservation และ approval ไม่ทำแบบ transactional
- Public transaction history ต้องระวังไม่ expose secrets เกินข้อมูล internal stock workflow
- Dynamic domain support อาจพังถ้า code ยัง hardcode Server/Network
- Approval routes ต้องมี fallback ที่ชัดเจนเมื่อ required approver ไม่อยู่
- Existing login ต้องถูก preserve ระหว่าง refactor user/role schema
