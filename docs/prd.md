# PRD: Asset Flow Management System

อัปเดตล่าสุด: 2026-07-22

## 1. Product Summary

Asset Flow Management System หรือชื่อสั้นว่า Asset Flow คือระบบจัดการการไหลของ asset ภายในองค์กร ตั้งแต่ inventory, request cart, borrow/using/sold, return, approval, transaction history, asset status history, user/domain permission และเอกสาร export ที่เกี่ยวข้อง

ระบบเริ่มจาก domain หลักคือ Server และ Network แต่ต้องออกแบบให้เพิ่ม domain อื่นได้ในอนาคต โดยใช้คำว่า `domain` เป็นหน่วยหลักของคลังในระบบทั้งหมด

## 2. Source of Truth

- CSV/SharePoint ใช้เป็น mock/bootstrap data และ migration input เท่านั้น
- เมื่อ migrate สำเร็จแล้ว ข้อมูลทั้งหมดต้องถูกเก็บถาวรใน PostgreSQL
- Runtime ของระบบยืม-คืนเวอร์ชันใหม่ต้องคุยกับ PostgreSQL โดยตรง
- Transaction, approval, status history, quantity reservation และการเปลี่ยนแปลงสำคัญต้องมี audit trail
- อุปกรณ์ที่ถูก request, borrow, using, sold, fail, lost หรือ need check ต้องไม่ถูกลบออกจากฐานข้อมูลใน flow ปกติ แต่เปลี่ยนสถานะหรือบันทึกประวัติแทน

## 3. Implementation Snapshot

สถานะระบบจริงล่าสุดหลังปรับตาม feedback บางส่วน:

- หน้า Profile ถูกปรับให้เรียบขึ้น เอาข้อมูล/สีที่ไม่จำเป็นออก
- User Management เพิ่ม `StockControllerTag` และเอา tag field เดิมที่ไม่จำเป็นออก
- Inventory เพิ่ม filter `Brand`
- Request รองรับการระบุจำนวนสำหรับ asset แบบ `QUANTITY`
- Request No ใช้รูปแบบ `REQ-YYYYMMDD-XX` โดยเลขท้าย reset รายเดือน
- Transaction Log เพิ่ม `Return Date`
- Approval workflow เริ่มใช้งานจริงแล้ว โดยมีขั้น Business/Project, Stock Controller, Head Stock Controller, BSD Staff และ BSD Manager
- รองรับ reject request พร้อมเหตุผล
- Requester สามารถแก้ไขคำขอที่ยังไม่มีผู้ approve ได้
- กรณีขายเริ่มรองรับให้ BSD เป็นผู้กรอกราคา
- มีหน้า Project แล้ว แต่ข้อมูลยังเป็น client-side mock/local state ไม่ใช่ persistent project data

## 4. Roles and Tags

ระบบมี system role หลัก 3 แบบ:

| Role | ความหมาย | สิทธิ์หลัก |
| --- | --- | --- |
| `ADMIN` | ผู้ดูแลระบบสูงสุด | จัดการ master data, user, permission, domain, category/type, project และ override ได้ทุก domain |
| `STOCK_CONTROLLER` | ผู้ดูแลคลัง/domain | จัดการ asset/category/type/status เฉพาะ domain ที่ได้รับมอบหมาย |
| `USER` | พนักงาน/ผู้ใช้งานทั่วไป | ดู asset/log, request asset, submit transaction และ approve ตาม tag/context ของตัวเอง |

### Stock Controller Tags

- `STOCK_CONTROLLER`: ผู้ดูแล domain ในขั้นอนุมัติหลัก
- `HEAD_STOCK_CONTROLLER`: หัวหน้าผู้ดูแล domain ต้อง approve ต่อจาก Stock Controller
- ถ้า transaction มี asset หลาย domain ระบบต้องสร้าง approval ให้ Stock Controller และ Head Stock Controller ของทุก domain ที่เกี่ยวข้อง
- Approval ของหลาย domain ใน step เดียวกันทำแบบ parallel และ workflow ไปต่อเมื่อ approve ครบทุก domain

### Organization Tags

User มี `organizationLevel` และ `organizationTag` สำหรับหา approver ตามสายงาน

- Level: `EXECUTIVE`, `MANAGER`, `SUPERVISOR`, `STAFF`
- Business Support Dept. `(BSD)`: `BSD_MANAGER`, `BSD_STAFF`
- System Network and Cloud `(SCN)`: `SCN_MANAGER`, `S1_SUPERVISOR`, `S1_STAFF`, `N1_SUPERVISOR`, `N1_STAFF`, `C1_SUPERVISOR`, `C1_STAFF`
- Delivery & Client `(DL)`: `DL_MANAGER`, `DL_STAFF`
- Engineering `(EN)`: `EN_MANAGER`, `CMS_SUPERVISOR`, `CMS_STAFF`, `SD_SUPERVISOR`, `SD_STAFF`

### Project Tags

- `LEAD_PROJECT`: หัวหน้าโปรเจกต์
- `TEAM_MEMBER`: สมาชิกโปรเจกต์
- User คนใดก็สามารถมี project tag ได้ ไม่จำกัดว่าจะเป็น manager, supervisor หรือ staff
- Project-bound request จาก `TEAM_MEMBER` ต้องวิ่งผ่าน `LEAD_PROJECT`

## 5. Domain, Category, Type

- Domain คือกลุ่มคลัง เช่น Server, Network และ domain ในอนาคต
- Domain ต้องมี `code`, `name`, `prefix` และ configuration ที่ใช้แยก asset family
- Category และ Type ต้อง belong to domain
- Admin และ Stock Controller ต้องสามารถสร้าง/แก้ไข category/type ได้ตาม permission
- Target ระยะยาวคือ helper, filter และ permission ต้องอ่าน domain จาก DB ทั้งหมด ไม่ hardcode เฉพาะ `SERVER`/`NETWORK`

## 6. Asset Requirement

### SERIAL Asset

- Track รายตัว
- ต้องมี serial number
- quantity = 1
- เมื่อถูก request จะ lock รายตัวและแสดงสถานะ `REQUEST`
- หลัง approve ครบจึงเปลี่ยนเป็น `BORROW`, `USING` หรือ `SOLD`

### QUANTITY Asset

- Track เป็นจำนวน
- ไม่บังคับ serial number
- ต้องมี `assetQuantity`
- ตอน request ต้องระบุ `requestedQuantity`
- ระบบต้องคำนวณ `available`, `reserved`, `borrowed/using/sold` และคืนจำนวนได้
- ถ้ายังมีจำนวนเหลือใน stock asset หลักอาจยังแสดงเป็น `READY`; ถ้าจำนวน available หมด ตารางสามารถแสดงภาพรวมเป็น `REQUEST` เพื่อบอกว่าถูกจองเต็มแล้ว

## 7. Asset Status

| Status | ความหมาย | Rule |
| --- | --- | --- |
| `READY` | พร้อมใช้งาน อยู่ในคลัง | request, borrow, using, sold ได้ |
| `REQUEST` | มีคำขอ/ถูก lock หรือ reserved แล้ว | คนอื่นเห็นใน table ได้ แต่ request ซ้ำไม่ได้ในส่วนที่ถูกจองเต็ม |
| `BORROW` | ถูกยืมชั่วคราว | เมื่อคืนครบและปิด flow แล้วกลับเป็น `READY` |
| `USING` | เบิกใช้ภายในองค์กรระยะยาว | กลับเป็น `READY` เมื่อคืนหรือเปลี่ยน owner |
| `SOLD` | จำหน่ายแล้ว | terminal status ไม่กลับไป request/borrow/using |
| `FAIL` | เสียหาย | อาจเปลี่ยนกลับเป็น `READY` หลังซ่อมหรือตรวจสอบ |
| `LOST` | หายสาบสูญ | ไม่สามารถ request ได้ |
| `NEED_CHECK` | ต้องตรวจสอบ | ใช้ระหว่างรอ audit/เช็ค serial/เช็คสภาพ ก่อนสรุปเป็น Ready/Fail/Lost |

ทุก status change ต้องบันทึก `asset_status_history`

## 8. Transaction and Workflow Status

Transaction มี 2 ชั้นสถานะที่ต้องแยกกัน:

- `transactionStatus`: สถานะธุรกิจของรายการ เช่น borrowed/active/completed/returned
- `workflowStatus`: สถานะของ approval/workflow เช่น pending/in progress/rejected/completed

Mapping หลัก:

| Transaction Type | Business Status |
| --- | --- |
| `BORROW` | `BORROWED`, `RETURNED` |
| `USING` | `ACTIVE`, `RETURNED` |
| `SOLD` | `COMPLETED` |

Workflow status:

- `PENDING`: รออนุมัติ
- `IN_PROGRESS`: อนุมัติครบและรายการยังมีผลอยู่ เช่น borrow/using ที่ยังไม่คืน
- `REJECTED`: ถูกปฏิเสธ
- `COMPLETED`: รายการจบแล้ว เช่น sold เสร็จ หรือ borrow/using คืนครบ

ระบบไม่มีสถานะเกินกำหนดคืนอัตโนมัติแล้ว `dueDate`/`returnDate` ใช้เป็นข้อมูลประกอบใน transaction และ report เท่านั้น

## 9. Stock Code and Requisition No.

### Stock Code

รูปแบบหลัก:

```text
XX-YYY0000
```

- `XX` = domain prefix เช่น `SV`, `NW`
- `YYY` = type code
- `0000` = running sequence ภายใน domain/type

### Requisition No.

รูปแบบที่ใช้งาน:

```text
REQ-YYYYMMDD-XX
```

- `YYYYMMDD` = วันที่สร้าง transaction
- `XX` = running sequence 2 หลัก
- เลขท้าย reset รายเดือน โดยนับจาก prefix `REQ-YYYYMM`
- ถ้าเกิน limit ต่อเดือนต้องแจ้ง error ให้ผู้ใช้รู้

## 10. Request and Approval Workflow

### Request Cart

1. User เลือก asset จาก Inventory
2. SERIAL asset ถูก lock รายตัวด้วย `REQUEST`
3. QUANTITY asset ถูก reserve ตามจำนวนที่เลือก
4. Asset ที่ถูก request แล้วคนอื่นยังเห็นใน table แต่ request ซ้ำไม่ได้ถ้าไม่มีจำนวน available
5. User สามารถรวมหลาย item และหลาย domain ใน request เดียวได้
6. User ระบุ purpose/type เป็น `BORROW`, `USING` หรือ `SOLD` พร้อมรายละเอียดการใช้งาน

### Submit Transaction

1. User กด Submit จาก request cart
2. ระบบสร้าง transaction พร้อม `transactionNo`
3. ระบบสร้าง transaction items พร้อม `requestedQuantity`
4. ระบบสร้าง approval steps
5. Transaction อยู่ที่ `workflowStatus = PENDING`
6. Asset/quantity ยังถูก lock/reserve ระหว่างรอ approval
7. ระบบยังไม่เปลี่ยน final asset status จนกว่า approve ครบ

### Approval Routing

ลำดับ approval ปัจจุบันในระบบจริง:

1. Business tier
   - `STAFF` -> `SUPERVISOR` ของทีมตัวเอง
   - `SUPERVISOR` -> `MANAGER` ของฝ่าย
   - `MANAGER`/`EXECUTIVE` ข้าม tier นี้
2. Project tier
   - ถ้าเป็น project request และ requester เป็น `TEAM_MEMBER` -> `LEAD_PROJECT`
3. Stock Controller tier
   - สร้าง step ให้ `STOCK_CONTROLLER:<domainCode>` ทุก domain ที่เกี่ยวข้อง
4. Head Stock Controller tier
   - สร้าง step ให้ `HEAD_STOCK_CONTROLLER:<domainCode>` ทุก domain ที่เกี่ยวข้อง
5. BSD tier
   - `BSD_STAFF`
   - `BSD_MANAGER`

หมายเหตุ: ระบบจริงตอนนี้ให้ `BSD_MANAGER` อยู่ใน approval chain ของ request ทุกประเภทแล้ว หาก business rule ต้องการให้ `BORROW`/`USING` จบที่ `BSD_STAFF` จะต้องปรับ routing เพิ่ม

### Approve / Reject / Edit

- Approver approve ได้เฉพาะ current step ของตัวเอง
- ถ้า step เดียวมีหลาย domain ต้อง approve ให้ครบทุกคนก่อน workflow ไป step ถัดไป
- Reject ต้องระบุเหตุผลและ release lock/reservation
- Requester แก้ไขคำขอได้เฉพาะ transaction ที่ยัง `PENDING` และยังไม่มี approver คนใด approve แล้ว
- เมื่อ approve ครบ:
  - `BORROW` -> asset `BORROW`, workflow `IN_PROGRESS`
  - `USING` -> asset `USING`, workflow `IN_PROGRESS`
  - `SOLD` -> asset `SOLD`, workflow `COMPLETED`

## 11. Return and Close Workflow

สถานะระบบจริงตอนนี้:

- Return ทำได้หลัง transaction ถูก approve จนเป็น `IN_PROGRESS`
- Requester หรือ Admin สามารถทำ return ได้
- Return เป็นราย item ได้
- Outcome ที่รองรับใน UI/API ตอนนี้คือ `READY` และ `SOLD`
- ถ้า return เป็น `READY` ระบบคืน asset/quantity และปิด item ทันที
- ถ้า outcome เป็น `SOLD` ระบบสร้าง SOLD approval transaction ใหม่ และให้ BSD กรอกราคาในขั้น approval
- Transaction หลักจะ `COMPLETED` เมื่อ item ทั้งหมดถูก resolve แล้ว

Target เพิ่มเติม:

- Return/close outcome ควรรองรับ `READY`, `SOLD`, `FAIL`, `LOST`, `NEED_CHECK`
- การคืน/ขาย/พัง/หายควรผ่าน approval chain ที่เกี่ยวข้อง และจบด้วย `BSD_STAFF -> BSD_MANAGER`
- กรณี fail/lost ควร generate remark เช่น `Fail from REQ-...` หรือ `Lost from REQ-...`

## 12. Pages and UX

### Dashboard

- แสดงภาพรวม asset, request/transaction และ activity ตาม permission
- Staff ทั่วไปไม่ควรเห็น problem item section ที่ไม่เกี่ยวข้อง

### Profile

- แสดงข้อมูลผู้ใช้เท่าที่จำเป็น
- รองรับ upload/signature data สำหรับเอกสาร
- ไม่ใช้สีหรือ field ที่ทำให้สับสนกับ role/tag จริง

### User Management

- Admin จัดการ user ได้
- Role หลักเหลือ `ADMIN`, `STOCK_CONTROLLER`, `USER`
- Stock Controller ต้องมี `StockControllerTag`
- User ต้องมี organization level/tag และอาจมี project tag

### Inventory / Domain Table

- มีหน้า Server, Network และ dynamic domain page
- มี search, sort และ filter
- เพิ่ม filter `Brand`
- แสดง status `REQUEST` หรือ availability สำหรับ asset ที่ถูกจอง
- รองรับปุ่ม request พร้อมระบุ quantity สำหรับ asset แบบ `QUANTITY`

### Request Page

- ทำงานเหมือน cart
- เพิ่ม/ลบ asset ได้ก่อน submit
- แสดง quantity ที่ request
- Validate required fields ก่อน submit

### Transaction Log

- เป็น internal public view: เห็น queue/request/approval/completed ของทุกคนและทุก project แล้วใช้ filter แยกดู
- แสดง `Return Date`
- มี Log tab และ Approve tab
- มี detail page สำหรับ approve/reject/edit pending/return/export PDF

### Project Page

- มีหน้า Project แล้ว
- สถานะปัจจุบันยังเป็น local UI/mock data
- Target ต้องต่อ PostgreSQL ผ่าน `projects` และ `project_members` จริง แล้วผูกกับ transaction

### Asset Detail Page

- แสดงข้อมูล asset, current status, availability, related transaction และ status history
- Target ต้อง export ข้อมูล asset เป็น PDF ได้

## 13. PDF Requirement

Implemented:

- Transaction PDF endpoint มีแล้ว
- เอกสาร transaction รองรับ requisition no, item list, approval/signature snapshot และข้อมูลคืน/ขายบางส่วน

Pending:

- Asset Detail PDF ยังไม่ได้ต่อใช้งานจริง
- Borrow/return official document format รอ template สุดท้ายจากธุรกิจ
- E-signature ต้องตรวจ acceptance กับเอกสารจริงอีกครั้ง

## 14. Acceptance Criteria

### Implemented / Mostly Implemented

- Login เดิมใช้งานได้
- ใช้ PostgreSQL เป็น source of truth หลัง migration
- Role หลักเหลือ 3 role
- User Management รองรับ Stock Controller tag
- Inventory รองรับ Brand filter และ quantity request
- Request cart รองรับหลาย item และหลาย domain
- Submit transaction สร้าง pending approval flow
- Approve/reject request ใช้งานได้
- แก้ไข pending request ได้ก่อนมี approver approve
- Request No เป็น `REQ-YYYYMMDD-XX` และ reset รายเดือน
- Transaction Log แสดง Return Date
- Asset Detail แสดงข้อมูลและ status history

### Partial / Pending

- Project page ยังไม่ต่อ database จริง
- Return approval ยังไม่ครบทุก outcome และยังไม่ใช่ flow BSD Manager เต็มรูปแบบสำหรับทุกกรณี
- Cleanup schema/code ที่ยังมีร่องรอยสถานะเกินกำหนดคืนเก่า
- Dynamic domain ยังมีบาง helper/page ที่ hardcode Server/Network
- Asset Detail PDF ยัง pending
- Branding ใน UI ยังต้องตรวจให้เป็น Asset Flow ครบทุกจุด
