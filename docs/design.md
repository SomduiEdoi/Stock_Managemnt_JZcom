# Design: Asset Flow Management System

อัปเดตล่าสุด: 2026-07-22

## 1. Architecture Baseline

- Frontend/Backend: Next.js full-stack monolith
- Language: TypeScript
- Database: PostgreSQL
- ORM: Prisma
- Styling: Tailwind CSS
- Auth: login/session แบบเดิมไปก่อน
- Source of truth หลัง migration: PostgreSQL
- CSV/SharePoint: ใช้เฉพาะ import/bootstrap data

## 2. Current Implementation Snapshot

ระบบจริงตอนนี้ขยับจาก MVP เดิมไปแล้วหลายส่วน:

- Branding ฝั่งเอกสารใช้ Asset Flow Management System แล้ว แต่ UI บางจุดยังต้องไล่เปลี่ยนจากชื่อเดิม
- Role หลักเหลือ `ADMIN`, `STOCK_CONTROLLER`, `USER`
- User schema/UI มี `organizationLevel`, `organizationTag`, `projectTag`, `stockControllerTag`
- Profile page ถูกทำให้เรียบขึ้นและยังรองรับ signature upload
- User Management รองรับ Stock Controller tag และ domain permission
- Inventory รองรับ Brand filter, sort, availability และ quantity request
- Request cart รองรับ SERIAL lock และ QUANTITY reservation
- Transaction submit สร้าง `workflowStatus = PENDING`, transaction items และ approval steps แล้ว
- Approval/reject/edit pending request เริ่มใช้งานจริง
- Transaction PDF endpoint มีแล้ว
- Transaction Log เพิ่ม Return Date และมี Approve tab
- Return flow รองรับ return เป็น `READY` และ return-to-sold ผ่าน SOLD approval transaction
- Project page มี UI แล้ว แต่ยังเป็น local mock state ไม่ใช่ database-backed feature

## 3. Data Model Mapping

| Concept | Current Prisma model/table | สถานะ |
| --- | --- | --- |
| User | `User` -> `users` | implemented |
| Role | `Role`, `UserRole` | implemented แม้ business role หลักเหลือ 3 แบบ |
| Domain | `AssetDomain` -> `asset_domains` | implemented |
| Category | `AssetCategory` -> `asset_categories` | implemented |
| Type | `AssetType` -> `asset_types` | implemented มี `trackMethod` |
| Asset | `Asset` -> `assets` | implemented |
| Quantity Reservation | `AssetReservation` -> `asset_reservations` | implemented |
| Transaction | `Transaction` -> `transactions` | implemented |
| Transaction Item | `TransactionItem` -> `transaction_items` | implemented |
| Approval | `TransactionApproval` -> `transaction_approvals` | implemented and used |
| Asset Status History | `AssetStatusHistory` -> `asset_status_histories` | implemented |
| Project | migration มี `projects` แต่ `schema.prisma` ปัจจุบันยังไม่มี model | schema mismatch / pending |
| Project Member | migration มี `project_members` แต่ `schema.prisma` ปัจจุบันยังไม่มี model | schema mismatch / pending |

### Schema Risk

มี migration `20260706090000_backend_foundation` ที่สร้าง `projects`, `project_members` และ `project_id` แต่ `schema.prisma` ปัจจุบันยังไม่มี `Project`, `ProjectMember` หรือ `Transaction.projectId` ดังนั้น Project page ตอนนี้จึงไม่ควรถูกนับเป็น source of truth จนกว่าจะ reconcile schema/migration ให้ตรงกัน

## 4. Domain Design

คำว่า domain คือคำหลักสำหรับคลัง/กลุ่ม asset ทั้งหมด

Implemented:

- `AssetDomain` มี `code`, `name`, `prefix`, `inventoryFamily`
- Domain ใช้แยก Server/Network และรองรับ domain อื่นในอนาคต
- Stock Controller permission ผูกกับ domain ผ่าน `user_domain_permissions`
- Dynamic domain page มีอยู่แล้ว
- Admin/Stock Controller สามารถจัดการ category/type ตามสิทธิ์ domain ได้บางส่วน

Technical debt:

- `src/lib/permissions.ts` ยังมี `domainCodes = ["SERVER", "NETWORK"]`
- Sidebar ยังมีทางลัดเฉพาะ Server/Network ซึ่งทำได้ แต่ helper หลักควร data-driven
- Import script ยังผูกกับ CSV Server/Network ซึ่งยอมรับได้สำหรับ initial migration

## 5. Asset Design

### SERIAL

- ใช้ `serialNo`
- `assetQuantity` ควรเป็น 1
- Request แล้ว set status เป็น `REQUEST` และ lock ด้วย `requestLockedById`
- Submit แล้ว asset ยังถูก lock ระหว่าง approval
- Approve ครบแล้วจึงเปลี่ยนเป็น `BORROW`, `USING`, หรือ `SOLD`

### QUANTITY

- ใช้ `assetQuantity`
- ไม่ต้องใช้ serial number
- Request ใช้ `AssetReservation.quantity`
- Submit ใช้ `TransactionItem.requestedQuantity`
- Availability คำนวณจาก total quantity ลบ reservation และ open transaction
- Asset table แสดง availability เพื่อให้รู้ว่ายัง request ได้เท่าไร

## 6. Transaction and Approval Design

### Submit Flow ปัจจุบัน

1. User มี item อยู่ใน request cart
2. `submitTransaction` ตรวจ hold/reservation และ normalize quantity
3. ระบบสร้าง transaction no ด้วย `createMonthlyRequisitionNo`
4. ระบบสร้าง `transactions`, `transaction_items`, `transaction_approvals`
5. Transaction อยู่ที่ `workflowStatus = PENDING`
6. Asset/quantity ยังอยู่ในสถานะ lock/reserve

### Approval Step Generation

ลำดับ step ใน code ปัจจุบัน:

1. Business approver
   - `STAFF` -> supervisor ของทีมตัวเอง
   - `SUPERVISOR` -> manager ของฝ่าย
   - manager/executive skip
2. Project approver
   - ถ้าเป็น project request และ requester เป็น `TEAM_MEMBER` -> `LEAD_PROJECT`
3. Stock Controller per domain
   - required tag: `STOCK_CONTROLLER:<domainCode>`
4. Head Stock Controller per domain
   - required tag: `HEAD_STOCK_CONTROLLER:<domainCode>`
5. BSD Staff
   - required tag: `BSD_STAFF`
6. BSD Manager
   - required tag: `BSD_MANAGER`

Approval หลาย domain ใน step เดียวกันเป็น parallel approval

### Approve

- Approver ทำได้เฉพาะ current step
- ระบบตรวจด้วย `approvalMatchesUser`
- ถ้าเป็น SOLD และ current approver เป็น `BSD_STAFF` ต้องกรอก sold price
- เมื่อ approval ทั้งหมดผ่าน:
  - `BORROW` / `USING` -> `workflowStatus = IN_PROGRESS`
  - `SOLD` -> `workflowStatus = COMPLETED`
  - Asset status และ quantity จะถูก apply ตอนนี้

### Reject

- Reject ต้องมี reason
- Transaction เป็น `REJECTED` และถือว่าจบ workflow
- Serial asset ถูก release กลับ `READY`
- Quantity reservation ถูก release

### Edit Pending Request

- Requester แก้ไขได้เฉพาะ transaction ที่ยัง `PENDING`
- ถ้ามี approval ใดถูก approve แล้ว จะ edit ไม่ได้
- Edit สามารถเปลี่ยน purpose/detail/items/quantity และ rebuild approval steps

## 7. Return and Close Design

Implemented:

- Return ทำได้เฉพาะ transaction `BORROW`/`USING` ที่ `workflowStatus = IN_PROGRESS`
- Return เป็นราย item ได้
- Outcome ปัจจุบันรองรับ `READY` และ `SOLD`
- Return to `READY` update asset/quantity ทันที
- Return to `SOLD` สร้าง SOLD approval transaction ใหม่
- ถ้า sold flow ถึง `BSD_STAFF` ต้องกรอกราคาขาย
- Transaction หลักจะ completed เมื่อทุก item resolved แล้ว

Pending/Target:

- Return outcome ยังควรรองรับ `FAIL`, `LOST`, `NEED_CHECK`
- Return/close ทุกกรณีควรมี approval chain ที่สรุปด้วย BSD ตาม business rule
- ต้องยืนยันว่าการ return to ready ต้องผ่าน BSD หรือ apply ทันทีแบบปัจจุบัน

## 8. API Surface

Implemented endpoints ที่เกี่ยวข้อง:

```text
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/auth/me

POST   /api/domains
GET    /api/domains/:code
PATCH  /api/domains/:code
GET    /api/domains/:code/categories
PATCH  /api/domains/:code/categories

POST   /api/assets
PATCH  /api/assets/:id
DELETE /api/assets/:id
PATCH  /api/assets/:id/status

POST   /api/requests/hold
POST   /api/requests/release

POST   /api/transactions
GET    /api/transactions/:id
PATCH  /api/transactions/:id
POST   /api/transactions/:id/approve
POST   /api/transactions/:id/reject
POST   /api/transactions/:id/return
POST   /api/transactions/:id/items/:itemId/return
GET    /api/transactions/:id/pdf

POST   /api/users
PATCH  /api/users/:id
DELETE /api/users/:id
PATCH  /api/users/:id/status
PATCH  /api/users/:id/assignment
```

Pending endpoints:

```text
GET/POST/PATCH /api/projects
GET/POST/PATCH /api/projects/:id/members
POST /api/transactions/:id/cancel
GET /api/assets/:id/pdf
```

## 9. UI Design Status

Implemented / Mostly implemented:

- Dashboard
- Server Inventory
- Network Inventory
- Dynamic Domain Inventory
- Brand filter
- Sortable inventory table
- Quantity request modal/input
- Request Cart
- Transaction Log with Return Date
- Approval Queue tab
- Transaction detail approve/reject/edit/return
- User Management with Stock Controller tag
- Profile cleanup/signature
- Asset detail with status history
- Project page UI

Partial / Pending:

- Project persistence/API/schema
- Asset detail PDF export button + API
- Full return approval workflow
- Return outcomes `FAIL`/`LOST`/`NEED_CHECK`
- Cleanup legacy status ที่ไม่อยู่ใน requirement แล้ว
- Complete dynamic domain replacement for hardcoded Server/Network helpers
- Complete UI branding ให้เป็น Asset Flow ทุกจุด

## 10. Status Cleanup

Requirement ล่าสุดตัดสถานะเกินกำหนดคืนออกจากระบบแล้ว

Cleanup ที่ควรทำ:

- ตรวจ enum/schema/code ที่ยังมีสถานะ legacy นี้อยู่
- เอา filter/badge/test ที่เกี่ยวข้องกับสถานะนี้ออกหรือไม่ให้แสดงใน UI
- เก็บ `dueDate`/`returnDate` เป็นข้อมูล transaction/report ได้ แต่ไม่สร้าง business status ใหม่จากวันที่

## 11. Test Strategy

ควรเพิ่ม/คง test สำหรับ:

- Monthly requisition no reset
- SERIAL request lock/release
- QUANTITY reservation/availability
- Multi-domain approval step generation
- Stock Controller และ Head Stock Controller permission
- BSD sold price approval
- Reject request release lock/reservation
- Edit pending request only before approval
- Return to ready และ return to sold
- Transaction log visibility/filter/return date
- Dynamic domain ไม่ hardcode Server/Network ในจุดสำคัญ
- Prisma schema/migration consistency สำหรับ Project
