# Docs: Warehouse Management

อัปเดตล่าสุด: 2026-09-04

เอกสารชุดนี้อธิบาย requirement, การออกแบบ, กฎธุรกิจ และสถานะ implementation ของ Warehouse Management โดยยึดโค้ดและ Prisma schema ปัจจุบันเป็น baseline

## Files

- `prd.md`: ขอบเขตผลิตภัณฑ์, workflow และ acceptance criteria
- `design.md`: สถาปัตยกรรม, data model, API และการออกแบบเชิงเทคนิค
- `rule.md`: กฎธุรกิจและข้อกำหนดที่ implementation ต้องรักษา
- `decision-log.md`: ข้อตกลงสำคัญและเหตุผลของการตัดสินใจ
- `task.md`: งานที่ทำแล้ว งานบางส่วน และงานที่ยังเหลือ

## Current System Summary

- ชื่อระบบคือ Warehouse Management
- PostgreSQL เป็น source of truth หลังนำเข้าข้อมูลจาก CSV; runtime ไม่กลับไปอ่าน CSV หรือ SharePoint
- System role มี `ADMIN`, `STOCK_CONTROLLER`, `USER`
- Target organization model รองรับหลาย Organization Assignments ต่อ User เช่น Manager และ Supervisor เป็นคนเดียวกัน
- ใช้ `Warehouse` เป็นหน่วยจัดกลุ่มคลังใน code, schema, API และเอกสาร ส่วน `Inventory` ยังใช้เรียกหน้ารายการ asset
- Warehouse เริ่มต้นคือ Server และ Network และสามารถเพิ่ม Warehouse ใหม่จากข้อมูลในฐานข้อมูล
- รองรับ asset แบบ `SERIAL` และ `QUANTITY`, request cart, reservation และคำขอหลาย Warehouse
- Approval chain รองรับ Organization/Project, Stock Controller และ Head Stock Controller ของทุก Warehouse ตามด้วย `BSD_STAFF` และ `BSD_MANAGER`
- ทุก action ประเภท Borrow, Using, Sold และ Return ต้องผ่าน `BSD_STAFF` และ `BSD_MANAGER`
- Return เป็น approval transaction แยกก่อนคืน asset เป็น `READY`; Return-to-sold ใช้ SOLD approval transaction
- Project Management เชื่อม PostgreSQL/Prisma แล้ว
- Target Project workflow โอน pending approval ไป Lead คนใหม่ทันที และ Project ที่มีหลาย Lead ต้องอนุมัติครบทุกคน
- ไม่มีสถานะหรือการคำนวณ Overdue; `dueDate` เป็นข้อมูลประกอบเท่านั้น

## Remaining Work

- เพิ่ม return outcome `FAIL`, `LOST`, `NEED_CHECK` เข้า return approval flow
- ปรับเอกสาร PDF ตาม official template เมื่อได้รับจากธุรกิจ
- เพิ่ม focused tests สำหรับ approval chain, quantity edge cases และ return derived transaction
- เพิ่ม schema/migration/UI/approval routing สำหรับหลาย Organization Assignments ต่อ User
- เพิ่ม dynamic Project Lead approval reassignment และ Project Lead change audit
- ตรวจและนำ migration เปลี่ยน Domain เป็น Warehouse ไปใช้กับฐานข้อมูลจริงอย่างควบคุม
