# PRD: Warehouse Management

อัปเดตล่าสุด: 2026-09-02

## 1. Product Summary

Warehouse Management เป็นระบบจัดการ asset และ Warehouse ภายในองค์กร ตั้งแต่การนำข้อมูลเข้าฐานข้อมูล, Inventory, Request Cart, Borrow/Using/Sold, Return, Approval, Project, Transaction History, Asset Status History และ PDF

## 2. Source of Truth

- CSV เป็น master data
- เมื่อ migrate สำเร็จ ข้อมูลถาวรทั้งหมดอยู่ใน PostgreSQL
- Runtime ต้องติดต่อ PostgreSQL โดยตรง
- Transaction, approval, reservation, quantity movement และ status history ต้องตรวจสอบย้อนหลังได้
- Business workflow ห้ามลบ asset; ให้เปลี่ยนสถานะและบันทึกประวัติ

## 3. Roles and Context

System role มีสามแบบ:

| Role | Scope |
| --- | --- |
| `ADMIN` | จัดการระบบ, User, Warehouse, master data, Project และ override |
| `STOCK_CONTROLLER` | ดูแล asset/category/type/status ตาม Warehouse permission |
| `USER` | ดู Inventory/Log, ส่งคำขอ และ approve ตาม context |

Stock Controller tag:

- `STOCK_CONTROLLER`
- `HEAD_STOCK_CONTROLLER`

Organization assignment ประกอบด้วย:

- `organizationLevel`: `EXECUTIVE`, `MANAGER`, `SUPERVISOR`, `STAFF`
- `organizationTag`: หน่วยงานและตำแหน่งภายในสายงาน
- `isPrimary`: ตำแหน่งหลักสำหรับแสดงใน Profile และ User Management
- `isActive`: ระบุว่า assignment นั้นยังมีผลหรือไม่

User หนึ่งคนมี Organization Assignment ได้หลายรายการ เช่น คนเดียวเป็นทั้ง `DL_MANAGER` และ `DL_SUPERVISOR` โดยแต่ละ assignment มี level ของตนเอง

Organization tag ตามโครงสร้างองค์กร:

- Executive: `EXECUTIVE`, `CONSULTANT`
- Solution Consult: `SC_MANAGER`, `S1_SUPERVISOR`, `S1_STAFF`, `N1_SUPERVISOR`, `N1_STAFF`, `C1_SUPERVISOR`, `C1_STAFF`
- Customer Service: `CS_MANAGER`, `CMS_SUPERVISOR`, `CMS_STAFF`, `SD_SUPERVISOR`, `SD_STAFF`, `PRT_SUPERVISOR`, `PRT_STAFF`, `LOCAL_SUPERVISOR`, `LOCAL_STAFF`
- Delivery & Client: `DL_MANAGER`, `DL_SUPERVISOR`, `DL_STAFF`,
- Business Support Department: `BSD_MANAGER`, `BSD_SUPERVISOR`, `BSD_STAFF`

Project tag:

- `LEAD_PROJECT`
- `TEAM_MEMBER`

Project tag และ Stock Controller tag แยกจาก Organization Assignment; User คนเดียวจึงมีหลายตำแหน่งองค์กรและเป็น Lead Project, Team Member หรือ Stock Controller ได้ตามบริบท

## 4. Warehouse, Category and Type

- Warehouse มี code, name, immutable prefix, tracking family และผู้รับผิดชอบ
- Admin สร้าง แก้ไข และปิด Warehouse ได้
- Admin และ Stock Controller จัดการ Category/Type ตาม permission
- Category รองรับ custom fields ชนิด Text, Number, Dropdown และ Boolean
- Warehouse ต้องไม่ถูกลบถ้ายังมี active asset
- Logic กลางต้อง data-driven และไม่จำกัดเฉพาะ Server/Network

## 5. Asset

### SERIAL

- Track รายตัว มี serial number และ quantity เท่ากับ 1
- Request แล้ว lock เป็น `REQUEST`
- คนอื่นยังเห็น asset แต่ request ซ้ำไม่ได้

### QUANTITY

- Track เป็นจำนวน ไม่บังคับ serial number
- Request ต้องระบุ `requestedQuantity`
- ระบบแสดง total, reserved และ available
- ห้าม request เกินจำนวนที่พร้อมใช้

Asset status:

| Status | Meaning |
| --- | --- |
| `READY` | พร้อมให้ request |
| `REQUEST` | ถูก lock หรือ reserve เต็ม |
| `BORROW` | ถูกยืมชั่วคราว |
| `USING` | ถูกใช้ภายในองค์กร |
| `SOLD` | จำหน่ายแล้วและเป็น terminal status |
| `FAIL` | เสียหาย |
| `LOST` | สูญหาย |
| `NEED_CHECK` | รอตรวจสอบ |

ทุก status change ต้องมี Asset Status History พร้อมผู้ดำเนินการ เวลา เหตุผล และ Transaction ที่เกี่ยวข้องเมื่อมี

## 6. Transaction Status

Transaction แยก Business Status ออกจาก Workflow Status

| Transaction Type | Business Status |
| --- | --- |
| `BORROW` | `BORROWED`, `RETURNED` |
| `USING` | `USING`, `RETURNED` |
| `SOLD` | `COMPLETED` |

Workflow Status:

- `PENDING`: รออนุมัติ
- `IN_PROGRESS`: อนุมัติครบและรายการยังมีผล
- `REJECTED`: ถูกปฏิเสธ
- `COMPLETED`: รายการจบแล้ว

## 7. Request No. and Stock Code

Request No.:

```text
REQ-YYYYMMDD-XX
```

- `XX` เป็น sequence สองหลักและ reset รายเดือน
- รองรับสูงสุด 99 รายการต่อเดือน

Stock Code:

```text
XX-YY-ZZZ0000
```

- `XX`: Warehouse prefix 2 ตัว
- `YY`: Category 2 ตัว
- `ZZZ`: Type code 3 ตัว
- `0000`: running sequence

## 8. Request Cart

1. User เลือก asset จาก Inventory
2. Serial asset ถูก lock; Quantity asset ถูก reserve ตามจำนวน
3. Cart รวมหลาย item และหลาย Warehouse ได้
4. User เลือก `BORROW`, `USING` หรือ `SOLD` และระบุ purpose
5. Project request ต้องเลือก Project ที่เกี่ยวข้อง
6. Submit สร้าง Transaction, Items, Request No. และ Approval Steps
7. Asset/reservation ถูกล็อกระหว่าง `PENDING`

## 9. Approval Workflow

ลำดับ approval:

1. Organization: Staff ไป Supervisor หรือ Supervisor ไป Manager
2. Project: Team Member ไป Lead Project เมื่อเป็น Project request
3. Stock Controller ของทุก Warehouse
4. Head Stock Controller ของทุก Warehouse
5. `BSD_STAFF`
6. `BSD_MANAGER`

ข้อกำหนด:

- หลาย Warehouse ใน sequence เดียวกัน approve แบบ parallel แต่ต้องครบทุก Warehouse
- Approver ทำงานได้เฉพาะ current sequence และต้องมีลายเซ็น
- Borrow, Using, Sold และ Return ต้องผ่านทั้ง BSD Staff และ BSD Manager
- BSD Staff เป็นผู้กรอกราคา SOLD
- Reject ต้องมีเหตุผล
- Requester แก้คำขอ PENDING/REJECTED ได้เมื่อยังไม่มี approval สำเร็จ
- การหา approver ต้องตรวจ Organization Assignment ที่ active ทั้งหมดของ User
- ถ้าผู้อนุมัติสอง sequence ที่ติดกันเป็น User คนเดียวกัน ให้กดอนุมัติครั้งเดียว แล้วระบบ auto-approve sequence ถัดไปของบุคคลนั้น พร้อมเก็บ Approval History แยกตาม required tag และระบุว่าเป็น auto-approved
- Project Approval ใช้ Lead Project ปัจจุบันแบบ dynamic ไม่ล็อกผู้อนุมัติจากวันที่ Submit
- ถ้า Project มี Lead หลายคน Lead ที่ active ทุกคนต้องอนุมัติครบใน sequence เดียวกันก่อน workflow ไปต่อ

เมื่อ approval ครบ:

- Borrow: asset `BORROW`, transaction `BORROWED/IN_PROGRESS`
- Using: asset `USING`, transaction `USING/IN_PROGRESS`
- Sold: asset `SOLD`, transaction `COMPLETED/COMPLETED`

## 10. Return and Close

- Return ใช้กับ Borrow/Using ที่ `IN_PROGRESS`
- Requester เดิมหรือ Admin คืนได้ทั้ง transaction หรือราย item
- Return-to-ready สร้าง Derived Return Transaction ที่ `PENDING`
- Return-to-sold สร้าง Derived Sold Transaction ที่ `PENDING`
- Derived transaction ผ่าน approval chain เต็ม รวมทุก Warehouse, BSD Staff และ BSD Manager
- Asset เปลี่ยนเป็น `READY` หรือ `SOLD` หลัง approval ครบเท่านั้น
- Source Transaction อยู่ `IN_PROGRESS` จน item resolve ครบ แล้วเป็น `COMPLETED`
- ระบบป้องกันการสร้าง derived request ซ้ำให้ item ที่กำลังรออนุมัติ

ปัจจุบัน Return UI/API รองรับ `READY` และ `SOLD`; outcome `FAIL`, `LOST`, `NEED_CHECK` ยังเป็นงานเพิ่ม

## 11. Project

- Project เก็บใน PostgreSQL ผ่าน Prisma
- มี Project ID, name, status, Lead Project และ Team Members
- Admin สร้าง Project ได้
- Admin หรือ Lead Project ที่เกี่ยวข้องจัดการสมาชิกและสถานะได้
- Transaction อ้างอิง Project จริงเพื่อใช้แสดงผลและหา approver
- เมื่อเปลี่ยน Lead Project ระบบต้อง sync Project Approval ของทุก transaction ใน Project ที่ยัง `PENDING`
- Pending approval ของ Lead เดิมที่ยังไม่อนุมัติต้องถูกยกเลิกหรือแทนที่ และสร้าง pending approval ให้ Lead ใหม่ทันที
- Lead เดิมต้องหมดสิทธิ์อนุมัติรายการที่ถูกโอนทันที ส่วน Lead ใหม่ต้องเห็นรายการใน Approval Queue
- ถ้ามี Lead หลายคน ระบบต้องสร้าง approval ให้ทุกคนและรอครบทุกคน ไม่ใช้กฎอนุมัติเพียงคนใดคนหนึ่ง
- Approval ที่สำเร็จแล้วและ signature snapshot ต้องคงเป็นประวัติของผู้อนุมัติเดิม
- ถ้า Project approval sequence จบและ workflow ไปขั้นถัดไปแล้ว การเปลี่ยน Lead ต้องไม่ย้อนกลับมาเปิด sequence เดิม
- ถ้า sequence ยังไม่จบและเพิ่ม Lead ใหม่ Lead ใหม่ต้องอนุมัติก่อน sequence จึงถือว่าครบ
- ระบบต้องบันทึกประวัติการเปลี่ยน Lead ว่าเปลี่ยนจากใครเป็นใคร เมื่อใด และใครเป็นผู้ดำเนินการ

## 12. Pages and Visibility

- Dashboard: ภาพรวม asset, transaction และ activity ตาม permission
- Profile/Settings: ข้อมูลผู้ใช้และอัปโหลดลายเซ็น
- User Management: role, Organization Assignments, stock controller tag และ Warehouse permission
- Inventory: Server, Network และ dynamic Warehouse; search, sort, Brand/Category/Type/Status filter
- Asset Detail: รายละเอียด, availability, custom fields, transaction link และ status history
- Request: cart, quantity, type, purpose และ Project
- Transaction Log: ทุกคนเห็น queue, pending approval, in-progress, rejected และ completed ของทุกคนทุก Project โดยใช้ filter/search แยก
- Approval Queue: แสดงรายการที่ current user มีสิทธิ์อนุมัติ
- Project: จัดการ Project, Lead และ Team Member

## 13. PDF

Implemented:

- Transaction PDF แสดง Request No., item list, approval/signature snapshot และข้อมูล Return/Sold

Pending:

- เชื่อม Asset Detail PDF เข้าหน้าและ endpoint จริง
- ปรับใบยืม/คืนตาม official template เมื่อได้รับจากธุรกิจ

## 14. Current Implementation Status

Implemented or mostly implemented:

- PostgreSQL source of truth และ CSV import structure
- Warehouse terminology ใน runtime/schema/API
- User, Warehouse permission, Category/Type และ Project Management
- Serial/Quantity Inventory, Brand filter และ dynamic Warehouse
- Request Cart, reservation, multi-item และ multi-Warehouse
- Request No. แบบรายเดือน
- Approval, signature, reject และ edit pending/rejected request
- Stock Controller/Head Stock Controller ทุก Warehouse และ BSD ทั้งสองขั้น
- Derived Return-to-ready/Return-to-sold approval
- Transaction Log, Return Date, Approval Queue และ Transaction PDF
- ลบ Overdue และ legacy Transaction/Workflow status จาก runtime

Partial or pending:

- Deploy และตรวจข้อมูลจริงของ Warehouse/status cleanup migration
- Return outcome Fail/Lost/Need Check
- Asset Detail PDF
- Official transaction document template
- Cancel Request UX/API
- Focused regression tests สำหรับ approval, quantity และ derived return
- Organization Assignment แบบหลายตำแหน่ง รวม migration, User Management และ approval routing
