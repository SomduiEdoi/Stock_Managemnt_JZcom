# Task Plan: Warehouse Management

อัปเดตล่าสุด: 2026-09-07

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
- [x] กำหนด policy stock code เดิม: ตรวจสอบก่อนแก้, ใช้ mapping/audit, ห้ามเปลี่ยนอัตโนมัติเมื่อมี transaction อ้างอิง และต้องคงความ unique

## 3. Roles, Users and Profile

- [x] System role เหลือ `ADMIN`, `STOCK_CONTROLLER`, `USER`
- [x] รองรับ Organization Level/Tag primary, Project Tag และ Stock Controller Tag ในระบบปัจจุบัน
- [x] User Management รองรับ Warehouse view/manage permission
- [x] Profile/Settings รองรับลายเซ็น
- [x] Approval บังคับลายเซ็นและเก็บ signature snapshot
- [ ] เพิ่ม tests สำหรับ User ที่ไม่มี Warehouse, หลาย Warehouse และหลาย organizational/project context
- [x] เพิ่ม `UserOrganizationAssignment` เพื่อรองรับหลายตำแหน่งต่อ User
- [x] ทำ migration จาก `users.organizationLevel/organizationTag` ไป assignments โดยคง primary assignment
- [x] ปรับ User Management ให้เพิ่ม/แก้ไขหลาย assignments และเลือก Primary Assignment ได้อย่างชัดเจน
- [x] ปรับ Session/CurrentUser ให้ส่ง active assignments ทั้งหมด
- [x] เพิ่ม Organization Tags ตามแผนผังใหม่: Executive, Solution Consult, Customer Service, Delivery & Client และ BSD
- [x] Seed account จาก organization chart โดยรวมคนชื่อซ้ำเป็น user เดียวและเก็บหลาย assignments

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
- [x] ปรับ approval routing ให้เลือก request context จากหลาย assignments
- [~] เพิ่ม auto-approve สำหรับ User คนเดียวที่ถือหลาย sequence พร้อม audit history แยก; ยังขาด focused/integration tests
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
- [x] Requester เดิมเท่านั้นที่คืนราย item หรือทั้งรายการได้
- [x] Return-to-ready สร้าง Derived Return Transaction แทนการ apply ทันที
- [x] Return-to-sold สร้าง Derived Sold Transaction
- [x] Derived transaction ผ่าน Controller ทุก Warehouse, BSD Staff และ BSD Manager
- [x] ป้องกัน pending derived transaction ซ้ำ
- [x] Source Transaction complete เมื่อ resolve ครบ
- [~] เพิ่ม outcome `FAIL`, `LOST`, `NEED_CHECK` ใน Return UI/API/approval; มี UI/API และ derived approval แล้ว แต่ยังต้องทดสอบ end-to-end
- [~] เพิ่ม auto remark สำหรับ Fail/Lost ที่อ้าง Source Request No.; มี status history/remark แล้ว แต่ควรตรวจข้อความใน PDF และทุกกรณี partial quantity
- [~] เพิ่ม tests partial return, multi-item, Quantity return, rejection และ duplicate prevention

## 12. Transaction Log and PDF

- [x] Log แสดงข้อมูลทุกคนทุก Project
- [x] มี scope/status/search และ Approval Queue
- [x] แสดง Request/Return Date และ Source Transaction reference
- [x] Transaction PDF และ approval/signature snapshot
- [~] เพิ่ม filter เฉพาะทาง เช่น Warehouse, Project, requester และ date range หาก UX ต้องการมากกว่าช่องค้นหา
- [~] ปรับ official Borrow/Return/Sold document เมื่อได้ template

## 13. Project

- [x] มี Prisma model และ PostgreSQL persistence
- [x] มี Project page และ API
- [x] รองรับ Project ID, status, Lead Project และ Team Members
- [x] Admin สร้าง Project
- [x] Admin/Lead ที่เกี่ยวข้องแก้ไขหรือลบ Project
- [x] Transaction เชื่อม Project และ approval ใช้ Project membership
- [ ] เพิ่ม tests permission, closed project และ membership change ระหว่างมี transaction
- [x] Sync pending Project Approval ทันทีเมื่อเพิ่ม/ถอด/เปลี่ยน Lead Project
- [x] ทำให้ Project approval sequence รอ Lead ที่ active ครบทุกคน
- [x] ตัดสิทธิ์ Lead เดิมและอัปเดต Approval Queue ของ Lead ใหม่แบบ atomic
- [x] เพิ่ม Project Lead Change History หรือ audit event
- [ ] เพิ่ม tests สำหรับ A -> B reassignment, multiple leads, partially approved sequence และ completed sequence

## 14. Quality

- [x] Prisma format/generate/validate ผ่านหลังแก้ Warehouse/status
- [x] Typecheck และ lint ผ่าน
- [x] Unit tests ปัจจุบันผ่าน 40 tests
- [ ] เพิ่ม integration tests สำหรับ approval, Project reassignment และ derived return
- [ ] ทดสอบ migration กับสำเนาฐานข้อมูลก่อน production
- [ ] ตรวจ UI end-to-end หลัง deploy schema ใหม่

## 2026-09-07 Status Audit

- [x] Project Lead reassignment: sync pending approvals, revoke previous Lead access, support multiple active Leads, and record Lead change history
- [~] Approval auto-approve สำหรับผู้ใช้คนเดียวหลาย sequence: runtime logic มีแล้ว แต่ยังขาด focused/integration tests
- [~] Return outcome `FAIL`, `LOST`, `NEED_CHECK` และ Quantity split: UI/API/derived approval มีแล้ว แต่ยังต้องทดสอบ end-to-end กับ partial return, rejection และ duplicate prevention
- [ ] ยังต้องทำ integration tests ของ approval/project reassignment/derived return และตรวจ migration กับฐานข้อมูลสำเนาก่อน production

## 2026-09-03 Custom Specification Data Model

- [x] เพิ่ม `assets.specifications` เป็น JSONB สำหรับเก็บ raw/custom specification data ของทุก warehouse
- [x] ขยาย `asset_custom_field_values` ให้รองรับ typed values: text, number, boolean และ json
- [x] ขยาย `asset_category_custom_fields` ให้ผูก custom field กับ type ได้ผ่าน `asset_type_id`
- [x] เพิ่ม GIN index สำหรับ `assets.specifications` เพื่อรองรับการค้นหา/ขยาย query ในอนาคต
- [x] Create/Edit Asset บันทึก custom fields เป็น specification snapshot พร้อม custom field values
- [x] Category API รองรับ custom field data type: TEXT, NUMBER, DROPDOWN, BOOLEAN
- [x] เพิ่ม limit custom fields ต่อ category เป็น 20 fields
- [x] Ran `npx.cmd prisma format`, `npx.cmd prisma generate --no-engine`, `npm.cmd run typecheck`, and `npm.cmd run lint` successfully.

## 2026-09-03 Sale Stock Preparation

- [x] เพิ่ม `asset_categories.category_code` สำหรับ category prefix 2 ตัว เพื่อรองรับ stock code แบบ `XX-YY-ZZZ0000`
- [x] เพิ่ม unique constraint ของ category prefix ต่อ warehouse และล็อกไม่ให้แก้ prefix หลังสร้าง
- [x] ปรับ stock code generator ของ Asset Create ให้ใช้ warehouse/category/type prefix เช่น `SS-CB-HDM0001`
- [x] ปรับ import utility ให้พร้อมสร้าง stock code format ใหม่และรองรับ category/type prefix ของ `SALE_STOCK`
- [x] เพิ่ม seed warehouse `SALE_STOCK` prefix `SS` เป็น quantity warehouse
- [x] เพิ่ม seed taxonomy ของ Sale Stock ตาม master prefix ที่ผู้ใช้ส่ง: Power, Storage, Memory, Computer, Cables, Adapter & Converter, Accessories
- [x] เพิ่ม Joy เป็น Stock Controller ของ Sale Stock ใน seed และ assign `bsd@example.com` ให้ manage `SALE_STOCK` ในฐาน dev ปัจจุบัน
- [x] Import Sale Stock จาก Excel `Stock Hardware BSD (update 3_09_26).xlsx` เฉพาะ sheet category แยกแล้ว
- [x] ยืนยัน import ใช้เฉพาะ sheet `Power`, `Cables`, `Adapter & Converter`, `Memory`, `Storage`, `Computer`, `Accessories` โดยไม่ใช้ sheet รวม `Stock for sale (02.09.26)` หรือ `Sheet1`
- [x] ปรับ import metadata ให้ `rowNumber` อ้างอิงเลขแถวจริงในแต่ละ sheet แยก
- [x] Hard delete warehouse/data `BSD` เดิมออกจากระบบแล้ว
- [x] Imported 71 Sale Stock assets: 63 READY, 8 NEED_CHECK
- [x] บันทึก custom specification ทั้ง `assets.specifications` และ `asset_custom_field_values`
- [x] ปรับ Sale Stock import ให้ชีต `Accessories` ใช้ custom specification เฉพาะ column `Specification` และไม่เก็บค่า `-` เป็น specification
- [x] ปรับ UI asset add/edit และ asset detail ให้ custom specification ต่อจากข้อมูลหลักโดยไม่แยก section `Custom Fields`
- [x] ปรับ `Part No.` และ `Serial No.` ให้ไม่บังคับกรอก โดยยัง validate format เมื่อมีการกรอกข้อมูล
