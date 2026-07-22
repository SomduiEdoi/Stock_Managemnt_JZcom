# Docs: Asset Flow Management System

อัปเดตล่าสุด: 2026-07-22

เอกสารชุดนี้อธิบายระบบ Asset Flow Management System ตาม requirement และสถานะ implementation ล่าสุด

## Files

- `prd.md`: requirement, workflow และ acceptance criteria
- `design.md`: design เชิงเทคนิค, schema mapping, API และ implementation status
- `task.md`: task plan แยกทำแล้ว/ทำบางส่วน/ยังไม่ทำ
- `rule.md`: business rules และ development rules ที่ต้องยึด
- `decision-log.md`: decision ที่ตกลงแล้วและ open point สำคัญ

## Current System Summary

- Source of truth หลัง migration คือ PostgreSQL
- CSV/SharePoint ใช้เป็น import/bootstrap data เท่านั้น
- Role หลักมี `ADMIN`, `STOCK_CONTROLLER`, `USER`
- ใช้ `domain` เป็นหน่วยหลักของคลัง เช่น Server, Network และ domain ในอนาคต
- Inventory รองรับ Brand filter และ quantity request แล้ว
- Request cart รองรับ SERIAL lock และ QUANTITY reservation
- Submit transaction สร้าง pending approval flow แล้ว
- Approval มีขั้น Business/Project, Stock Controller, Head Stock Controller, BSD Staff และ BSD Manager
- Reject และ edit pending request เริ่มใช้งานแล้ว
- Transaction Log มี Return Date และ Approval queue แล้ว
- Project page มี UI แล้ว แต่ยังไม่ persistent
- Asset Detail แสดงข้อมูลและ history แล้ว แต่ PDF export ยัง pending

## Important Open Points

- ยืนยันอีกครั้งว่า `BORROW`/`USING` ต้องผ่าน `BSD_MANAGER` ด้วยหรือจบที่ `BSD_STAFF`
- Return approval ยังไม่ครบทุก outcome
- Project schema/migration ยังไม่ตรงกับ Prisma schema ปัจจุบัน
- Dynamic domain ยังมีบางจุด hardcode `SERVER`, `NETWORK`
- ต้อง cleanup ร่องรอยสถานะเกินกำหนดคืนเก่าออกจาก schema/code/UI
- UI branding ยังต้องตรวจให้เป็น Asset Flow ครบทุกจุด
