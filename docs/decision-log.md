# Decision Log: Warehouse Management

อัปเดตล่าสุด: 2026-09-04

## 2026-09-02: ใช้ชื่อ Warehouse Management

- ชื่อระบบคือ `Warehouse Management`
- ชื่อนี้สื่อถึงขอบเขตการจัดการ Warehouse, inventory, request, approval, borrow, using, sold, return, history และ document flow

## 2026-07-22: PostgreSQL เป็น Source of Truth

- CSV/SharePoint เป็น mock, bootstrap หรือ migration input เท่านั้น
- หลัง import แล้ว runtime ใช้ PostgreSQL โดยตรง เพื่อรักษา transaction, approval, reservation และ audit history อย่างถาวร

## 2026-07-22: มี 3 System Roles

- System role มี `ADMIN`, `STOCK_CONTROLLER`, `USER`
- Organization, Project และระดับ Stock Controller ใช้ tag/context เพราะคนเดียวอาจมีหลายหน้าที่

## 2026-07-22: รองรับ SERIAL และ QUANTITY

- Asset รองรับ `SERIAL` และ `QUANTITY`
- Quantity request ต้องระบุจำนวนและใช้ reservation/open transaction คำนวณ availability
- มี `AssetReservation` และ `TransactionItem.requestedQuantity` ใช้งานแล้ว

## 2026-07-22: รูปแบบ Request No.

- ใช้ `REQ-YYYYMMDD-XX` โดย `XX` เริ่มที่ `01` และ reset รายเดือน
- มี generator และ tests สำหรับรูปแบบ, month boundary และ limit 99 รายการ

## 2026-07-22: Project ต้องเป็น Persistent Data

- Project และ membership ต้องอยู่ใน PostgreSQL และเชื่อม Transaction
- ปัจจุบัน Prisma มี `Project`, `ProjectMember`, `Transaction.projectId` และมีหน้า/API จัดการ Project แล้ว

## 2026-07-22: BSD เป็นผู้กำหนดราคาขาย

- Requester ไม่กรอกราคาขาย
- `BSD_STAFF` กรอกราคาใน SOLD approval ก่อนส่งต่อ `BSD_MANAGER`
- ราคาเก็บใน transaction/item และใช้ในเอกสาร transaction

## 2026-08-06: Prefix ถูกล็อกหลังสร้าง

- Warehouse prefix กำหนดเฉพาะตอนสร้าง
- Stock code ใช้ `XX-YY-ZZZ0000`: Warehouse prefix 2 ตัว, Category prefix 2 ตัว, Type code 3 ตัว และ sequence 4 หลัก

## 2026-08-06: Head Stock Controller ผูกกับ Warehouse

- Head Stock Controller ไม่ใช่ global approver
- แต่ละ Warehouse ระบุ Head Stock Controller ของตน และ approval ตรวจ assigned user

## 2026-09-02: เปลี่ยน Domain เป็น Warehouse

- `Domain` เปลี่ยนเป็น `Warehouse` ใน runtime code, Prisma model, table/column, API และเอกสาร
- `Inventory` ยังใช้เรียกหน้าตารางรายการ asset ได้
- ใช้ `AssetWarehouse`, `UserWarehousePermission`, `warehouseId`, `warehouseCode` และ `/api/warehouses`
- มี migration สำหรับ rename แล้ว แต่ต้อง deploy กับฐานข้อมูลจริงอย่างควบคุม

## 2026-09-02: ยกเลิก Overdue

- ไม่มี business status, scheduler, badge, filter หรือ workflow logic สำหรับ Overdue
- ไม่คำนวณหรือเปลี่ยนสถานะจาก `dueDate`
- Business status เหลือ `BORROWED`, `RETURNED`, `USING`, `COMPLETED`
- Workflow status เหลือ `PENDING`, `IN_PROGRESS`, `REJECTED`, `COMPLETED`

## 2026-09-02: ทุก Action ต้องผ่าน BSD

- Borrow, Using, Sold และ Return ต้องผ่าน `BSD_STAFF` และ `BSD_MANAGER`
- ก่อน BSD ต้องผ่าน Organization/Project approver และ Stock Controller/Head Stock Controller ของทุก Warehouse ในรายการ

## 2026-09-02: Return เป็น Derived Approval Transaction

- Return-to-ready และ Return-to-sold ห้าม apply ทันที
- ระบบสร้าง derived transaction ที่อ้าง `sourceTransactionId` และเริ่มเป็น `PENDING`
- Source transaction คง `IN_PROGRESS` จน item ถูก resolve ครบ
- ป้องกัน derived transaction ซ้ำสำหรับ item เดิม
- Return UI/API รองรับ `READY`, `SOLD`, `FAIL`, `LOST`, `NEED_CHECK` และส่งผ่าน derived approval transaction

## 2026-09-02: User มีหลาย Organization Assignments

- User หนึ่งคนสามารถมีหลายตำแหน่งพร้อมกัน เช่น `DL_MANAGER` และ `DL_SUPERVISOR`
- Organization Level และ Organization Tag ต้องอยู่ในแต่ละ assignment
- มี `isPrimary` สำหรับตำแหน่งหลักและ `isActive` สำหรับควบคุมช่วงเวลาที่ตำแหน่งมีผล
- Project Tag และ Stock Controller Tag ยังคงเป็น context แยก

Reason:

- โครงสร้างองค์กรจริงมีกรณีบุคคลเดียวรับผิดชอบหลายระดับหรือตำแหน่ง และตำแหน่งเหล่านั้นมีผลต่อ approval routing ต่างกัน

Implementation status:

- มี `UserOrganizationAssignment`, migration, API, User Management และ approval lookup แล้ว
- Primary assignment ต้องถูกเลือกอย่างชัดเจน ไม่ใช้รายการแรกเป็นค่าอัตโนมัติ

## 2026-09-07: Legacy Stock Code Policy

- Stock code ใหม่ต้องใช้รูปแบบ `XX-YY-ZZZ0000` และ unique
- Legacy stock code ที่ถูกต้องให้คงเดิม
- Legacy stock code ที่ผิด format ต้องผ่าน verification และ mapping ก่อนแก้
- ห้ามแก้ stock code อัตโนมัติหากมี Transaction, Approval, Reservation หรือ Status History อ้างอิง
- การแก้ต้องเป็น administrative operation ที่มี audit และตรวจ duplicate ก่อนบันทึก

## 2026-09-02: Approver คนเดียวถือหลายขั้น

- หาก sequence ที่ติดกันถูก assign ให้ User คนเดียวกันจากคนละ Organization Assignment ให้ผู้ใช้กด Approve ครั้งเดียว
- ระบบ auto-approve sequence ถัดไปของ User คนเดิม แต่ต้องสร้าง Approval History แยกทุกตำแหน่ง
- History ต้องระบุ manual/auto-approved และเก็บ required tag snapshot

Reason:

- ลดการกดซ้ำโดยไม่สูญเสียหลักฐานว่า workflow ผ่านทุกตำแหน่งตามโครงสร้าง

## 2026-09-02: Project Approval ใช้ Lead ปัจจุบัน

- Project Approval เป็น dynamic assignment ตาม Lead Project ปัจจุบัน
- เมื่อเปลี่ยน Lead จาก A เป็น B ให้ pending approval ของ A ถูกโอนไป B ทันที
- A หมดสิทธิ์อนุมัติรายการที่ถูกโอน และ B เห็นรายการใน Approval Queue
- ถ้ามี Lead หลายคน ต้องอนุมัติครบทุกคน
- Approval ที่สำเร็จแล้วคง snapshot และประวัติเดิม
- ถ้า Project sequence เสร็จแล้ว การเปลี่ยน Lead ไม่ย้อนกลับมาเปิด workflow

Reason:

- ผู้มีอำนาจอนุมัติต้องสอดคล้องกับผู้รับผิดชอบ Project จริงในเวลาที่กำลังอนุมัติ ขณะเดียวกัน audit history ที่เกิดแล้วต้องไม่ถูกเขียนทับ
