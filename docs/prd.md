# PRD: Asset Flow Management System

Last updated: 2026-07-02

## 1. Product Summary

ระบบ Asset Flow Management System ใช้สำหรับจัดการคลังอุปกรณ์ขององค์กรแบบ project-based โดยรองรับการเพิ่ม/แก้ไขอุปกรณ์, จัดการ domain, category, type, user, project, team member, request cart, approval, borrow/return, using, sold, transaction history, asset status history และ export เอกสารที่เกี่ยวข้อง

ระบบปัจจุบันมี domain หลัก 2 กลุ่มคือ `Server` และ `Network` แต่โครงสร้างต้องรองรับการสร้าง domain เพิ่มในอนาคตสำหรับฝ่ายอื่น ๆ ได้

## 2. Source of Truth

- ไฟล์ CSV/SharePoint ใช้เป็น mockup/bootstrap data และใช้สำหรับ migrate ข้อมูลตั้งต้นเท่านั้น
- เมื่อ migrate สำเร็จแล้ว ข้อมูลทั้งหมดต้องถูกเก็บถาวรใน PostgreSQL
- Runtime ของระบบยืม-คืนเวอร์ชันใหม่ต้องคุยกับ PostgreSQL โดยตรงเท่านั้น
- หลัง migrate แล้วระบบไม่ควรอ่าน CSV หรือ SharePoint ซ้ำใน workflow ปกติ
- การแก้ไข เพิ่ม ลบเชิงตรรกะ และเปลี่ยนสถานะทั้งหมดต้องเกิดใน PostgreSQL

## 3. Current Login Scope

- ใช้ login แบบเดิมของระบบไปก่อน
- ยังไม่ทำ Microsoft 365, Azure AD, LDAP หรือ SSO ใน scope ปัจจุบัน
- LDAP/SSO สามารถเก็บเป็น future enhancement ได้
- ทุก API ที่อ่าน/แก้ไขข้อมูลต้องตรวจ session และ permission ฝั่ง server เสมอ

## 4. Goals

- จัดการ asset จาก PostgreSQL เป็นแหล่งข้อมูลหลัก
- รองรับ asset ทั้งแบบ serial number และแบบ quantity/count
- รองรับ request หลายรายการใน request เดียว เหมือนใส่สินค้าไว้ในตะกร้าก่อน submit
- กันการ request ซ้ำด้วย asset status `REQUEST` หรือ quantity reservation
- รองรับ approval workflow ที่มี BSD อนุมัติทุกคำขอและทุกการคืน
- แสดง transaction history/log ให้ผู้ใช้ภายในเห็นทุก transaction พร้อม filter
- มี asset detail page ที่แสดงข้อมูลทั้งหมดของอุปกรณ์, status history, transaction history และ export PDF ได้
- ไม่ลบ asset ออกจากระบบเมื่อถูกยืม ใช้งาน ขาย เสีย หาย หรือรอตรวจสอบ แต่ใช้การเปลี่ยนสถานะและเก็บ history

## 5. Non-Goals for Current Scope

- ยังไม่ทำ Microsoft 365 / LDAP / SSO
- ยังไม่ finalize format ใบยืม/คืนราย transaction เนื่องจากจะมีการเปลี่ยน format template เอกสารจริง
- ยังไม่ทำ digital signature เต็มรูปแบบ ยกเว้นเก็บ requirement ไว้รองรับภายหลัง
- ยังไม่เชื่อม runtime กลับไปอ่าน SharePoint/CSV หลัง migrate

## 6. Roles, Tags, and Organization Mapping

### System Roles

ระบบมี system role เพียง 3 แบบเท่านั้น:

- `ADMIN`: บัญชีผู้ดูแลระบบส่วนกลาง ใช้จัดการ master data, user, permission, domain, category, type, project และระบบหลังบ้าน ไม่ใช้เป็น role สำหรับเบิก/ยืมทั่วไป
- `STOCK_CONTROLLER`: ผู้ดูแลคลัง ใช้ร่วมกับ domain permission เช่น `SERVER`, `NETWORK` เพื่อระบุว่าดูแลคลังใด
- `USER`: ผู้ใช้งานฝั่งธุรกิจ/พนักงาน ใช้ร่วมกับ organization tag และ project tag เพื่อระบุบริบทการอนุมัติ

### Stock Controller Domain Tags

- Stock Controller หนึ่งคนสามารถดูแลได้เพียง domain เดียว
- ตัวอย่าง domain tag: `SERVER`, `NETWORK`
- ถ้า transaction มี asset หลาย domain ระบบต้องสร้าง approval step ให้ Stock Controller ของทุก domain ที่เกี่ยวข้อง
- Stock Controller approval ของหลาย domain สามารถ approve แบบ parallel ได้ และ workflow ไปต่อได้เมื่อทุก domain approve ครบ

### User Organization Tags

User ต้องมี organization context เพื่อใช้หา approver ตามสายงาน:

- Organization level: `EXECUTIVE`, `MANAGER`, `SUPERVISOR`, `STAFF`
- Organization unit/team tag:
  - Business Support Dept. (`BSD`): `BSD_MANAGER`, `BSD_STAFF`
  - System Network and Cloud (`SCN`): `SCN_MANAGER`, `S1_SUPERVISOR`, `S1_STAFF`, `N1_SUPERVISOR`, `N1_STAFF`, `C1_SUPERVISOR`, `C1_STAFF`
  - Delivery & Client (`DL`): `DL_MANAGER`, `DL_STAFF`
  - Engineering (`EN`): `EN_MANAGER`, `CMS_SUPERVISOR`, `CMS_STAFF`, `SD_SUPERVISOR`, `SD_STAFF`

### Project Tags

- Project membership ใช้ tag `LEAD_PROJECT` และ `TEAM_MEMBER`
- User คนใดก็สามารถเป็น `LEAD_PROJECT` หรือ `TEAM_MEMBER` ได้ ไม่ว่าจะมี organization level เป็น manager, supervisor หรือ staff
- Project-bound request ใช้ project tag ในการหา business approver เช่น `TEAM_MEMBER -> LEAD_PROJECT`

### BSD Approval Tags

- BSD เป็นฝ่ายหนึ่งในองค์กร ไม่ใช่ system role แยก
- `BSD_STAFF` approve ได้ใน transaction ประเภท `BORROW` และ `USING`
- `RETURN` และ `SOLD` ต้องผ่าน `BSD_STAFF -> BSD_MANAGER`
- หาก BSD reject ต้องใส่เหตุผล

## 7. Core Entities

- `domains`: กลุ่มคลัง เช่น Server, Network และ domain ในอนาคต
- `asset_categories`: หมวดหมู่ภายใน domain
- `asset_types`: ประเภท asset ภายใน category
- `assets`: ข้อมูลอุปกรณ์หรือ stock item
- `users`: ผู้ใช้งานและ tag สำหรับ permission/approval
- `projects`: project/service ที่ผูกกับ transaction
- `project_members`: สมาชิก project พร้อม tag เช่น Lead Project หรือ Team Member
- `transactions`: หัวรายการ request/borrow/using/sold/return
- `transaction_items`: รายการ asset หรือ quantity ที่อยู่ใน transaction
- `transaction_approvals`: approval step ของแต่ละ transaction
- `asset_status_history`: ประวัติการเปลี่ยนสถานะของ asset

## 8. Asset Tracking Model

### SERIAL

- ใช้กับอุปกรณ์ที่ต้อง track รายตัว เช่น server, switch, notebook
- ต้องมี serial number หรือ identifier ที่ตรวจสอบซ้ำได้
- quantity ของ asset แบบ serial เท่ากับ 1
- การ request, borrow, using, sold, fail, lost และ need check กระทบ asset ตัวนั้นโดยตรง

### QUANTITY

- ใช้กับของที่นับจำนวนได้ เช่น สาย, module, accessory, consumable หรือ item ที่ไม่ต้อง track serial รายตัว
- ไม่จำเป็นต้องมี serial number
- ต้องมี `asset_quantity`
- `transaction_items` ต้องเก็บ `requested_quantity`
- ระบบต้องคำนวณจำนวนที่ available, requested/reserved, borrowed/using/sold และ returned ได้
- การ request ต้องกันไม่ให้จำนวนที่ถูกขอเกินจำนวนที่ available

## 9. Stock Code and Requisition Number

### Stock Code

รูปแบบเบื้องต้น:

```text
xx-yy0000
```

- `xx` = domain prefix เช่น `SV`, `NW` และ prefix ของ domain ในอนาคต
- `yy` = type code
- `0000` = running sequence

### Requisition Number

รูปแบบเบื้องต้น:

```text
REQ-yyyymmdd-00
```

- `yyyy` = year
- `mm` = month
- `dd` = day
- ใช้กับ request/transaction
- sequence ต้องไม่ซ้ำ และควรรองรับ policy reset ตามปี

## 10. Asset Status

| Status | Meaning | Rule |
| --- | --- | --- |
| `READY` | พร้อมใช้งาน อยู่ในคลัง | request, borrow, using, sold ได้ |
| `REQUEST` | มีคน request แล้ว แต่ยังไม่เสร็จ approval | คนอื่นเห็นได้ แต่ request ซ้ำไม่ได้ |
| `BORROW` | ถูกยืมชั่วคราว | เมื่อ return approved แล้วกลับเป็น `READY` |
| `USING` | เบิกใช้ภายในองค์กร | กลับเป็น `READY` เมื่อ return approved |
| `SOLD` | จำหน่ายแล้ว | terminal status ไม่กลับไป request/borrow/using |
| `FAIL` | เสียหาย | อาจเปลี่ยนกลับเป็น `READY` หลังซ่อมหรือตรวจสอบ |
| `LOST` | หายสาบสูญ | ไม่สามารถ request ได้ |
| `NEED_CHECK` | ต้องตรวจสอบ | ใช้หลังคืน/ปิดงาน/พบปัญหา จนกว่าจะสรุปเป็น Ready/Fail/Lost |

## 11. Transaction Business Status

Transaction มี `workflow/approval state` ที่เป็นสานะของคำขอ จะไม่ทำการเปลี่ยนแปลง สถานะของอุปกรณ์ เด็ดขาด!

### Approval/Workflow State

- `PENDING` = รออนุมัติ (อยู่ระหว่างการพิจารณา)
- `APPROVED` = อนุมัติแล้ว
- `REJECTED` = ปฏิเสธคำขอ
- `IN_PROGRESS` = อยู่ระหว่างดำเนินการ (ใบคำขอนี้มีผลสัมฤทธิ์ ณ ปัจจุบัน)
- `COMPLETED` = คำขอเสร็จสมบุรณ์ 


## 12. Workflow: Setup and Master Data

### Add Asset

1. Admin หรือ Stock Controller เข้าสู่ระบบ
2. เลือก domain
3. กด add asset
4. กรอกข้อมูล asset ให้ครบ
5. ระบบ validate required fields, duplicate serial/stock code และ type/category
6. ระบบบันทึกลง PostgreSQL
7. asset ใหม่แสดงใน table ด้วยสถานะเริ่มต้นที่เหมาะสม เช่น `READY`

### Edit Asset

1. Admin หรือ Stock Controller เลือก asset
2. เปิด asset detail
3. ถ้า asset อยู่ในสถานะ `BORROW`, `USING`, `SOLD`, `REQUEST` ต้องจำกัดการแก้ไขข้อมูลสำคัญ
4. ถ้า asset อยู่ใน `READY`, `FAIL`, `LOST`, `NEED_CHECK` สามารถแก้ไขตาม permission ได้
5. ทุกการเปลี่ยน status ต้องบันทึก `asset_status_history`

### User, Project, Team

- Admin จัดการ user ได้
- Admin หรือผู้มีสิทธิ์ project จัดการ project ได้
- Lead Project เพิ่ม/แก้ไข team member ใน project ที่รับผิดชอบได้
- Project ต้องผูกกับ transaction ที่เป็น service/project workflow

### Domain, Category, Type

- ระบบต้องรองรับ domain แบบ dynamic
- Admin สร้าง/แก้ไข domain ได้
- Admin และ Stock Controller สร้าง/แก้ไข category/type ได้ตาม permission
- Category/type ต้องผูกกับ domain เพื่อกันข้อมูลปนกัน

## 13. Workflow: Request and Approval

1. Requester เข้าสู่ระบบ
2. ค้นหา/เลือก asset ที่ต้องการ
3. ระบบตรวจ availability
4. ถ้า asset พร้อมใช้งาน ผู้ใช้กด request
5. สำหรับ serial asset ระบบเปลี่ยน asset status เป็น `REQUEST` ทันทีเพื่อ lock ไม่ให้คนอื่น request ซ้ำ
6. สำหรับ quantity asset ระบบ reserve จำนวนตาม `requested_quantity`
7. ระบบแสดง request page/cart ให้เพิ่มหรือลบ item ได้
8. Requester ระบุ purpose ว่า `BORROW`, `USING` หรือ `SOLD`
9. Requester กรอกรายละเอียด เช่น เหตุผลการใช้งาน, project, due date, quantity, remark
10. เมื่อกด Submit ระบบสร้าง transaction, approval steps และ genarate เลขคำขอ 
11. ระหว่างรอ approval asset ยังเป็น `REQUEST` หรือ quantity ยังถูก reserve
12. Approval chain ต้องมี BSD ทุกครั้ง
13. ถ้าทุก approver approve ระบบเปลี่ยน asset ตาม purpose:
    - `BORROW` -> asset `BORROW`, transaction `IN_PROGRESS`
    - `USING` -> asset `USING`, transaction `IN_PROGRESS`
    - `SOLD` -> asset `SOLD`, transaction `COMPLETED`
14. ถ้า reject ต้องใส่เหตุผล และ requester สามารถแก้ไขส่งใหม่หรือ cancel (กรณี cancel ไม่กลับไปแก้ไขคำขอ ระบบจะไม่เก็บ history)
15. ถ้า cancel หรือ reject แล้วไม่ไปต่อ ระบบต้อง release asset lock/quantity reservation กลับสู่สถานะก่อน request

### Approval Routing for Request Transactions

Business approver tier:

- ถ้า requester เป็น `STAFF`: ส่งไป `SUPERVISOR` ของทีมตัวเอง
- ถ้า requester เป็น `SUPERVISOR`: ส่งไป `MANAGER` ของฝ่าย
- ถ้า requester เป็น `MANAGER` หรือ `EXECUTIVE`: ข้าม business approver tier และส่งไป Stock Controller
- ถ้าเป็น project-bound request: ส่งจาก `TEAM_MEMBER` ไป `LEAD_PROJECT` ของ project นั้นก่อน ถ้า requester เป็น `LEAD_PROJECT` ของ project นั้นอยู่แล้วให้ข้าม project approver tier

Stock Controller tier:

- ระบบต้องหา domain ทั้งหมดจาก transaction items
- ต้องสร้าง approval ให้ Stock Controller ของทุก domain ที่เกี่ยวข้อง เช่น Server + Network ต้องผ่านทั้ง Server Stock Controller และ Network Stock Controller
- Stock Controller approval หลาย domain สามารถ approve แบบ parallel ได้
- Workflow ไปต่อได้เมื่อ Stock Controller ของทุก domain approve ครบ

BSD tier:

- `BORROW` และ `USING`: หลัง Stock Controller ครบแล้วส่งไป `BSD_STAFF`
- `SOLD`: หลัง Stock Controller ครบแล้วส่งไป `BSD_STAFF -> BSD_MANAGER`
- ทุก reject ต้องระบุ reason และเก็บใน transaction approval history

### 14. Workflow: Return and Close Outcome

1. Requester เปิด log page
2. เลือก transaction หรือ item ที่ต้องการคืน/ปิดผล
3. เลือก outcome: return, sold, fail, lost 
4. กรอก remark, condition, quantity, price หรือข้อมูลที่เกี่ยวข้อง
5. ระบบบันทึก transaction history และตั้ง asset เป็น `NEED_CHECK` ระหว่างรออนุมัติ
6. ระบบสร้าง approval chain โดยรวม Stock Controller ของทุก domain ที่เกี่ยวข้อง และต้องจบด้วย `BSD_STAFF -> BSD_MANAGER`
7. หาก approved:
    - Return ของ borrow/using -> transaction `RETURNED`, asset `READY` หรือคืน quantity
    - Sold outcome -> transaction `COMPLETED`, asset `SOLD`
    - Lost outcome -> transaction `COMPLETED`, asset `LOST`, ระบบ genarate text ในช่อง remark ว่า Lost from ...(เลขคำขอ)
    - Fail outcome -> transaction `COMPLETED`, asset `FAIL`, ระบบ genarate text ในช่อง remark ว่า Fail from ...(เลขคำขอ)
8. หาก rejected ต้องใส่เหตุผล และ requester สามารถแก้ไขส่งใหม่หรือ cancel

## 15. Pages and UX Requirements

### Dashboard

- แสดงภาพรวม stock, problem item และ activity ตาม permission
- Staff ทั่วไปไม่ต้องเห็น problem item section

### Domain Page

- แสดงภาพรวมของอุปกรณ์ใน domain นั้นๆ
- มี table ของแต่ละ domain เช่น Server, Network และ domain อื่นในอนาคต
- ทุก column ควร sort ได้
- หัว column มี dropdown เช่น A-Z, Z-A หรือ filter ตามชนิดข้อมูล
- มี search และ filter สำหรับ status, category, type, brand
- active button ใช้สี orange ตาม UI requirement
- แสดง status `REQUEST` ใน table เมื่อมีคน request แล้ว

### Asset Detail Page

- แสดงข้อมูลทั้งหมดของ asset นั้น
- แสดง current status และ availability
- แสดง status history ของ asset

### Request Page

- ทำงานเหมือน cart
- เพิ่ม asset ได้หลายตัวใน request เดียว
- request ข้าม domain ได้หาก permission และ availability ถูกต้อง
- ต้อง validate required fields ก่อน submit

### Log / Transaction History

- Transaction History เป็น internal public view
- ผู้ใช้ทุกคนเห็นสถานะของทุกคำขอในตาราง `PENDING`, `APPROVED` , `REJECTED`, `IN_PROGRESS`, `COMPLETED` และ history ของทุก project/ทุกคนได้
- ต้องมี search เพื่อค้นหาและ filter เพื่อแยกข้อมูลของตัวเอง, project ที่รับผิดชอบ, status, transaction type, domain
- Action column มีให้กด return

### PDF Export

- ใบยืม/คืนราย transaction อยู่ใน backlog จนกว่าจะได้รับ format จริง
- ระบบควรเตรียม requisition number และ signature fields ไว้รองรับเอกสารอนาคต

## 16. Validation Rules

- ห้าม request serial asset ที่ไม่ใช่ `READY`
- ห้าม request quantity เกิน available quantity
- ห้าม request ซ้ำ asset ที่อยู่ใน `REQUEST`
- ห้ามเปลี่ยน `SOLD` กลับไป status ใช้งานทั่วไป
- การเปลี่ยน status ทุกครั้งต้องมี history
- Reject ทุก approval ต้องมี reason
- `BORROW` / `USING` request ต้องผ่าน `BSD_STAFF`
- `RETURN` / `SOLD` ต้องผ่าน `BSD_STAFF -> BSD_MANAGER`
- Transaction ที่มีหลาย domain ต้องผ่าน Stock Controller ของทุก domain ที่เกี่ยวข้อง
- Category/type ต้องอยู่ใน domain เดียวกับ asset
- Stock code และ requisition no. ต้อง unique

## 17. Acceptance Criteria

- ระบบ migrate CSV เข้า PostgreSQL ได้ และ runtime ไม่อ่าน CSV/SharePoint ซ้ำ
- Login แบบเดิมใช้งานได้ตาม permission ปัจจุบัน
- Admin เห็นและจัดการทุก domain ได้
- Stock Controller จัดการ asset/category/type ใน domain ของตัวเองได้ และเห็น domain อื่น read-only
- User เห็น asset/log ทั้งระบบแบบ read-only และ request ได้
- Request asset แล้ว status เป็น `REQUEST` หรือ quantity ถูก reserve ทันที
- คนอื่นเห็น asset ที่ถูก request แต่ request ซ้ำไม่ได้
- Submit request แล้วรอ approval โดย asset ยัง locked จนจบ workflow
- `BORROW` / `USING` ต้องผ่าน `BSD_STAFF`
- `RETURN` / `SOLD` ต้องผ่าน `BSD_STAFF -> BSD_MANAGER`
- Transaction ที่มีหลาย domain ต้องผ่าน Stock Controller ของทุก domain ที่เกี่ยวข้องก่อนถึง BSD
- Approved borrow/using/sold เปลี่ยน asset และ transaction status ถูกต้อง
- Return approved แล้ว asset กลับ `READY` หรือ quantity กลับเข้าคลัง
- Sold final แล้ว asset เป็น `SOLD`
- Asset Detail Page แสดงข้อมูลครบ, history ครบ
- Transaction History เห็นทุก transaction พร้อม filter
