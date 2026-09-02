# Task Plan: Warehouse Management

อัปเดตล่าสุด: 2026-09-02

Legend:

- `[x]` ทำแล้วหรือใช้งานได้เป็นหลัก
- `[~]` ทำบางส่วนหรือต้องตรวจ production
- `[ ]` ยังไม่ทำ

## 1. Naming and Documentation

- [x] ใช้ชื่อ Warehouse Management
- [x] เปลี่ยน runtime code, schema และ API จาก Domain เป็น Warehouse
- [x] อัปเดตเอกสารหลักให้ใช้ Warehouse; คง Inventory สำหรับหน้ารายการ asset
- [~] ตรวจ branding ชื่อระบบใน UI และ metadata ทุกจุด

## 2. Data and Migration

- [x] กำหนด CSV/SharePoint เป็น import input เท่านั้น
- [x] Runtime ใช้ PostgreSQL เป็น source of truth
- [x] มี migration rename Domain table/column/index เป็น Warehouse
- [x] มี import batch/row model สำหรับ audit การย้ายข้อมูล
- [ ] สำรองข้อมูลและ deploy migration `20260902090000_warehouse_and_transaction_status_cleanup` กับฐานข้อมูลจริง
- [ ] สร้าง import verification report: row count, duplicate, missing serial/type และ rows ที่ต้องตรวจ
- [ ] วางแผนแก้ stock code เดิมที่ไม่ตรง `XX-YYY0000` โดยไม่เปลี่ยน identifier อย่างไม่ควบคุม

## 3. Roles, Users and Profile

- [x] System role เหลือ `ADMIN`, `STOCK_CONTROLLER`, `USER`
- [x] รองรับ Organization Level/Tag ค่าเดียว, Project Tag และ Stock Controller Tag ในระบบปัจจุบัน
- [x] User Management รองรับ Warehouse view/manage permission
- [x] Profile/Settings รองรับลายเซ็น
- [x] Approval บังคับลายเซ็นและเก็บ signature snapshot
- [ ] เพิ่ม tests สำหรับ User ที่ไม่มี Warehouse, หลาย Warehouse และหลาย organizational/project context
- [ ] เพิ่ม `UserOrganizationAssignment` เพื่อรองรับหลายตำแหน่งต่อ User
- [ ] ทำ migration จาก `users.organizationLevel/organizationTag` ไป assignments โดยคง primary assignment
- [ ] ปรับ User Management ให้เพิ่ม/แก้ไข/ปิดหลาย assignments และเลือกตำแหน่งหลัก
- [ ] ปรับ Session/CurrentUser ให้ส่ง active assignments ทั้งหมด
- [ ] เพิ่ม Organization Tags ตามแผนผังใหม่: Executive, Solution Consult, Customer Service, Delivery & Client และ BSD

## 4. Warehouse and Master Data

- [x] มี `AssetWarehouse` และ Dynamic Warehouse Inventory
- [x] Admin สร้าง/แก้ไข/ลบ Warehouse ตามเงื่อนไขได้
- [x] Warehouse prefix แก้ไม่ได้หลังสร้าง
- [x] ป้องกันลบ Warehouse ที่มี active asset
- [x] กำหนด Head Stock Controller ราย Warehouse
- [x] Admin/Stock Controller จัดการ Category และ Type ตาม permission
- [x] รองรับ custom fields ตาม Category
- [ ] เพิ่ม permission tests สำหรับ Category/Type และ dependency guard เมื่อ Type ถูกใช้งาน

## 5. Inventory and Asset

- [x] รองรับ Serial และ Quantity
- [x] Inventory มี search, pagination, sort และ Brand/Category/Type/Status filter
- [x] แสดง availability/reservation สำหรับ Quantity
- [x] Asset create/edit/detail และ status history
- [x] Asset Status มี Ready, Request, Borrow, Using, Sold, Fail, Lost, Need Check
- [~] ตรวจ Asset Detail ว่าแสดงทุก field จากข้อมูลจริงและทุก Custom Field
- [ ] เชื่อม Asset Detail Export PDF เข้าหน้าจอและ endpoint
- [ ] ทบทวน administrative delete/soft-delete ให้สอดคล้องกับกฎไม่ลบ asset จาก business flow

## 6. Request Cart and Quantity

- [x] Serial draft request lock เป็น `REQUEST`
- [x] Quantity draft request reserve ตามจำนวน
- [x] รองรับหลาย item และหลาย Warehouse
- [x] Submit ย้าย Quantity reservation ไป Transaction Item
- [x] ตรวจ availability ก่อน submit/edit
- [ ] เพิ่ม tests สำหรับ over-request, edit quantity, reject release และ concurrent request

## 7. Request No. and Stock Code

- [x] Request No. ใช้ `REQ-YYYYMMDD-XX`
- [x] Sequence reset รายเดือนและจำกัด 99 รายการ
- [x] มี tests รูปแบบและ month boundary
- [x] Stock Code ใหม่ใช้ `XX-YY-ZZZ0000`
- [ ] เพิ่ม concurrency test สำหรับ Request No.

## 8. Approval Workflow

- [x] Submit สร้าง Transaction Approval และเริ่ม `PENDING`
- [x] รองรับ Organization และ Project approver
- [x] สร้าง Stock Controller step ทุก Warehouse
- [x] สร้าง Head Stock Controller step ทุก Warehouse
- [x] เพิ่ม `BSD_STAFF` และ `BSD_MANAGER` ให้ Borrow, Using, Sold และ Return
- [x] Approval หลาย Warehouse ใน sequence เดียวกันทำแบบ parallel
- [x] Approver ตรวจ current sequence, assigned user/tag และ signature
- [x] Reject พร้อมเหตุผลและ release normal request lock/reservation
- [x] แก้ PENDING/REJECTED request ได้ก่อนมี approval สำเร็จ
- [ ] เพิ่ม focused tests ครบทุก organization/project route และ multi-Warehouse chain
- [ ] ปรับ approval routing ให้เลือก request context จากหลาย assignments
- [ ] เพิ่ม auto-approve สำหรับ User คนเดียวที่ถือหลาย sequence พร้อม audit history แยก
- [ ] เพิ่ม tests เช่น กรณี DL Manager/DL Supervisor เป็นคนเดียวกัน, ไม่มี Supervisor และ assignment ถูกปิด
- [ ] เพิ่ม notification/indicator สำหรับงานอนุมัติค้าง
- [ ] เพิ่ม Cancel Request endpoint และ UX

## 9. Transaction Status Cleanup

- [x] Borrow ใช้ `BORROWED/RETURNED`
- [x] Using ใช้ `USING/RETURNED`
- [x] Sold ใช้ `COMPLETED`
- [x] Workflow ใช้ `PENDING/IN_PROGRESS/REJECTED/COMPLETED`
- [x] ลบ Overdue, Active และ workflow Approved จาก runtime enum/logic/UI
- [x] คง due/return date เป็นข้อมูลโดยไม่คำนวณ Overdue
- [~] ตรวจ legacy rows หลัง deploy migration ว่าถูก map เป็นสถานะใหม่ครบ

## 10. Sold Price

- [x] BSD Staff เป็นผู้กรอกราคา Sold
- [x] เก็บราคาที่ Transaction/Item
- [x] Return-to-sold ใช้ Derived Sold Approval Transaction
- [~] ตรวจ PDF/Report กับข้อมูลหลาย item และ Quantity
- [ ] สรุป policy การแก้ไขราคาหลัง approval

## 11. Return and Close

- [x] Return ใช้ได้เมื่อ Source Transaction เป็น `IN_PROGRESS`
- [x] Requester/Admin คืนราย item หรือทั้งรายการ
- [x] Return-to-ready สร้าง Derived Return Transaction แทนการ apply ทันที
- [x] Return-to-sold สร้าง Derived Sold Transaction
- [x] Derived transaction ผ่าน Controller ทุก Warehouse, BSD Staff และ BSD Manager
- [x] ป้องกัน pending derived transaction ซ้ำ
- [x] Source Transaction complete เมื่อ resolve ครบ
- [ ] เพิ่ม outcome `FAIL`, `LOST`, `NEED_CHECK` ใน Return UI/API/approval
- [ ] เพิ่ม auto remark สำหรับ Fail/Lost ที่อ้าง Source Request No.
- [ ] เพิ่ม tests partial return, multi-item, Quantity return, rejection และ duplicate prevention

## 12. Transaction Log and PDF

- [x] Log แสดงข้อมูลทุกคนทุก Project
- [x] มี scope/status/search และ Approval Queue
- [x] แสดง Request/Return Date และ Source Transaction reference
- [x] Transaction PDF และ approval/signature snapshot
- [~] เพิ่ม filter เฉพาะทาง เช่น Warehouse, Project, requester และ date range หาก UX ต้องการมากกว่าช่องค้นหา
- [~] ปรับ official Borrow/Return/Sold document เมื่อได้ template
- [ ] เชื่อม Asset Detail PDF

## 13. Project

- [x] มี Prisma model และ PostgreSQL persistence
- [x] มี Project page และ API
- [x] รองรับ Project ID, status, Lead Project และ Team Members
- [x] Admin สร้าง Project
- [x] Admin/Lead ที่เกี่ยวข้องแก้ไขหรือลบ Project
- [x] Transaction เชื่อม Project และ approval ใช้ Project membership
- [ ] เพิ่ม tests permission, closed project และ membership change ระหว่างมี transaction
- [ ] Sync pending Project Approval ทันทีเมื่อเพิ่ม/ถอด/เปลี่ยน Lead Project
- [ ] ทำให้ Project approval sequence รอ Lead ที่ active ครบทุกคน
- [ ] ตัดสิทธิ์ Lead เดิมและอัปเดต Approval Queue ของ Lead ใหม่แบบ atomic
- [ ] เพิ่ม Project Lead Change History หรือ audit event
- [ ] เพิ่ม tests สำหรับ A -> B reassignment, multiple leads, partially approved sequence และ completed sequence

## 14. Quality

- [x] Prisma format/generate/validate ผ่านหลังแก้ Warehouse/status
- [x] Typecheck และ lint ผ่าน
- [x] Unit tests ปัจจุบันผ่าน 40 tests
- [ ] เพิ่ม integration tests สำหรับ approval และ derived return
- [ ] ทดสอบ migration กับสำเนาฐานข้อมูลก่อน production
- [ ] ตรวจ UI end-to-end หลัง deploy schema ใหม่
