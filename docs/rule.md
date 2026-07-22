# Rules: Asset Flow Management System

อัปเดตล่าสุด: 2026-07-22

## 1. Naming Rules

- ชื่อสั้นของระบบคือ Asset Flow
- ชื่อเต็มคือ Asset Flow Management System
- ใช้คำว่า `domain` สำหรับคลัง/กลุ่ม asset ทั้งหมด
- ใช้คำว่า domain ใน code/docs ใหม่ให้สม่ำเสมอ

## 2. Source of Truth Rules

- CSV/SharePoint ใช้เฉพาะ migration/bootstrap
- Runtime ต้องอ่าน/เขียน PostgreSQL เท่านั้น
- ห้ามแก้ flow ใหม่ให้กลับไปพึ่ง CSV หรือ SharePoint
- ทุก action สำคัญต้องมี audit trail ใน transaction/status/history ที่เกี่ยวข้อง

## 3. Asset Status Rules

- Asset ห้ามถูกลบจากระบบใน flow ปกติ
- `SOLD` เป็น terminal status
- `READY` เท่านั้นที่ request ได้เต็มรูปแบบ
- `REQUEST` หมายถึงถูก lock/reserve แล้ว คนอื่นเห็นได้แต่ request ซ้ำไม่ได้ในส่วนที่ไม่ available
- `BORROW` และ `USING` ต้องเกิดหลัง approval ครบ
- `FAIL`, `LOST`, `NEED_CHECK` ใช้สำหรับ outcome/ตรวจสอบ และต้องมี reason/history
- ทุก status change ต้องบันทึก `asset_status_history`

## 4. SERIAL / QUANTITY Rules

- `SERIAL` asset ต้องมี serial number และ track รายตัว
- `QUANTITY` asset track เป็นจำนวน ไม่ควรบังคับ serial number
- Request ของ `QUANTITY` ต้องระบุ `requestedQuantity`
- ห้าม request quantity เกิน available
- Availability ต้องคิดจาก total quantity, reservation และ open transaction
- Return quantity ต้องคืนจำนวนกลับเข้า available อย่างถูกต้อง

## 5. Transaction Status Rules

- `BORROW` ใช้ business status `BORROWED`, `RETURNED`
- `USING` ใช้ business status `ACTIVE`, `RETURNED`
- `SOLD` ใช้ business status `COMPLETED`
- `workflowStatus` ใช้แยก approval lifecycle: `PENDING`, `IN_PROGRESS`, `REJECTED`, `COMPLETED`
- Submit request ต้องสร้าง transaction ที่ `workflowStatus = PENDING`
- Asset final status ห้ามเปลี่ยนเป็น `BORROW`/`USING`/`SOLD` จนกว่า approve ครบ
- ระบบไม่มีสถานะเกินกำหนดคืนอัตโนมัติแล้ว

## 6. Requisition No. Rules

- Request/transaction ใช้เลขรูปแบบ `REQ-YYYYMMDD-XX`
- Sequence `XX` เป็นเลข 2 หลัก
- Sequence reset รายเดือน โดยนับจาก prefix `REQ-YYYYMM`
- ถ้าเลขรายเดือนเต็ม ต้อง error ชัดเจน

## 7. Approval Rules

- Approver approve/reject ได้เฉพาะ current step
- Approval step ต้องตรวจทั้ง user id, organization tag, project tag และ domain controller tag ตาม context
- `STAFF` ต้องส่งไป supervisor ของทีมตัวเอง
- `SUPERVISOR` ต้องส่งไป manager ของฝ่าย
- `MANAGER` และ `EXECUTIVE` ข้าม business tier ได้
- Project-bound request จาก `TEAM_MEMBER` ต้องผ่าน `LEAD_PROJECT`
- Multi-domain transaction ต้องผ่าน Stock Controller ทุก domain ที่เกี่ยวข้อง
- Stock Controller หลาย domain ใน step เดียวกัน approve แบบ parallel ได้
- หลัง `STOCK_CONTROLLER` ต้องมี `HEAD_STOCK_CONTROLLER`
- ระบบปัจจุบันมี `BSD_STAFF` และ `BSD_MANAGER` ใน chain
- Reject ต้องระบุ reason และต้อง release lock/reservation
- Requester แก้ไข pending request ได้เฉพาะตอนยังไม่มี approval ใดถูก approve

## 8. Sold Price Rules

- กรณี SOLD ต้องรองรับให้ BSD เป็นผู้กรอกราคา
- Implementation ปัจจุบันบังคับ sold price เมื่อ current approver เป็น `BSD_STAFF`
- Sold price ต้องถูกบันทึกใน transaction และ/หรือ transaction item
- เอกสารและ report ต้องอ่านราคาจาก PostgreSQL

## 9. Return Rules

- Return ทำได้เมื่อ transaction เป็น `IN_PROGRESS`
- Return ของ `BORROW`/`USING` ต้องเป็นราย transaction หรือราย item ได้
- Implementation ปัจจุบันรองรับ outcome `READY` และ `SOLD`
- Return to `READY` คืน asset/quantity และ update returned date
- Return to `SOLD` สร้าง SOLD approval transaction ใหม่
- Target ต้องรองรับ outcome `FAIL`, `LOST`, `NEED_CHECK`
- Target ต้องให้ return/ขาย/พัง/หายผ่าน BSD ตาม business rule

## 10. Log / Visibility Rules

- Transaction History เป็น internal public view
- User เห็น queue/request/approval/completed ของทุกคนและทุก project
- การแยกข้อมูลให้ใช้ filter ไม่ใช่ซ่อนข้อมูลเป็นหลัก
- Log ต้องแสดง request date, return date, requester/returner, status และ detail/action ที่เกี่ยวข้อง
- Request queue ต้องแสดง item ที่ยังถูก request/reserve อยู่

## 11. Project Rules

- `LEAD_PROJECT` และ `TEAM_MEMBER` เป็น project tag ที่ user ใดก็เป็นได้
- Project request ต้องผูก transaction กับ project จริงใน target
- สถานะปัจจุบันของ Project page ยังไม่ใช่ source of truth เพราะยังเป็น local UI/mock
- ก่อนใช้งานจริงต้องทำ `Project`/`ProjectMember` model และ API ให้ตรงกับ migration/ER

## 12. PDF Rules

- Transaction PDF มี endpoint แล้ว และควรรวม requisition no, item list, approval/signature และข้อมูล return/sold ที่จำเป็น
- Asset detail ต้อง export PDF ได้ใน target
- Official borrow/return document format ยังรอ template จากธุรกิจ
- ห้าม hardcode format สุดท้ายจนกว่าจะได้ template จริง

## 13. Dynamic Domain Rules

- ฟีเจอร์ใหม่ต้องออกแบบจาก domain ใน DB
- ห้ามเพิ่ม hardcode `SERVER`/`NETWORK` ใน helper กลาง
- Dedicated page สำหรับ Server/Network ทำได้เพื่อ UX แต่ logic กลางต้องรองรับ domain ใหม่
- Stock code ต้องใช้ domain prefix
- Permission และ approval ต้องใช้ domain code ของ asset item จริง

## 14. Code Maintenance Rules

- Prisma schema, migration และ docs ต้องไม่ขัดกัน
- ถ้าเพิ่ม enum/status ใหม่ ต้องอัปเดต badge, filter, log, PDF และ tests
- ถ้าเปลี่ยน workflow ต้องเพิ่ม/แก้ test ของ permission และ approval route
- ถ้าแก้ quantity logic ต้องเพิ่ม test สำหรับ over-request, partial return และ reservation release
