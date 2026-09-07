# Design: Warehouse Management

อัปเดตล่าสุด: 2026-09-04

## 1. Architecture

- Full-stack: Next.js และ TypeScript
- Database: PostgreSQL
- ORM: Prisma
- UI: React และ Tailwind CSS
- Authentication: login/session แบบปัจจุบัน
- CSV: ใช้เป็น master data; runtime ใช้ PostgreSQL

## 2. Core Data Model

| Concept | Prisma Model | Database Table |
| --- | --- | --- |
| User/Role | `User`, `Role`, `UserRole` | `users`, `roles`, `user_roles` |
| Organization Assignment | target: `UserOrganizationAssignment` | target: `user_organization_assignments` |
| Warehouse | `AssetWarehouse` | `asset_warehouses` |
| Warehouse Permission | `UserWarehousePermission` | `user_warehouse_permissions` |
| Category/Type/Model | `AssetCategory`, `AssetType`, `AssetModel` | asset master tables |
| Custom Field | `AssetCategoryCustomField`, `AssetCustomFieldValue` | custom field tables |
| Asset | `Asset` | `assets` |
| Reservation | `AssetReservation` | `asset_reservations` |
| Project | `Project`, `ProjectMember` | `projects`, `project_members` |
| Transaction | `Transaction`, `TransactionItem` | `transactions`, `transaction_items` |
| Approval | `TransactionApproval` | `transaction_approvals` |
| Status History | `AssetStatusHistory` | `asset_status_histories` |
| CSV Migration | `MigrationBatch`, `MigrationRow` | migration audit tables |

Transaction มี self-relation ผ่าน `sourceTransactionId` เพื่อเชื่อม Source Transaction กับ Derived Return/Sold Transaction

ปัจจุบัน `User` ยังเก็บ `organizationLevel` และ `organizationTag` เป็นค่าเดียว ส่วน target model ต้องย้ายไปใช้ `UserOrganizationAssignment[]` เพื่อรองรับหลายตำแหน่งต่อ User

Target model:

```prisma
model UserOrganizationAssignment {
  id              String            @id @default(uuid()) @db.Uuid
  userId          String            @map("user_id") @db.Uuid
  organizationTag OrganizationTag   @map("organization_tag")
  level           OrganizationLevel @map("organization_level")
  isPrimary       Boolean           @default(false) @map("is_primary")
  isActive        Boolean           @default(true) @map("is_active")
  createdAt       DateTime          @default(now()) @map("created_at")
  updatedAt       DateTime          @updatedAt @map("updated_at")
  user            User              @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, organizationTag])
  @@index([organizationTag, isActive])
  @@map("user_organization_assignments")
}
```

Database ต้องบังคับให้ User มี primary assignment ที่ active ได้ไม่เกินหนึ่งรายการ และ migration ต้องย้ายค่าเดิมจาก `users.organization_level`/`users.organization_tag` ไปเป็น assignment แรก

## 3. Warehouse Design

- Warehouse มี `code`, `name`, `prefix`, `inventoryFamily`, Head Stock Controller และ active state
- Server/Network มี dedicated page ได้ แต่ dynamic route คือ `/dashboard/inventory/[warehouseCode]`
- Sidebar, permission, category/type และ inventory query อ่าน Warehouse จาก PostgreSQL
- Stock Controller permission แยก `canView` และ `canManage`
- Warehouse ที่ยังมี active asset ห้ามลบ
- Migration `20260902090000_warehouse_and_transaction_status_cleanup` เปลี่ยน table/column/index เดิมจาก Domain เป็น Warehouse

## 4. Asset and Inventory Design

### SERIAL

- ใช้ serial number, quantity เท่ากับ 1
- Draft request เปลี่ยน status เป็น `REQUEST` และบันทึก lock owner/time
- Approval ครบจึงเปลี่ยนเป็น `BORROW`, `USING` หรือ `SOLD`

### QUANTITY

- ใช้ `assetQuantity` และไม่บังคับ serial number
- Draft cart ใช้ `AssetReservation.quantity`
- Submit ย้ายจำนวนไป `TransactionItem.requestedQuantity`
- Availability หัก draft reservation และ open `PENDING`/`IN_PROGRESS` transaction items

Inventory รองรับ search, pagination, sort และ filter Brand, Category, Type, Status รวมถึง custom field ที่กำหนดให้ searchable/filterable

## 5. Transaction State Design

| Type | Business Status หลังอนุมัติ | สถานะเมื่อคืน |
| --- | --- | --- |
| `BORROW` | `BORROWED` | `RETURNED` |
| `USING` | `USING` | `RETURNED` |
| `SOLD` | `COMPLETED` | ไม่คืน |

Workflow:

- `PENDING`: รอ approval
- `IN_PROGRESS`: approval ครบและ Borrow/Using ยังไม่คืนครบ
- `REJECTED`: ถูกปฏิเสธ
- `COMPLETED`: Sold สำเร็จหรือ Borrow/Using คืนครบ

## 6. Submit and Approval Design

1. ตรวจ Project, hold/reservation, quantity และ item availability
2. สร้าง `REQ-YYYYMMDD-XX` โดย sequence เริ่มที่ `01` และ reset รายเดือน, Transaction และ Transaction Items
3. สร้าง approval candidates ตามบริบท
4. เก็บ transaction เป็น `PENDING` และคง lock/reservation

Approval sequence:

1. Organization approver: Staff ไป Supervisor หรือ Supervisor ไป Manager
2. Project approver: Team Member ไป Lead Project เมื่อเป็น Project request
3. `STOCK_CONTROLLER:<WAREHOUSE_CODE>` ของทุก Warehouse
4. `HEAD_STOCK_CONTROLLER:<WAREHOUSE_CODE>` ของทุก Warehouse
5. `BSD_STAFF`
6. `BSD_MANAGER`

Approval ใน sequence เดียวกันทำแบบ parallel และต้องผ่านครบก่อนเลื่อนไป sequence ถัดไป ผู้อนุมัติต้องมี signature; ระบบเก็บชื่อ, tag และ signature snapshot

Target organization routing ต้องค้นจาก Organization Assignments ที่ active ทั้งหมด ไม่อ่าน tag เดียวจาก User หาก requester มีหลาย assignment ต้องใช้ primary assignment เป็นค่าเริ่มต้นและให้เลือก request context เมื่อมีมากกว่าหนึ่งสายงานที่ใช้งานได้

หาก assigned approver ของ sequence ปัจจุบันและ sequence ถัดไปเป็น User คนเดียวกัน ระบบให้กดครั้งเดียว แล้ว auto-approve step ถัดไปที่เป็นบุคคลเดียวกัน โดยสร้าง `TransactionApproval` แยกทุก required tag และบันทึกแหล่งที่มาว่า manual หรือ auto-approved เพื่อรักษา audit trail

Project approval ใช้ dynamic assignee:

- เมื่อแก้ Lead Project ให้ transaction ของ Project ที่ยัง `PENDING` sync pending Project Approval ภายใน database transaction เดียวกับการแก้ Project
- ยกเลิก pending assignment ของ Lead ที่ถูกถอดและสร้าง assignment ให้ Lead ปัจจุบันทันที
- Approval Queue และ authorization ต้อง query assignment ล่าสุด เพื่อให้ Lead เดิมหมดสิทธิ์ทันที
- Lead Project ทุกคนอยู่ใน approval sequence เดียวกันและใช้เงื่อนไข all-required
- Approval ที่สำเร็จแล้วเก็บ snapshot เดิมและไม่ถูกลบ
- ถ้า sequence ยังไม่ครบ การเพิ่ม Lead ใหม่จะเพิ่ม pending approval ที่ต้องผ่าน
- ถ้า Project sequence เสร็จและ workflow เลื่อนไปแล้ว ห้าม reopen จากการเปลี่ยน Lead
- มี Project Lead Change History หรือ audit event เก็บ old/new lead, actor และ timestamp

เมื่ออนุมัติครบ:

- Borrow -> business `BORROWED`, workflow `IN_PROGRESS`, asset `BORROW`
- Using -> business `USING`, workflow `IN_PROGRESS`, asset `USING`
- Sold -> business/workflow `COMPLETED`, asset `SOLD`

SOLD บังคับราคาเมื่อ current step เป็น `BSD_STAFF`

## 7. Reject and Edit Design

- Reject ต้องมี comment
- Normal request ที่ reject จะ release Serial lock หรือ Quantity reservation
- Derived Return/Sold ที่ reject บันทึกผลการปฏิเสธโดยไม่ release Source Transaction
- Requester แก้ `PENDING` หรือ `REJECTED` ได้เมื่อยังไม่มี approval สำเร็จ
- การแก้ item/quantity จะตรวจ availability ใหม่และ rebuild approval steps

## 8. Return Design

- Return ใช้ได้กับ Borrow/Using ที่เป็น `IN_PROGRESS`
- Requester เดิมเท่านั้นที่เลือก item ที่ยังไม่ถูก resolve ได้
- `READY` สร้าง Derived Return Transaction: business `RETURNED`, workflow `PENDING`
- `SOLD` สร้าง Derived Sold Transaction: business `COMPLETED`, workflow `PENDING`
- Derived transaction ใช้ approval chain เต็ม รวม controller ทุก Warehouse, BSD Staff และ BSD Manager
- เมื่อ Return ได้รับอนุมัติ ระบบคืน asset/quantity เป็น `READY`, บันทึก returned fields/history และ refresh Source Transaction
- เมื่อ Sold ได้รับอนุมัติ ระบบเปลี่ยน asset/quantity เป็น `SOLD`
- Source Transaction เป็น `COMPLETED` เมื่อทุก item resolve ครบ
- UI/API รองรับ outcome `FAIL`, `LOST`, `NEED_CHECK` ผ่าน derived approval transaction และรองรับ Quantity split

## 9. API Surface

```text
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/auth/me

GET/POST             /api/warehouses
GET/PATCH/DELETE     /api/warehouses/:code
GET/PATCH            /api/warehouses/:code/categories

POST                 /api/assets
GET/PATCH/DELETE     /api/assets/:id
PATCH                /api/assets/:id/status

POST                 /api/requests/hold
POST                 /api/requests/release

POST                 /api/transactions
GET/PATCH             /api/transactions/:id
POST                 /api/transactions/:id/approve
POST                 /api/transactions/:id/reject
POST                 /api/transactions/:id/return
POST                 /api/transactions/:id/items/:itemId/return
GET                  /api/transactions/:id/pdf

GET/POST             /api/projects
PATCH/DELETE         /api/projects/:id

GET/POST             /api/users
PATCH/DELETE         /api/users/:id
PATCH                /api/users/:id/status
PATCH                /api/users/:id/assignment
```

Pending:

- `POST /api/transactions/:id/cancel`

## 10. UI Status

Implemented or mostly implemented:

- Dashboard, Profile/Signature และ User Management
- Server, Network และ Dynamic Warehouse Inventory
- Asset create/edit/detail, custom fields และ status history
- Request Cart, Transaction Log, Approval Queue และ Return page
- Project Management ที่ใช้ PostgreSQL
- Transaction PDF

Partial:

- Organization Assignment แบบหลายตำแหน่งมีใน Prisma/API/UI แล้ว และรองรับ Primary Assignment
- Return outcome Fail/Lost/Need Check อยู่ใน Return workflow แล้ว แต่ยังต้องเพิ่ม integration/E2E tests
- PDF เอกสารทางการยังรอ template

## 11. Verification Strategy

- Prisma format/generate/validate และ migration review
- Typecheck, lint และ unit tests
- Approval routing tests สำหรับ assigned controller, multi-Warehouse, BSD sequence
- Organization assignment tests สำหรับหลายตำแหน่ง, primary assignment และ approver คนเดียวกันหลาย sequence
- Project lead reassignment tests สำหรับ pending transfer, all-leads-required, partial approval และ completed sequence
- Quantity tests สำหรับ over-request, edit/reject release และ partial return
- Derived Return/Sold tests รวม duplicate prevention และ Source Transaction completion
- Regression search ต้องไม่พบ Overdue หรือ runtime Domain naming

## 12. UI Palette

- Brand accent: `#FE7743`
- Surface: `#EFEEEA`
- Primary navy: `#273F4F`
- High-contrast text: `#000000`
