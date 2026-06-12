# Product Requirements Document (PRD)

## Project Name

Stock Management System

## Document Purpose

เอกสารนี้สรุปความเข้าใจล่าสุดของระบบ Stock Management System ในระดับ product requirement เพื่อให้ทีมใช้เป็น baseline เดียวกันก่อนออกแบบ schema, API, UI และ task implementation

## Product Overview

Stock Management System คือเว็บแอปสำหรับจัดการอุปกรณ์แบบ serialized asset โดยยึดหลัก 1 physical item = 1 asset record และติดตามด้วย serial no. เป็นหลัก ระบบนี้รองรับทั้งการดู stock, การ request อุปกรณ์, การ submit ธุรกรรมยืม/ใช้ภายใน/ขาย, การติดตามสถานะ asset, และการเก็บ transaction log เพื่อ audit ย้อนหลัง

ระบบไม่ได้เป็น stock quantity system แบบนับจำนวนรวม แต่เป็น asset-by-asset system ที่แต่ละชิ้นมีสถานะของตัวเอง และอาจถูกอ้างอิงอยู่ใน transaction หลายประเภทตาม workflow จริงของบริษัท

CSV export จาก SharePoint ใช้เป็น mockup/bootstrap data และเป็น one-time migration input เท่านั้น หลังจาก import สำเร็จ ข้อมูลทั้งหมดต้องถูกเก็บถาวรใน PostgreSQL และระบบเวอร์ชันใหม่ต้องอ่าน/เขียนข้อมูลจาก PostgreSQL โดยตรง ไม่กลับไปอ่าน SharePoint หรือไฟล์ CSV ใน runtime ปกติ

## Current Situation

- ข้อมูลอุปกรณ์เดิมอยู่บน SharePoint และต้อง migrate เข้าระบบใหม่
- ไฟล์ CSV ใช้เพื่อย้ายข้อมูลตั้งต้นเข้าฐานข้อมูลเท่านั้น ไม่ใช่ data source ถาวรของระบบใหม่
- อุปกรณ์แบ่งความรับผิดชอบหลักเป็น 2 domain คือ `Server` และ `Network`
- ผู้ใช้งานมีทั้ง admin, owner ของแต่ละ domain และ staff ทั่วไป
- การยืม/คืน/ขาย/เบิกใช้ยังมีเอกสารจริงในโลกงาน แต่ระบบต้องเก็บ operational state และ transaction history ให้ชัด

## Goals

- สร้างระบบจัดการ asset รายชิ้นด้วย serial no.
- แยกสิทธิ์การดูและจัดการตาม role และ domain
- รองรับการ login ด้วย Microsoft 365 account
- รองรับ staff request แบบหลายรายการใน transaction เดียว
- ป้องกันการ request ซ้ำโดยใช้ `REQUEST` เป็น asset status ชั่วคราว
- รองรับ workflow หลัก `BORROW`, `USING`, `SOLD`
- ติดตาม transaction status เช่น `BORROWED`, `RETURNED`, `OVERDUE`
- เก็บ asset status history และ transaction log สำหรับ audit
- migrate ข้อมูลจาก SharePoint/CSV เข้า PostgreSQL ให้เป็นแหล่งข้อมูลถาวรของระบบใหม่

## Non-Goals

สิ่งต่อไปนี้ยังไม่อยู่ในขอบเขต MVP:

- stock quantity model
- digital signature
- upload เอกสารจริงหรือไฟล์ PDF ที่เซ็นแล้ว
- approval workflow แบบหลายขั้น
- purchase order / accounting / invoice
- การอ่านข้อมูลจาก SharePoint หรือ CSV เป็น runtime data source หลัง migration
- export รายงาน Excel
- barcode / QR workflow

## Users and Roles

### Admin

- เห็นและจัดการทุก domain
- จัดการ users และ permissions ได้
- เปลี่ยนสถานะ asset ได้ทุก domain
- ดู dashboard, log, request, report ได้ทั้งหมด

### Server Owner

- จัดการ asset ใน domain `Server`
- ดู `Network` ได้แบบ read-only
- เปลี่ยนสถานะ asset ใน domain `Server`
- ดู log และ dashboard ได้

### Network Owner

- จัดการ asset ใน domain `Network`
- ดู `Server` ได้แบบ read-only
- เปลี่ยนสถานะ asset ใน domain `Network`
- ดู log และ dashboard ได้

### Staff

- ดู asset ได้ทั้ง `Server` และ `Network`
- request asset ได้
- สร้าง draft request แบบหลาย asset ต่อ transaction ได้
- submit transaction ได้โดยระบุว่าจะ `BORROW`, `USING` หรือ `SOLD`
- ไม่สามารถจัดการ master data หรือเปลี่ยนสถานะ asset โดยตรงนอก flow request

## Core Concepts

### Serialized Asset

- 1 asset record เท่ากับของจริง 1 ชิ้น
- ทุก asset ใน MVP ต้องมี `serial no.`
- `QTY` และ `FG` จาก SharePoint เป็น legacy/reference only

### Asset Status

สถานะปัจจุบันของ asset:

- `READY`: พร้อมใช้งาน อยู่ในคลัง
- `REQUEST`: มีคน request แล้ว แต่ยังไม่ submit transaction
- `BORROW`: ถูกยืมชั่วคราว
- `USING`: ถูกเบิกใช้ภายในระยะยาว
- `SOLD`: จำหน่ายแล้ว และเป็น terminal state
- `FAIL`: เสียหาย และอาจกลับไป `READY` ได้ถ้าซ่อมเสร็จ
- `LOST`: สูญหาย
- `NEED_CHECK`: ต้องตรวจสอบเพิ่ม

### Transaction

transaction คือเอกสารทางระบบที่รวม asset หลายชิ้นภายใต้เจตนาเดียวกัน เช่น ยืม, ใช้ภายใน, หรือขาย

transaction ต้องมีอย่างน้อย:

- requester
- purpose / note
- transaction type
- หลาย transaction items
- timestamps สำคัญ

### Transaction Type

- `BORROW`
- `USING`
- `SOLD`

### Transaction Status

- ถ้า `BORROW`: `BORROWED`, `RETURNED`, `OVERDUE`
- ถ้า `USING`: `ACTIVE`, `RETURNED`
- ถ้า `SOLD`: `COMPLETED`

## Workflow Summary

### Request and Submit

1. Staff เลือก asset จากหน้า Server หรือ Network
2. เมื่อ request แล้ว asset เปลี่ยนเป็น `REQUEST` ทันที
3. ระหว่างเป็น `REQUEST` คนอื่นยังเห็น asset ได้ แต่ request ซ้ำไม่ได้
4. Staff สามารถสะสมหลาย asset ไว้ใน request เดียวได้ แม้จะข้าม domain
5. ตอน submit staff ต้องระบุว่าจะ `BORROW`, `USING`, หรือ `SOLD`
6. หลัง submit ระบบสร้าง transaction และเปลี่ยน asset ทุกชิ้นไปเป็นสถานะปลายทางทันที

### Borrow

1. Staff submit transaction type `BORROW`
2. ระบบตั้ง `asset.status = BORROW`
3. transaction status เริ่มต้นเป็น `BORROWED`
4. ต้องมี `due_date`
5. เมื่อคืนของแล้ว transaction เปลี่ยนเป็น `RETURNED`
6. asset เปลี่ยนจาก `BORROW` กลับเป็น `READY`
7. หากเกิน `due_date` และยังไม่คืน ระบบเปลี่ยน transaction status เป็น `OVERDUE`

### Using

1. Staff submit transaction type `USING`
2. asset เปลี่ยนเป็น `USING`
3. transaction status เป็น `ACTIVE`
4. เมื่อคืนของหรือเลิกใช้งาน transaction เปลี่ยนเป็น `RETURNED`
5. asset เปลี่ยนกลับเป็น `READY`

### Sold

1. Staff submit transaction type `SOLD`
2. asset เปลี่ยนเป็น `SOLD`
3. transaction status เป็น `COMPLETED`
4. asset ยังอยู่ในระบบเพื่อ audit แต่ห้ามกลับไปใช้ workflow ปกติ

## Business Rules

- 1 physical item ต้องเป็น 1 asset record
- ทุก asset ต้องมี serial no. และ serial no. ต้องไม่ซ้ำ
- asset ที่อยู่สถานะ `REQUEST` ห้ามถูก request ซ้ำ
- asset ที่อยู่สถานะ `SOLD` ห้ามถูก borrow, using, request หรือเปลี่ยนกลับใน workflow ปกติ
- asset ที่อยู่สถานะ `FAIL`, `LOST`, `NEED_CHECK` ห้ามเข้าธุรกรรมใหม่จนกว่าจะถูก review
- asset จะไม่ถูกลบออกจากระบบเพราะเหตุผลทางธุรกิจ เช่น ขาย, เสียหาย, สูญหาย, ถูกยืม
- ทุกการเปลี่ยน asset status ต้องสร้าง `asset_status_history`
- transaction 1 รายการมีหลาย asset items ได้
- `OVERDUE` เป็น transaction status ไม่ใช่ asset status
- `REQUEST` เป็น asset status สำหรับ lock ของก่อน submit

## Pages and Key Requirements

### Dashboard

- KPI: `Total Assets`, `Ready`, `Borrow`, `Sold`
- Problem items: `Fail`, `Lost`, `Need Check`
- Activity feed ของ asset ใหม่และ status change ล่าสุด
- Recently table แยกกลุ่มตาม `Registered`, `Borrow`, `Using`, `Sold`
- เปรียบเทียบจำนวน asset ระหว่าง `Server` และ `Network`
- ข้อมูลต้องถูก scope ตามสิทธิ์ผู้ใช้

### Server Page

- dashboard ย่อยของอุปกรณ์ Server
- table แสดงอย่างน้อย: `Model`, `Brand`, `Category`, `Types`, `Serial No.`, `Status`
- quick search by category
- filter และ search
- Admin / Server Owner จัดการ add/edit ได้
- Staff และ Network Owner เห็นแบบ read-only
- ถ้า asset เป็น `REQUEST` ต้องแสดงสถานะนี้ในตาราง

### Network Page

- dashboard ย่อยของอุปกรณ์ Network
- table แสดงอย่างน้อย: `Model`, `Brand`, `Category`, `Types`, `Serial No.`, `Status`
- quick search by types
- filter และ search
- Admin / Network Owner จัดการ add/edit ได้
- Staff และ Server Owner เห็นแบบ read-only
- ถ้า asset เป็น `REQUEST` ต้องแสดงสถานะนี้ในตาราง

### Asset Detail Page

- แสดงข้อมูลทั้งหมดของอุปกรณ์ชิ้นนั้นจาก PostgreSQL
- แสดงข้อมูล asset name, model, brand, category, type, serial no., stock code, location, status, note, image/reference, asset description และข้อมูล legacy ที่จำเป็น เช่น `QTY` และ `FG`
- แสดง status history เฉพาะของอุปกรณ์ชิ้นนั้น โดยเรียงตามเวลาล่าสุดหรือ timeline
- แสดง transaction ที่เกี่ยวข้องกับอุปกรณ์ชิ้นนั้น ถ้ามี เช่น borrow, using, sold หรือ returned history
- สามารถ export ข้อมูลอุปกรณ์ชิ้นนั้นเป็น PDF ได้
- PDF ราย asset ต้องเป็นข้อมูลจาก PostgreSQL และไม่อ่าน CSV/SharePoint

### Log Page

log page เป็น transaction log เป็นหลัก ไม่ใช่แค่ asset history

- dashboard log: `All Requests`, `In Progress`, `Completed`
- table แสดงอย่างน้อย: `Transaction ID`, `Asset`, `Borrower/Requester`, `Borrow Date`, `Transaction Type`, `Transaction Status`
- transaction status ที่รองรับใน log ได้แก่ `BORROWED`, `RETURNED`, `OVERDUE`, `ACTIVE`, `COMPLETED`
- ใช้ filter และ search ได้

### Request Page

- Staff เห็น request list ของตัวเอง
- เปิด draft request ได้
- เพิ่ม/ลบ asset item ก่อน submit ได้
- submit transaction พร้อม purpose, type และ due date ถ้าจำเป็น
- PDF ใบยืม/คืนอยู่ใน backlog ระยะใกล้จบระบบ

### User Page

- เฉพาะ Admin
- dashboard user: `Total`, `Owner`, `Staff`, `Active`
- table แสดง `Name`, `Mail`, `Role`, `Position`, `Action`, `Last Login`
- block/unblock user ได้
- add/edit user ได้

## Authentication and Authorization

- ใช้ Microsoft 365 account สำหรับ login
- ระบบต้อง map account เข้ากับ role และ permission ภายใน
- API ทุกจุดที่แก้ข้อมูลต้องตรวจทั้ง role และ domain permission

## SharePoint Migration

- CSV export เป็น input สำหรับ migration ครั้งแรกหรือรอบ import ที่ admin สั่งเท่านั้น
- เมื่อ import สำเร็จ ข้อมูล asset, master data, migration rows และ status history ต้องถูกบันทึกลง PostgreSQL
- หลัง migration ระบบ dashboard, Server page, Network page, Log page, Request page และ API ทั้งหมดต้องคุยกับ PostgreSQL โดยตรง
- SharePoint และ CSV ไม่ใช่ runtime dependency ของระบบยืม-คืนเวอร์ชันใหม่
- source files คือ `src/data/Network.csv` และ `src/data/Server.csv`
- CSV มีบรรทัดแรกเป็น `ListSchema=...` ที่ต้อง skip
- import ต้อง map domain จากชื่อไฟล์
- `QTY` และ `FG` ใช้เก็บเป็น legacy/reference เท่านั้น
- import ต้องสร้าง asset, master data ที่จำเป็น, migration batch, migration rows และ initial asset status history

## Data Entities

PRD ระบุ entity หลักในระดับ product:

- User
- Role
- Domain Permission
- Asset Domain
- Asset Category
- Asset Model
- Location
- Asset
- Asset Status History
- Transaction
- Transaction Item
- Migration Batch
- Migration Row

## Success Metrics

- ผู้ใช้ login ด้วย Microsoft 365 ได้
- staff request และ submit transaction แบบหลาย asset ได้
- asset ที่ถูก request ถูก lock ไม่ให้คนอื่น request ซ้ำ
- asset สามารถถูกติดตามตาม serial no. ได้
- asset detail page แสดงข้อมูลทั้งหมดของอุปกรณ์, status history และ export PDF ราย asset ได้
- transaction log ดูย้อนหลังได้
- `OVERDUE` ทำงานอัตโนมัติสำหรับ borrow
- owner เห็นและจัดการเฉพาะ domain ของตัวเอง
- sold asset ยังอยู่ในระบบเพื่อ audit
- หลัง migration ระบบใช้งานจาก PostgreSQL ได้โดยไม่ต้องพึ่ง SharePoint หรือ CSV

## Acceptance Criteria for MVP

MVP ถือว่าใช้งานได้เมื่อ:

- login ด้วย Microsoft 365 ได้
- รองรับ role `Admin`, `Server Owner`, `Network Owner`, `Staff`
- staff สร้าง request และ submit transaction ได้
- asset เปลี่ยนเป็น `REQUEST` เมื่อถูกเลือกไว้ก่อน submit
- คนอื่น request asset ที่อยู่ `REQUEST` ซ้ำไม่ได้
- transaction 1 รายการมีหลาย asset items ได้
- borrow flow รองรับ `due_date`, `RETURNED`, `OVERDUE`
- using flow รองรับ `ACTIVE`, `RETURNED`
- sold flow รองรับ `COMPLETED`
- ทุก asset status change มี history
- asset detail page แสดงข้อมูลทั้งหมดของอุปกรณ์และ status history เฉพาะอุปกรณ์นั้น
- export PDF ข้อมูลอุปกรณ์รายชิ้นได้จาก asset detail page
- log page แสดง transaction ได้ตาม type/status
- import ข้อมูลจาก SharePoint ได้
- imported data ถูก persist ใน PostgreSQL และ runtime features ไม่อ่าน CSV/SharePoint อีก

## Open Questions

- จะมี approval step เพิ่มภายหลังหรือไม่
- format PDF ใบยืม/คืนจะมี field อะไรบ้างเมื่อเริ่มทำ
- using transaction ต้องรองรับ owner reassignment ใน MVP หรือหลัง MVP

## Future Enhancements

- generate PDF ใบยืม/คืนราย transaction
- approval workflow
- upload เอกสารจริงหรือไฟล์แนบ
- digital signature
- export Excel
- notifications สำหรับ overdue หรือ need check
- mobile-friendly stock check
