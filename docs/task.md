# Task Plan: Asset Flow Management System

อัปเดตล่าสุด: 2026-07-22

Legend:

- `[x]` ทำแล้วหรือใช้งานได้เป็นหลัก
- `[~]` ทำบางส่วน ต้องต่อให้ครบ
- `[ ]` ยังไม่ทำหรือควรกลับมาทำ

## 1. Product / Naming / Docs

- [x] เปลี่ยนชื่อระบบในเอกสารหลักเป็น Asset Flow / Asset Flow Management System
- [~] ไล่เปลี่ยนชื่อใน UI จากชื่อเดิมเป็น Asset Flow ให้ครบทุกจุด
- [x] ใช้คำว่า `domain` เป็นคำหลักของคลังในเอกสาร
- [~] ตรวจ root README และ docs ให้สะท้อนระบบจริงล่าสุดต่อเนื่อง

## 2. Data Migration / Source of Truth

- [x] กำหนดให้ CSV/SharePoint เป็น migration/bootstrap input เท่านั้น
- [x] Runtime ใช้ PostgreSQL เป็น source of truth
- [~] ตรวจ import script ให้รองรับข้อมูล Server/Network ปัจจุบันครบ
- [ ] เพิ่ม migration verification report หลัง import เช่น row count, duplicate, missing serial, missing type

## 3. Roles / Users / Profile

- [x] Role หลักเหลือ `ADMIN`, `STOCK_CONTROLLER`, `USER`
- [x] User Management เพิ่ม `StockControllerTag`
- [x] เอา tag field เดิมที่ไม่จำเป็นออกจาก User Management
- [x] Profile page ถูกปรับให้เรียบขึ้น
- [x] Signature upload ยังมีเพื่อรองรับเอกสาร
- [~] ตรวจ permission edge case ของ Stock Controller หลาย domain/ไม่มี domain
- [ ] สรุป UX สำหรับ user ที่มีหลายบริบทในอนาคต เช่น manager ที่เป็น lead project ด้วย

## 4. Domain / Category / Type

- [x] มี domain model และ dynamic domain page
- [x] Admin สร้าง domain ได้
- [x] Admin/Stock Controller จัดการ category/type ได้ตาม permission บางส่วน
- [~] เปลี่ยน helper/filter ที่ยัง hardcode `SERVER`, `NETWORK` ให้ data-driven
- [~] ตรวจ `AssetType.trackMethod` ตอนสร้าง/แก้ไข type ให้ตรง requirement SERIAL/QUANTITY
- [ ] เพิ่ม tests สำหรับ category/type permission และ type ที่มี asset ใช้งานอยู่

## 5. Inventory / Asset

- [x] เพิ่ม Brand filter ใน Inventory
- [x] Inventory table รองรับ sort หลักๆ
- [x] แสดง availability สำหรับ quantity asset
- [x] Asset detail แสดงข้อมูลหลักและ status history
- [~] Asset detail แสดง related transaction แล้ว แต่ควรตรวจ field ให้ครบตาม requirement "ข้อมูลทั้งหมด"
- [ ] Asset detail export PDF
- [ ] ตรวจว่า delete action ไม่ขัดกับ business rule ที่ไม่ควรลบ asset ใน flow ปกติ

## 6. Request Cart / Quantity

- [x] SERIAL asset request แล้ว lock เป็น `REQUEST`
- [x] QUANTITY asset request แล้ว reserve ตามจำนวน
- [x] Request modal มีช่องระบุ quantity
- [x] Request cart แสดง requested quantity
- [x] Submit transaction ส่ง item quantity เข้า backend
- [~] ตรวจ availability calculation กับ transaction ที่ partial return / sold-return ให้ครบทุกกรณี
- [ ] เพิ่ม tests สำหรับ over-request, release reservation, edit quantity ใน pending request

## 7. Requisition No.

- [x] ใช้รูปแบบ `REQ-YYYYMMDD-XX`
- [x] เลขท้าย reset รายเดือน
- [x] มี limit ต่อเดือนและ error ถ้าเกิน
- [ ] เพิ่ม test สำหรับ sequence ข้ามเดือนและ concurrency

## 8. Approval Workflow

- [x] มี `TransactionApproval` ใช้งานจริง
- [x] Submit transaction สร้าง approval steps
- [x] Transaction เริ่มที่ `workflowStatus = PENDING`
- [x] Asset/quantity ยังถูก lock/reserve ระหว่างรอ approval
- [x] Approval ตรวจ current step และ user/tag/domain
- [x] Multi-domain request สร้าง Stock Controller approval ทุก domain
- [x] เพิ่มขั้น `STOCK_CONTROLLER`, `HEAD_STOCK_CONTROLLER`, `BSD_STAFF`, `BSD_MANAGER`
- [x] Reject request พร้อมเหตุผล
- [x] Reject release lock/reservation
- [x] Requester แก้ไข pending request ได้ถ้ายังไม่มีใคร approve
- [~] ยืนยัน business rule ว่า `BORROW`/`USING` ต้องผ่าน `BSD_MANAGER` ด้วยหรือจบที่ `BSD_STAFF`
- [ ] เพิ่ม cancel request endpoint/UX
- [ ] เพิ่ม notification/indicator ให้ approver รู้ว่ามีงานค้าง
- [ ] เพิ่ม tests approval chain ครบทุก role/tag

## 9. Sold Price

- [x] SOLD approval ที่ `BSD_STAFF` บังคับกรอกราคา
- [x] เก็บ sold price ลง transaction/item
- [~] Return-to-sold สร้าง SOLD approval transaction แล้ว
- [ ] ตรวจรูปแบบเอกสาร/รายงานที่ต้องแสดงราคาขาย
- [ ] ยืนยันว่าราคาขายแก้ได้ตอนไหนและโดยใคร

## 10. Return / Close

- [x] Transaction Log เพิ่ม Return Date
- [x] Return ทำได้หลัง request approval ครบและ transaction เป็น `IN_PROGRESS`
- [x] Return ราย item เป็น `READY` ได้
- [x] Return outcome เป็น `SOLD` ได้ผ่าน SOLD approval transaction
- [~] Full return approval สำหรับคืน/ขาย/พัง/หาย ยังไม่ครบตาม target
- [~] Outcome `FAIL`, `LOST`, `NEED_CHECK` ยังไม่ครบใน return UI/API
- [ ] เพิ่ม BSD approval สำหรับ return ทุกกรณีตาม business rule ล่าสุด
- [ ] เพิ่ม remark auto-generate สำหรับ fail/lost เช่น `Fail from REQ-...`
- [ ] เพิ่ม tests partial return, multi-item return, return-to-sold

## 11. Transaction Log / Report / PDF

- [x] Transaction History เป็น internal public view และใช้ filter แยกดู
- [x] มี Approve tab
- [x] มี Return Date
- [x] Transaction PDF endpoint มีแล้ว
- [~] Action column ยังควรปรับเป็น dropdown ถ้าต้องมีหลาย action
- [~] PDF format ยังรอ template สุดท้ายจากธุรกิจ
- [ ] Asset detail PDF
- [ ] เพิ่ม filters เพิ่มเติมตาม requirement เช่น project/domain/requester/status/date ถ้ายังไม่ครบ

## 12. Project

- [x] มีหน้า Project แล้ว
- [~] Project page ตอนนี้ยังเป็น local UI/mock data
- [~] Migration มี `projects`/`project_members` แต่ `schema.prisma` ยังไม่ตรง
- [ ] เพิ่ม Prisma model สำหรับ Project/ProjectMember ให้ตรง migration หรือทำ migration ใหม่ให้สะอาด
- [ ] เพิ่ม Project API และ persistence
- [ ] ผูก project กับ transaction จริง
- [ ] Lead Project จัดการ team member ใน project ของตัวเอง

## 13. Status Cleanup

- [ ] ลบหรือซ่อนร่องรอยสถานะเกินกำหนดคืนเก่าจาก schema/code/UI
- [ ] ตรวจ badge/filter/test ที่เคยอิงสถานะนี้
- [ ] คง `dueDate`/`returnDate` เป็นข้อมูลประกอบ transaction/report โดยไม่สร้าง status อัตโนมัติ

## 14. Quality / Tests

- [ ] Run lint/typecheck/test หลังแก้ workflow รอบใหญ่
- [ ] เพิ่ม test สำหรับ approval routing
- [ ] เพิ่ม test สำหรับ quantity reservation
- [ ] เพิ่ม test สำหรับ project schema consistency
- [ ] เพิ่ม regression test สำหรับ transaction no
- [ ] เพิ่ม regression test สำหรับ role/tag permission
