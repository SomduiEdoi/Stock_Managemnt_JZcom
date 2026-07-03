# Design: Asset Flow Management System

Last updated: 2026-07-03

## 1. Architecture Baseline

- Frontend: ใช้ web application เดิม
- Backend: ใช้ server-side API routes/services
- Database: PostgreSQL
- ORM: Prisma หรือ database abstraction ที่ระบบใช้อยู่
- Runtime source of truth: ใช้ PostgreSQL เป็นแหล่งข้อมูลจริงเพียงตัวเดียว
- CSV/SharePoint: ใช้เฉพาะเป็น input สำหรับ migration/bootstrap ครั้งแรกเท่านั้น
- Authentication: ใช้ login flow เดิมไปก่อน
- Future authentication: LDAP/SSO/Microsoft 365 สามารถเพิ่มภายหลังได้ โดยไม่ควรเปลี่ยน business workflow ของระบบเบิก/ยืม/คืน

## 2. Design Principles

- ห้ามลบ asset จากระบบเพราะผลลัพธ์ทางธุรกิจตามปกติ เช่น ยืม ขาย เสีย หาย ให้เปลี่ยนสถานะและเก็บประวัติแทน
- แยกสถานะ approval/workflow ออกจากสถานะทางธุรกิจของ transaction
- ต้องเก็บ asset status history และ transaction history ให้ตรวจสอบย้อนหลังได้
- การตรวจสิทธิ์ต้องทำที่ server-side API ไม่ใช่พึ่ง UI อย่างเดียว
- Domain ต้องเป็น data-driven และไม่ hardcode แค่ Server กับ Network เพื่อรองรับ domain อื่นในอนาคต
- รองรับทั้งอุปกรณ์แบบระบุ serial รายตัว และ stock แบบนับจำนวนใน data model เดียวกัน
- Transaction history เป็นข้อมูลภายในที่ user ทุกคนเห็นได้ แต่ UI ต้องมี filter เพื่อให้ใช้งานง่าย

## 3. Core Data Model ตาม ER ล่าสุด

ส่วนนี้ยึดตาม ER diagram ล่าสุด ชื่อตารางใน implementation ใช้ lower snake case และอ้างอิง entity จาก ER ได้แก่ `USER`, `DOMAINS`, `ASSETS_CATEGORIES`, `ASSETS_TYPES`, `ASSETS`, `PROJECT`, `PROJECT_MEMBERS`, `TRANSACTIONS`, `TRANSACTIONS_ITEMS`, `TRANSACTIONS_APPROVALS`, และ `ASSET_STATUS_HISTORY`

### user

```text
user_id             uuid primary key
user_name           varchar not null
email               varchar not null
system_role         enum ADMIN | STOCK_CONTROLLER | USER
organization_tag    varchar not null
```

หมายเหตุ:

- `system_role` มีได้เฉพาะ `ADMIN`, `STOCK_CONTROLLER`, หรือ `USER`
- `organization_tag` เป็น field ใน ER สำหรับเก็บบริบทองค์กร ต้องรองรับ tag ที่ตกลงไว้ เช่น `EXECUTIVE`, `MANAGER`, `SUPERVISOR`, `STAFF`, `BSD_MANAGER`, `BSD_STAFF`, `S1_SUPERVISOR`, `S1_STAFF`, `DL_MANAGER`, และ `SD_STAFF`
- Field สำหรับ credential ของ login เดิมเป็นรายละเอียดเชิง implementation และไม่ได้แสดงอยู่ใน ER
- LDAP/SSO identity fields ยังไม่จำเป็นใน scope ปัจจุบัน

### domains

```text
domain_id       uuid primary key
domain_name     varchar not null
domain_prefix   varchar not null
```

ตัวอย่าง:

- `Server` ใช้ prefix `SV`
- `Network` ใช้ prefix `NW`

### assets_categories

```text
category_id     uuid primary key
domain_id       uuid references domains(domain_id)
category_name   varchar not null
```

ความสัมพันธ์:

- `domains` 1 record มี `assets_categories` ได้หลาย record

### assets_types

```text
assets_type_id    uuid primary key
category_id       uuid references assets_categories(category_id)
assets_type_name  varchar not null
track_method      enum SERIAL | QUANTITY
```

ความสัมพันธ์:

- `assets_categories` 1 record มี `assets_types` ได้หลาย record

### assets

```text
asset_id          uuid primary key
assets_type_id    uuid references assets_types(assets_type_id)
category_id       uuid references assets_categories(category_id)
stock_code        varchar not null
serial_number     varchar nullable
brand             varchar nullable
model             varchar nullable
asset_location    varchar nullable
part_no           varchar nullable
asset_status      enum READY | REQUEST | BORROW | USING | SOLD | LOST | FAIL | NEED_CHECK
asset_quantity    int not null
```

กฎ:

- `SERIAL`: ควรมี `serial_number` และ `asset_quantity = 1`
- `QUANTITY`: `serial_number` เป็น null ได้ และ `asset_quantity >= 0`
- `stock_code` ใช้รูปแบบ domain prefix + type code + sequence
- `SOLD` เป็น terminal status สำหรับ workflow ปกติ

### project

```text
project_id       uuid primary key
project_name     varchar not null
project_status   enum ACTIVE | CLOSED
```

### project_members

```text
project_member_id  uuid primary key
project_id         uuid references project(project_id)
user_id            uuid references user(user_id)
project_tag        varchar not null
```

กฎ:

- ค่า `project_tag` คือ `LEAD_PROJECT` และ `TEAM_MEMBER`
- `USER` คนใดก็สามารถเป็น `LEAD_PROJECT` หรือ `TEAM_MEMBER` ได้ตามบริบท project

### transactions

```text
transaction_id          uuid primary key
user_id                 uuid references user(user_id)
project_id              uuid references project(project_id) nullable
transaction_type        enum BORROW | USING | SOLD
transaction_status      varchar not null
transaction_created_at  timestamp not null
```

Field ที่ workflow ต้องใช้ แต่ยังไม่อยู่ใน ER:

- `requisition_no` ยังจำเป็นสำหรับงาน document/report
- สามารถเพิ่ม field เหล่านี้ไว้ใน `transactions` หรือทำเป็น transaction metadata extension ตอน implementation

### transactions_items

```text
transaction_item_id  uuid primary key
transaction_id       uuid references transactions(transaction_id)
asset_id             uuid references assets(asset_id)
requested_quantity   int not null
```

กฎ:

- สำหรับ `SERIAL`, `requested_quantity = 1`
- สำหรับ `QUANTITY`, `requested_quantity` ต้องไม่เกินจำนวนที่ available
- การเคลื่อนไหวของ quantity ให้คำนวณจาก `transactions_items` ร่วมกับ transaction status ไม่ใช่การลบ record

### transactions_approvals

```text
approval_id              uuid primary key
transaction_id           uuid references transactions(transaction_id)
user_id                  uuid references user(user_id)
approval_step_sequence   int not null
approval_required_tag    varchar not null
approver_name_snapshot   varchar not null
approver_tag_snapshot    varchar not null
approval_acted_at        timestamp nullable
approval_comment         text nullable
approval_status          enum PENDING | APPROVED | REJECTED
```

พฤติกรรมที่ต้องรองรับ:

- Stock Controller approval ต้องสร้างตาม domain ที่เกี่ยวข้องในคำขอ
- Parallel approval แทนด้วย `transactions_approvals` หลาย record ที่มี `approval_step_sequence` เดียวกัน แต่มี `approval_required_tag` ต่างกัน
- Workflow จะไป step ถัดไปได้ก็ต่อเมื่อ approval ทุก record ใน `approval_step_sequence` ปัจจุบันเป็น approved แล้ว
- `BORROW` และ `USING` ต้องผ่าน `BSD_STAFF` หลังจากผ่าน Stock Controller แล้ว
- `RETURN` และ `SOLD` ต้องผ่าน `BSD_STAFF` แล้วตามด้วย `BSD_MANAGER`
- การ reject ต้องมี `approval_comment`
- Snapshot fields ต้องเก็บชื่อ/tag ของผู้อนุมัติ ณ เวลานั้น แม้ข้อมูล user จะเปลี่ยนภายหลัง

### asset_status_history

```text
status_history_id       uuid primary key
asset_id                uuid references assets(asset_id)
user_id                 uuid references user(user_id)
transaction_id          uuid references transactions(transaction_id) nullable
previous_status         varchar nullable
new_status              varchar not null
status_change_reason    text nullable
status_changed_at       timestamp not null
```

ทุกครั้งที่ asset status เปลี่ยน ต้องสร้าง record ในตารางนี้ 1 record

## 4. การคำนวณ Availability

### SERIAL Asset

- Available เฉพาะเมื่อ `asset_status = READY`
- เมื่อกด Request ให้เปลี่ยน asset status เป็น `REQUEST` ทันที
- เมื่ออนุมัติสำเร็จ ให้เปลี่ยนเป็น `BORROW`, `USING`, หรือ `SOLD`
- ถ้า cancel/reject ให้ปลด lock กลับไปยังสถานะที่ถูกต้องก่อนหน้า โดยปกติคือ `READY`

### QUANTITY Asset

Field ที่แนะนำให้ derive:

```text
available_quantity =
  asset_quantity
  - pending_requested_quantity
  - active_borrowed_quantity
  - active_using_quantity
  - completed_sold_quantity
```

กฎ:

- เมื่อ Request ต้อง reserve quantity ทันที
- เมื่อ Submit ต้องคง reservation ไว้จนกว่า approval จะจบ
- Reject/cancel ต้องคืน reserved quantity
- Approved borrow/using/sold ต้องย้าย quantity ไปอยู่ใน bucket ที่เกี่ยวข้อง
- Approved return ต้องคืน quantity กลับมาในกรณีที่คืนได้

## 5. โมเดลสิทธิ์การใช้งาน

### การดู Asset

- Admin: เห็นทุก domain
- Stock Controller: manage domain ที่รับผิดชอบ และเห็น domain อื่นแบบ read-only
- User: เห็นทุก domain แบบ read-only

### การจัดการ Asset

- Admin: จัดการได้ทุก domain
- Stock Controller: จัดการได้เฉพาะ domain ที่รับผิดชอบ
- User: แก้ไข asset โดยตรงไม่ได้

### การจัดการ Category/Type

- Admin: จัดการได้ทุก domain
- Stock Controller: จัดการได้เฉพาะ domain ที่รับผิดชอบ

### การจัดการ User

- Admin เท่านั้น

### การดู Transaction History

- User ที่ login แล้วทุกคนสามารถเห็น transaction history ทั้งหมด
- UI ต้องมี filter สำหรับ user/project/status/domain/type/date

### Approval

- การตรวจว่าใคร approve ได้ ต้องดูจาก required system role, domain permission, organization context, project membership หรือ approval tag
- BSD ถูกแทนด้วย organization/approval tags เช่น `BSD_STAFF` และ `BSD_MANAGER` ไม่ใช่ system role แยก
- API ต้อง validate ว่าคนที่กด approve มีสิทธิ์ใน approval step นั้นจริง

## 6. การออกแบบ Workflow

### การ Lock ตอน Request

เมื่อ requester กด request:

1. Validate availability
2. Create หรือ update draft transaction/cart
3. ถ้าเป็น serial asset ให้ set asset status เป็น `REQUEST`
4. ถ้าเป็น quantity asset ให้ reserve requested quantity ใน transaction item
5. สร้าง status history หรือ reservation history

Lock นี้เกิดก่อน submit เพื่อให้ user คนอื่นยังเห็น asset ได้ แต่ request asset/quantity เดิมซ้ำไม่ได้

### การ Submit Request

1. Validate required fields ทั้งหมด
2. Validate cart items ว่ายัง available หรือยังถูก reserve ให้ requester อยู่
3. Set transaction `workflow_status = PENDING_APPROVAL`
4. Generate requisition no ถ้ายังไม่มี
5. Generate approval steps
6. คง asset status เป็น `REQUEST` หรือคง quantity reservation ไว้

### ลำดับการ Approve

Business approver tier:

1. ถ้า requester เป็น `STAFF` ให้ส่งไปที่ `SUPERVISOR` ของทีมตัวเอง
2. ถ้า requester เป็น `SUPERVISOR` ให้ส่งไปที่ `MANAGER` ของฝ่าย
3. ถ้า requester เป็น `MANAGER` หรือ `EXECUTIVE` ให้ข้าม business approver tier
4. ถ้า transaction ผูกกับ project และ requester เป็น `TEAM_MEMBER` ให้ส่งไปที่ `LEAD_PROJECT` ของ project นั้น แต่ถ้า requester เป็น `LEAD_PROJECT` อยู่แล้วให้ข้าม project approver tier

Stock Controller tier:

1. Resolve domain ทุก domain ที่อยู่ใน `transactions_items`
2. สร้าง approval requirement 1 รายการต่อ Stock Controller/domain ที่เกี่ยวข้อง
3. Stock Controller approvals สามารถเป็น parallel ได้
4. Workflow ไปต่อได้เมื่อ Stock Controller ของทุก domain ที่เกี่ยวข้อง approve ครบแล้ว

BSD tier:

1. `BORROW` และ `USING`: ต้องผ่าน `BSD_STAFF`
2. `RETURN` และ `SOLD`: ต้องผ่าน `BSD_STAFF` แล้วตามด้วย `BSD_MANAGER`

### ผลลัพธ์ของการ Approve

ถ้า approval ครบทุก required steps:

- `BORROW`: asset status เป็น `BORROW`
- `USING`: asset status เป็น `USING`
- `SOLD`: asset status เป็น `SOLD`

ถ้า rejected:

- transaction `workflow_status = REJECTED`
- ต้องมี reject reason
- requester สามารถแก้ไขแล้ว resubmit หรือ cancel ได้

ถ้า cancelled:

- ไม่มีเก็บประวัติ
- serial asset lock กลับไปสถานะก่อนหน้า โดยปกติคือ `READY`
- quantity reservation ถูก release

### Return / Close Outcome

1. User เปิด log/return page
2. เลือก transaction/item
3. กรอกรายละเอียด return/sold/lost/fail outcome
4. System สร้าง return workflow และ approval steps
5. Asset อาจถูก set เป็น `NEED_CHECK` ระหว่างรอตรวจสอบ/อนุมัติ
6. Approval chain ต้องผ่าน Stock Controller ทุก domain ที่เกี่ยวข้อง แล้วตามด้วย `BSD_STAFF -> BSD_MANAGER`
7. Approved return เปลี่ยน asset/quantity เป็น `READY` และ business status เป็น `RETURNED`
8. Approved sold outcome เปลี่ยน asset เป็น `SOLD` และ business status เป็น `COMPLETED`

## 7. API Surface

Endpoints ที่แนะนำ:

```text
GET    /api/domains
POST   /api/domains
PATCH  /api/domains/:id

GET    /api/categories
POST   /api/categories
PATCH  /api/categories/:id

GET    /api/types
POST   /api/types
PATCH  /api/types/:id

GET    /api/assets
POST   /api/assets
GET    /api/assets/:id
PATCH  /api/assets/:id
GET    /api/assets/:id/history
GET    /api/assets/:id/transactions
GET    /api/assets/:id/export.pdf

GET    /api/projects
POST   /api/projects
PATCH  /api/projects/:id
POST   /api/projects/:id/members
PATCH  /api/projects/:id/members/:memberId

POST   /api/request-cart/items
PATCH  /api/request-cart/items/:id
DELETE /api/request-cart/items/:id
POST   /api/transactions/submit
GET    /api/transactions
GET    /api/transactions/:id
POST   /api/transactions/:id/approve
POST   /api/transactions/:id/reject
POST   /api/transactions/:id/cancel
POST   /api/transactions/:id/return

POST   /api/migrations/csv/import
```

## 8. ข้อกำหนดด้าน UI

- Table ต้อง sort ได้ราย column
- Column header dropdown ต้องรองรับ A-Z/Z-A หรือ contextual filter
- Active button ใช้สี orange
- Request page ทำงานเหมือน cart
- Asset detail page ต้องแสดงข้อมูล asset ทั้งหมด, status history, related transactions, current availability และ export PDF ได้
- Transaction log เป็น global internal view และต้องมี filter ที่ละเอียด
- Action column ใน transaction history ควรใช้ dropdown actions ตาม permission/status
- Staff dashboard ไม่ควรแสดง problem item section ถ้าไม่เกี่ยวข้อง
- Required fields ต้องแสดง warning ก่อน save/submit

## 9. การออกแบบ Migration

1. อ่าน CSV files ครั้งเดียวตอน migration
2. Map source file หรือ source metadata ไปยัง domain
3. Normalize category/type
4. Generate หรือ validate stock code
5. Detect serial duplicates
6. Insert assets, categories, types และ status history เข้า PostgreSQL
7. เขียน import summary เช่น created, updated, skipped, errors
8. หลัง migration แล้ว runtime ต้องใช้ PostgreSQL เท่านั้น


## 10. การออกแบบ PDF

### Scope ปัจจุบัน

- Data source: PostgreSQL
- ข้อมูลที่ต้องมี: asset fields ทั้งหมด, current status, availability, status history, transaction history และ generated date

### Backlog

- Borrow/return transaction PDF หลังจากได้ final document format
- E-signature และ user uploaded signature
- Document template customization

## 11. แนวทางการทดสอบ

- Unit tests สำหรับ status transitions
- Unit tests สำหรับ quantity availability
- Unit tests สำหรับ permission checks
- Integration tests สำหรับ request -> submit -> approve -> final status
- Integration tests สำหรับ reject/cancel release lock
- Integration tests สำหรับ return approval รวม BSD
- Migration tests สำหรับ CSV -> PostgreSQL
- UI tests สำหรับ table sorting/filtering, request cart, asset detail และ transaction log
