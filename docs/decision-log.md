# Decision Log: Asset Flow Management System

อัปเดตล่าสุด: 2026-07-22

## 2026-07-22: Rename to Asset Flow

Decision:

- ใช้ชื่อสั้น `Asset Flow`
- ใช้ชื่อเต็ม `Asset Flow Management System`
- เอกสารควรเลิกเรียกระบบด้วยชื่อเดิม

Reason:

- ระบบไม่ได้เป็นแค่ stock table แต่ครอบคลุม request, approval, borrow, using, sold, return, history และ document flow

Follow-up:

- UI บางจุดยังมีชื่อเดิม ต้องไล่เปลี่ยนให้ครบ

## 2026-07-22: Use Domain as Asset Grouping Unit

Decision:

- `domain` คือคำหลักสำหรับคลัง/กลุ่ม asset
- Server และ Network เป็น initial domains
- เอกสารและ logic ใหม่ต้องใช้คำว่า domain ให้สม่ำเสมอ

Reason:

- ในอนาคตอาจมี domain ของฝ่ายอื่น จึงต้องไม่จำกัด model ไว้แค่คลัง Server/Network ปัจจุบัน

Follow-up:

- ตรวจ helper ที่ยัง hardcode `SERVER`, `NETWORK`
- ตรวจ README/root docs ให้ใช้คำว่า domain ตรงกัน

## 2026-07-22: CSV Is Migration Input Only

Decision:

- CSV/SharePoint ใช้เป็น mock/bootstrap/migration input เท่านั้น
- PostgreSQL เป็น source of truth ถาวรหลัง migrate

Reason:

- ระบบยืม-คืนเวอร์ชันใหม่ต้องมี transaction, approval, status history และ audit trail ที่เชื่อถือได้

Follow-up:

- เพิ่ม import verification report
- ห้าม runtime กลับไปอ่าน CSV เป็นข้อมูลหลัก

## 2026-07-22: Role Model Has 3 System Roles

Decision:

- System roles มี 3 แบบ: `ADMIN`, `STOCK_CONTROLLER`, `USER`
- รายละเอียดองค์กรและ project ใช้ tag/context แทนการเพิ่ม role ใหม่

Reason:

- ลดความซับซ้อนของ permission model
- ให้คนเดียวมีหลาย context ได้ เช่น manager ที่เป็น lead project ด้วย

Follow-up:

- UI ต้องแสดง tag ให้ชัดว่าเป็น organization tag, project tag หรือ stock controller tag

## 2026-07-22: Stock Controller Has Domain and Level Tags

Decision:

- Stock Controller ใช้ `stockControllerTag`
- Tag ปัจจุบันคือ `STOCK_CONTROLLER` และ `HEAD_STOCK_CONTROLLER`
- Approval ต้องสร้าง step ตาม domain ของ item ใน transaction

Reason:

- Request เดียวอาจมีหลาย domain จึงต้องให้ controller ของทุก domain approve

Follow-up:

- ตรวจ edge case ไม่มี controller ใน domain
- ตรวจหลาย controller ใน domain เดียวว่าต้องการ approve หนึ่งคนหรือทุกคน

## 2026-07-22: Approval Workflow Is Now Active

Decision:

- Submit transaction ต้องสร้าง approval flow และเริ่มที่ `workflowStatus = PENDING`
- Asset final status เปลี่ยนหลัง approve ครบเท่านั้น
- Reject ต้อง release lock/reservation
- Requester edit pending request ได้ก่อนมี approver approve

Implementation:

- มี `TransactionApproval` ใช้งานจริง
- มี approve/reject endpoints
- มี approval step generation สำหรับ business/project/stock/head stock/BSD

Open point:

- ระบบจริงตอนนี้มี `BSD_MANAGER` ใน chain ของ request ทุกประเภท
- ถ้าต้องการให้ `BORROW`/`USING` จบที่ `BSD_STAFF` ต้องปรับ rule เพิ่ม

## 2026-07-22: Requisition No. Format

Decision:

- ใช้ `REQ-YYYYMMDD-XX`
- `XX` reset รายเดือน

Reason:

- อ่านง่าย อิงวันที่สร้างคำขอ และควบคุม running number ต่อเดือนได้

Follow-up:

- เพิ่ม test concurrency และ month boundary

## 2026-07-22: Quantity Asset Support

Decision:

- Asset ต้องรองรับทั้ง `SERIAL` และ `QUANTITY`
- QUANTITY request ต้องระบุจำนวนและ reserve availability

Implementation:

- มี `AssetReservation`
- มี `TransactionItem.requestedQuantity`
- Inventory/request cart รองรับ quantity แล้ว

Follow-up:

- เพิ่ม test partial return/sold และ over-request
- ตรวจ type creation ให้กำหนด track method ได้ชัดเจน

## 2026-07-22: BSD Handles Sold Price

Decision:

- ราคาขายควรถูกกรอกโดย BSD ไม่ใช่ requester

Implementation:

- SOLD approval ที่ `BSD_STAFF` บังคับกรอก sold price
- Sold price ถูกเก็บใน transaction/item

Follow-up:

- ยืนยัน policy การแก้ไขราคาหลัง approve
- ปรับ PDF/report ให้แสดงราคาตาม template จริง

## 2026-07-22: Return Flow Is Partial

Decision:

- Return/close outcome target ต้องรองรับ Ready, Sold, Fail, Lost, Need Check
- การคืน/ขาย/พัง/หายควรผ่าน approval ตาม business rule และจบด้วย BSD

Implementation:

- Return หลัง approve ครบใช้งานได้
- Return to `READY` apply ทันที
- Return to `SOLD` สร้าง SOLD approval transaction ใหม่

Open point:

- ยังไม่รองรับ outcome `FAIL`, `LOST`, `NEED_CHECK` ใน return UI/API
- ต้องยืนยันว่าจะให้ return-to-ready ผ่าน BSD ด้วยหรือไม่

## 2026-07-22: Project Page Exists but Is Not Persistent

Decision:

- มีหน้า Project เพื่อเตรียม UX แล้ว
- ยังไม่ถือเป็น feature สมบูรณ์จนกว่าจะต่อ DB/API

Risk:

- Migration มี `projects`/`project_members` แต่ `schema.prisma` ปัจจุบันยังไม่มี model ตรงกัน

Follow-up:

- Reconcile Prisma schema กับ migration
- ต่อ Project API และ transaction relation

## 2026-07-22: Asset Detail PDF Is Pending

Decision:

- Asset detail ต้องแสดงข้อมูลทั้งหมด, status history และ export PDF ได้

Implementation:

- Asset detail page แสดงข้อมูลและ history แล้ว

Follow-up:

- ต่อ asset detail PDF endpoint/button
- ตรวจ fields ให้ครบตาม requirement
