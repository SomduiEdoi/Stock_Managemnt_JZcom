# Product Requirements Document (PRD)

## Project Name

Stock Management System

## Document Purpose

เอกสารนี้อธิบายว่าเรากำลังสร้างระบบอะไร ทำไมต้องสร้าง ใครเป็นผู้ใช้งานหลัก ระบบต้องแก้ปัญหาอะไร และฟีเจอร์ใดบ้างที่ต้องมีในขอบเขต MVP

ระบบนี้ไม่ใช่ stock management แบบนับจำนวนสินค้า แต่เป็นระบบจัดการทรัพย์สินหรืออะไหล่แบบแยกรายชิ้น โดยของ 1 ชิ้นจะถูกระบุด้วย serial no. และมีสถานะของตัวเอง

## Product Overview

Stock Management System คือเว็บแอปสำหรับจัดการอุปกรณ์และอะไหล่ของบริษัทที่ปัจจุบันจัดการอยู่บน SharePoint ระบบใหม่จะช่วยให้ผู้ดูแล stock สามารถค้นหา ตรวจสอบ เพิ่มข้อมูล และเปลี่ยนสถานะของ item แต่ละชิ้นได้ง่ายขึ้น

สินค้าหรืออุปกรณ์ที่เหมือนกันหลายชิ้นจะไม่ถูกบันทึกเป็นจำนวนรวม เช่น ไม่เขียนว่า "HPE Fan For DL380 DL388 Gen9 มี 5 ตัว" แต่จะสร้าง asset แยก 5 records ตาม serial no. ของแต่ละชิ้นแทน เพื่อให้ติดตามประวัติของชิ้นนั้นได้ตลอดอายุการใช้งาน

เอกสารการเบิก ยืม คืน เช่า หรือขาย ยังคงเป็นเอกสารกระดาษที่เซ็นลายมือเหมือน workflow ปัจจุบัน ระบบจะเก็บเฉพาะ note หรือ reference ที่เกี่ยวข้องกับเอกสารนั้น ไม่ได้แทนที่เอกสารลายเซ็นใน MVP

## Current Situation

บริษัทใช้ SharePoint ในการจัดการข้อมูลคลังสินค้าและอุปกรณ์อยู่แล้ว โดยมีผู้ดูแลหลักดังนี้:

- P' Oak เป็น admin
- P' Arm ดูแล stock ที่เกี่ยวกับ Server
- P' Mek ดูแล stock ที่เกี่ยวกับ Network
- พนักงานคนอื่นเป็นผู้ใช้ทั่วไปหรือผู้ขอใช้อุปกรณ์

ข้อมูลเดิมจาก SharePoint ต้องถูก migrate เข้าระบบใหม่ เพื่อให้ระบบใหม่เริ่มต้นจากข้อมูลจริง ไม่ใช่เริ่มกรอกใหม่ทั้งหมด

## Problem Statement

การจัดการข้อมูลบน SharePoint มีข้อจำกัดเมื่อข้อมูลเริ่มเยอะและต้องติดตามสถานะของ item รายชิ้น:

- ค้นหาด้วย serial no. หรือสถานะได้ไม่สะดวกพอ
- ตรวจสอบประวัติของอุปกรณ์แต่ละชิ้นย้อนหลังได้ยาก
- เสี่ยงแก้ข้อมูลผิดหมวด เช่น Server กับ Network ปนกัน
- สถานะของ item อาจไม่เป็นมาตรฐานเดียวกัน
- การขาย ยืม คืน หรือใช้งานภายในต้องเก็บร่องรอยให้ชัดเจน
- ของที่ขายแล้วต้องยังอยู่ในระบบเพื่อ audit แต่ไม่ควรถูกนำกลับมาใช้ซ้ำ
- ข้อมูลเดิมใน SharePoint ต้องถูกย้ายมาโดยไม่ทำให้ข้อมูลสูญหาย

## Goals

- สร้างเว็บแอปสำหรับจัดการ asset แบบแยกราย serial no.
- ทำให้ P' Arm และ P' Mek จัดการ stock เฉพาะหมวดที่ตัวเองรับผิดชอบได้
- ทำให้ P' Oak เห็นและจัดการข้อมูลทั้งหมดได้
- รองรับการเพิ่ม item ใหม่เมื่อของเข้าบริษัท
- รองรับการเปลี่ยนสถานะ เช่น Ready, Borrow, Using, Sold, Fail, Lost, Need Check และ Wait
- เก็บประวัติการเปลี่ยนสถานะของ item แต่ละชิ้น
- เก็บ note หรือ reference ของเอกสารกระดาษที่เกี่ยวข้อง
- Migrate ข้อมูลจาก SharePoint เดิมเข้าระบบใหม่
- ลดความสับสนจากข้อมูลซ้ำหรือสถานะไม่มาตรฐาน

## Non-Goals

สิ่งต่อไปนี้ยังไม่อยู่ในขอบเขต MVP:

- ระบบนับจำนวน stock แบบ quantity
- ระบบ digital signature
- การ upload ไฟล์เอกสารลายเซ็น
- ระบบ purchase order
- ระบบบัญชีหรือ invoice
- ระบบจองของล่วงหน้าแบบ approval workflow
- ระบบ barcode scanner
- ระบบเชื่อมต่อ SharePoint แบบ sync real-time หลัง migration
- ระบบคิดต้นทุน FIFO หรือ average cost

## MVP Decisions

- ใช้ PostgreSQL เป็น database หลัก
- ใช้ TypeScript สำหรับ frontend และ backend
- ใช้ Next.js full-stack monolith เพื่อให้พัฒนา MVP ได้เร็ว
- ใช้ `assets.status` เป็น current state ของ asset แต่ละชิ้น
- ใช้ `asset_status_histories` เป็น audit trail ของการเปลี่ยนสถานะ
- ใช้ domain permission แยก Server และ Network
- ใช้ CSV/Excel import จาก SharePoint แบบ manual upload
- เก็บเอกสารกระดาษเป็น note/reference ก่อน ยังไม่ upload file ใน MVP
- ข้อมูลต้นทางจาก SharePoint คือ `data/Network.csv` และ `data/Server.csv`
- Asset ทุกตัวในข้อมูลต้นทางมี serial no.; MVP ไม่ต้องรองรับ asset ที่ไม่มี serial no.
- พนักงานทั่วไปหรือ Viewer ดูข้อมูลแบบ read-only ได้ แต่แก้ไขไม่ได้
- การเช่ากับการยืมใช้ workflow/status `Borrow` เดียวกัน
- `Wait` ใช้เป็นสถานะรวมแบบชั่วคราว และต้องมี note อธิบายว่ารออะไร
- Location ใช้แบบ simple location ก่อน เช่น rack, shelf, room หรือข้อความ location เดิมจาก SharePoint
- รายละเอียดผู้ซื้อ ผู้ยืม ผู้ใช้ภายใน เลขเอกสาร และข้อมูลเช่า/ขาย เก็บเป็น note/reference ใน MVP

## Key Concepts

### Asset

Asset คือของจริง 1 ชิ้นที่บริษัทต้องการติดตาม เช่น fan, RAM, module, switch, router, server part หรืออุปกรณ์ network

### Serial No.

Serial no. คือรหัสเฉพาะของ asset แต่ละชิ้น ใช้ระบุตัวตนของ asset แทนการนับจำนวน

### Product / Model

Product หรือ model คือชื่อรุ่นหรือชนิดของของ เช่น `HPE Fan For DL380 DL388 Gen9` ซึ่ง asset หลายชิ้นสามารถเป็น model เดียวกันได้ แต่แต่ละ asset ต้องมี serial no. ของตัวเอง

### Domain

Domain คือกลุ่มความรับผิดชอบหลักของ stock:

- Server
- Network

Domain ใช้ควบคุมสิทธิ์ว่าใครแก้ไขข้อมูลของ item หมวดใดได้

### Status

Status คือสถานะปัจจุบันของ asset แต่ละชิ้น เป็นหัวใจหลักของระบบนี้

## Asset Statuses

### Ready

พร้อมใช้งาน สามารถนำไปยืม ใช้ภายใน เช่า หรือขายได้

### Borrow

ลูกค้าหรือผู้เกี่ยวข้องยืมใช้งานอยู่ โดยมีเอกสารกระดาษที่เซ็นลายมือแล้ว ระบบเก็บ note/reference ของเอกสารนั้น

### Using

บริษัทนำ asset ไปใช้งานภายใน

### Sold

ขายออกไปแล้ว ของยังคงอยู่ในระบบเพื่อเก็บประวัติ แต่ไม่ควรถูกเลือกไปใช้งาน ยืม หรือขายซ้ำอีก

### Fail

เสียหายหรือพัง

### Lost

หาย และยังไม่สามารถนำกลับมาใช้ได้

### Need Check

ต้องตรวจสอบเพิ่มเติม เช่น ตอน check stock เคยมีของอยู่ แต่ตอนนี้พัง หาไม่เจอ หรือข้อมูลไม่แน่ชัด

### Wait

รอดำเนินการบางอย่าง เช่น รอตรวจเช็ค รอข้อมูลเพิ่มเติม หรือรอสรุปสถานะ ต้องใส่ note เพื่ออธิบายเสมอ

## Target Users

### P' Oak: Admin

ผู้ดูแลระบบและข้อมูลทั้งหมด

Needs:

- ดู asset ทุกหมวด
- เพิ่ม แก้ไข และเปลี่ยนสถานะ asset ได้ทุกหมวด
- จัดการผู้ใช้และสิทธิ์
- ตรวจสอบประวัติย้อนหลัง
- ดูรายงานภาพรวม Server และ Network
- ดูผล migration จาก SharePoint

### P' Arm: Server Stock Owner

ผู้ดูแล stock ที่เกี่ยวกับ Server

Needs:

- ดูและแก้ไข asset ใน domain Server
- เพิ่ม item ใหม่ของ Server เมื่อของเข้า
- เปลี่ยน status ตามเอกสารกระดาษ เช่น Borrow, Using, Sold
- ตรวจสอบ history ของ serial no. ในหมวด Server
- ไม่สามารถแก้ไข asset หมวด Network

### P' Mek: Network Stock Owner

ผู้ดูแล stock ที่เกี่ยวกับ Network

Needs:

- ดูและแก้ไข asset ใน domain Network
- เพิ่ม item ใหม่ของ Network เมื่อของเข้า
- เปลี่ยน status ตามเอกสารกระดาษ เช่น Borrow, Using, Sold
- ตรวจสอบ history ของ serial no. ในหมวด Network
- ไม่สามารถแก้ไข asset หมวด Server

### Employee / Viewer

พนักงานทั่วไปที่ต้องการดูข้อมูลหรือสอบถามของ

Needs:

- ค้นหา asset ตาม serial no., model หรือสถานะได้ตามสิทธิ์
- ดูสถานะของ item ได้
- ไม่สามารถเปลี่ยนสถานะหรือแก้ไขข้อมูลหลักได้

## User Roles and Permissions

### Admin

- จัดการ users และ roles ได้
- ดู asset ทุก domain ได้
- เพิ่ม แก้ไข และเปลี่ยนสถานะ asset ทุก domain ได้
- import ข้อมูลจาก SharePoint ได้
- ดู reports และ history ทุกอย่างได้

### Server Stock Owner

- ดู asset domain Server ได้
- เพิ่ม แก้ไข และเปลี่ยนสถานะ asset domain Server ได้
- ดู history ของ asset domain Server ได้
- ไม่สามารถแก้ไข asset domain Network

### Network Stock Owner

- ดู asset domain Network ได้
- เพิ่ม แก้ไข และเปลี่ยนสถานะ asset domain Network ได้
- ดู history ของ asset domain Network ได้
- ไม่สามารถแก้ไข asset domain Server

### Viewer

- ดู asset ตามสิทธิ์ที่ระบบกำหนด
- ค้นหาและกรองข้อมูลได้
- ไม่สามารถเพิ่ม แก้ไข เปลี่ยนสถานะ หรือ import ข้อมูลได้

## MVP Scope

### Included in MVP

- Login/logout
- Role-based access control
- Domain-based permission สำหรับ Server และ Network
- Import/migration ข้อมูลจาก SharePoint
- Import source files: `data/Network.csv` และ `data/Server.csv`
- Viewer read-only access
- Asset list
- Asset detail
- Register new asset
- Edit asset information
- Change asset status
- Status history
- Search by serial no., model, domain, status และ location
- Dashboard summary
- Basic reports
- Note/reference สำหรับเอกสารกระดาษ
- Borrow workflow สำหรับทั้งการยืมและการเช่า

### Excluded from MVP

- Quantity-based stock balance
- Digital signature
- Document upload
- Real-time SharePoint sync
- Purchase order
- Barcode scanner
- Costing/accounting
- Export report เป็น Excel

## Core Features

### 1. Authentication

Requirements:

- ผู้ใช้ login ได้
- ผู้ใช้ logout ได้
- ระบบโหลด role และ domain permission หลัง login
- route ภายในระบบต้องป้องกันผู้ใช้ที่ยังไม่ login

Acceptance Criteria:

- ผู้ใช้ที่ login สำเร็จเข้าสู่ dashboard
- ผู้ใช้ที่ยังไม่ login เข้าหน้าภายในไม่ได้
- ผู้ใช้เห็นเมนูตาม role และ domain permission

### 2. SharePoint Data Migration

Requirements:

- Admin สามารถ import ข้อมูลเดิมจาก SharePoint ได้
- รองรับไฟล์ export เช่น CSV หรือ Excel
- ระบบต้อง map field เดิมเข้ากับ field ใหม่
- ระบบต้อง validate serial no. ซ้ำ
- records ที่ข้อมูลไม่ครบต้องถูกแยกเป็นรายการที่ต้อง review
- ต้องเก็บ migration batch เพื่อ audit ได้

Acceptance Criteria:

- Admin import ข้อมูล SharePoint ได้
- ข้อมูลที่ import แล้วกลายเป็น asset records
- duplicate serial no. ถูกแจ้งเตือน
- row ที่ผิดพลาดไม่ทำให้ import ทั้งหมดพังโดยไม่มี report

### 3. Asset Registration

ใช้เมื่อของเข้าใหม่ และ P' Arm หรือ P' Mek ตรวจเช็คของเรียบร้อยแล้ว

Requirements:

- เพิ่ม asset ใหม่ได้ทีละ serial no.
- serial no. ต้องไม่ซ้ำ
- ต้องเลือก domain เป็น Server หรือ Network
- ต้องระบุ product/model name
- ต้องระบุ status เริ่มต้น เช่น Ready หรือ Wait
- สามารถใส่ note ได้

Acceptance Criteria:

- ของเหมือนกัน 5 ชิ้นต้องถูกสร้างเป็น 5 asset records
- serial no. ซ้ำต้องถูกปฏิเสธ
- ผู้ดูแล domain เพิ่ม asset ได้เฉพาะ domain ของตัวเอง

### 4. Asset Search and List

Requirements:

- ค้นหาด้วย serial no.
- ค้นหาด้วย product/model name
- กรองตาม domain
- กรองตาม status
- กรองตาม location หากมี
- แสดงผลแบบ pagination

Acceptance Criteria:

- ผู้ใช้หา asset จาก serial no. ได้เร็ว
- P' Arm เห็นและแก้ได้เฉพาะ Server
- P' Mek เห็นและแก้ได้เฉพาะ Network
- Admin เห็นทั้งหมด

### 5. Asset Detail

Requirements:

- แสดงข้อมูล asset ปัจจุบัน
- แสดง status ปัจจุบัน
- แสดง note ล่าสุด
- แสดง status history ทั้งหมด
- แสดงข้อมูลจาก SharePoint เดิมหาก asset มาจาก migration

Acceptance Criteria:

- ผู้ใช้เห็นประวัติของ serial no. แต่ละตัว
- เห็นได้ว่าใครเปลี่ยนสถานะ เมื่อไหร่ และ note คืออะไร

### 6. Change Asset Status

Requirements:

- ผู้ใช้ที่มีสิทธิ์สามารถเปลี่ยน status ได้
- ทุกการเปลี่ยน status ต้องสร้าง status history
- status บางประเภทต้องใส่ note เช่น Borrow, Using, Sold, Fail, Lost, Need Check และ Wait
- ระบบต้องบันทึก from status, to status, changed by, changed at และ note

Acceptance Criteria:

- เปลี่ยน status แล้ว asset ปัจจุบันเปลี่ยนตาม
- history ถูกสร้างทุกครั้ง
- note ไม่หาย
- ผู้ใช้ไม่สามารถเปลี่ยน status ของ asset นอก domain ตัวเองได้

### 7. Borrow Asset

Requirements:

- ใช้เมื่อมีเอกสารกระดาษยืมของและเซ็นลายมือแล้ว
- เลือก asset ที่มี status เหมาะสม เช่น Ready
- เปลี่ยน status เป็น Borrow
- ใส่ note เช่น ชื่อลูกค้า เลขที่เอกสาร วันที่ยืม หรือรายละเอียดอื่น

Acceptance Criteria:

- Ready asset ถูกเปลี่ยนเป็น Borrow ได้
- Sold asset ไม่สามารถถูกยืมได้
- history ระบุว่าใครเปลี่ยนเป็น Borrow

### 8. Return Borrowed Asset

Requirements:

- ใช้เมื่อมีการคืนของและเซ็นคืนในเอกสารใบเดิม
- ค้นหา asset ที่ status Borrow
- ตรวจสภาพของหลังคืน
- เปลี่ยน status เป็น Ready, Fail หรือ Need Check ตามสภาพจริง
- ใส่ note อ้างอิงเอกสารเดิม

Acceptance Criteria:

- Borrow asset ถูกคืนเป็น Ready ได้
- หากเสีย เปลี่ยนเป็น Fail ได้
- หากยังไม่แน่ชัด เปลี่ยนเป็น Need Check ได้
- history แสดงการคืนพร้อม note

### 9. Use Asset Internally

Requirements:

- ใช้เมื่อบริษัทนำของไปใช้งานภายใน
- เปลี่ยน status เป็น Using
- ใส่ note เช่น ผู้ใช้ภายใน แผนก งาน หรือ project

Acceptance Criteria:

- Ready asset เปลี่ยนเป็น Using ได้
- history ระบุผู้เปลี่ยนและ note

### 10. Sell Asset

Requirements:

- ใช้เมื่อขาย asset ออกไป
- เปลี่ยน status เป็น Sold
- ใส่ note เช่น ขายให้ใคร เลขที่เอกสาร หรือรายละเอียดการขาย
- ของที่ Sold ต้องยังคงอยู่ในระบบ

Acceptance Criteria:

- Sold asset ไม่ถูกลบ
- Sold asset ไม่สามารถถูกเลือกไป borrow/use/sell ซ้ำใน workflow ปกติ
- history ระบุรายละเอียดการขายเท่าที่บันทึกใน note

### 11. Mark Asset as Fail, Lost, Need Check, Wait

Requirements:

- เปลี่ยน status เป็น Fail เมื่อเสียหรือพัง
- เปลี่ยน status เป็น Lost เมื่อหาย
- เปลี่ยน status เป็น Need Check เมื่อต้องตรวจสอบเพิ่มเติม
- เปลี่ยน status เป็น Wait เมื่อรอดำเนินการ
- ต้องใส่ note ทุกครั้ง

Acceptance Criteria:

- status ปัญหาทุกประเภทต้องมี note
- history แสดงเหตุผลและผู้เปลี่ยน

### 12. Stock Check

Requirements:

- ผู้ดูแลสามารถตรวจของจริงเทียบกับข้อมูลในระบบ
- ค้นหาตาม domain, status หรือ location
- เมื่อพบปัญหา สามารถเปลี่ยน status เป็น Need Check, Fail หรือ Lost
- ใส่ note รอบการตรวจ

Acceptance Criteria:

- ตรวจสอบ serial no. รายชิ้นได้
- item ที่มีปัญหาถูก flag ด้วย status ที่ถูกต้อง
- history ของ asset ระบุว่าถูกเปลี่ยนสถานะจากการตรวจ stock

### 13. Dashboard and Reports

Requirements:

- แสดงจำนวน asset แยกตาม status
- แสดงจำนวน asset แยกตาม domain
- แสดงรายการ Need Check, Fail, Lost
- แสดงรายการ Borrow และ Using
- แสดงรายการ Sold
- แสดง status changes ล่าสุด

Acceptance Criteria:

- P' Oak เห็นภาพรวมทั้งหมด
- P' Arm เห็นภาพรวม Server
- P' Mek เห็นภาพรวม Network
- รายงานกรองตาม status และ domain ได้

## Use Cases

| ID | Use Case | Actor | Goal |
|---|---|---|---|
| UC-01 | Login | All users | เข้าระบบตามสิทธิ์ |
| UC-02 | Import Data from SharePoint | Admin | ย้ายข้อมูลเดิมเข้าระบบใหม่ |
| UC-03 | Register New Asset | Admin, Stock Owner | เพิ่มของเข้าใหม่แบบแยก serial no. |
| UC-04 | Edit Asset Information | Admin, Stock Owner | แก้ข้อมูล asset |
| UC-05 | Change Asset Status | Admin, Stock Owner | เปลี่ยนสถานะของ item |
| UC-06 | Borrow Asset to Customer | Stock Owner | บันทึกการยืมหลังมีเอกสารกระดาษ |
| UC-07 | Return Borrowed Asset | Stock Owner | บันทึกการคืนและสถานะหลังตรวจสภาพ |
| UC-08 | Use Asset Internally | Stock Owner | บันทึกของที่ใช้ภายในบริษัท |
| UC-09 | Sell Asset | Stock Owner | บันทึกของที่ขายแล้วโดยไม่ลบออกจากระบบ |
| UC-10 | Mark Asset as Failed | Stock Owner | ระบุว่า asset เสียหรือพัง |
| UC-11 | Mark Asset as Lost | Stock Owner | ระบุว่า asset หาย |
| UC-12 | Mark Asset as Need Check | Stock Owner | ระบุว่า asset ต้องตรวจสอบเพิ่มเติม |
| UC-13 | Stock Check | Admin, Stock Owner | ตรวจของจริงเทียบกับระบบ |
| UC-14 | View Asset History | Authorized users | ดูประวัติของ serial no. |
| UC-15 | Search Asset | Authorized users | ค้นหา asset ด้วย serial no./model/status |
| UC-16 | Manage Users and Permissions | Admin | จัดการ role และ domain permission |

## Workflows

### WF-01: Login

1. ผู้ใช้เปิดเว็บ
2. ระบบแสดงหน้า login
3. ผู้ใช้กรอก email และ password
4. ระบบตรวจสอบบัญชี
5. ระบบโหลด role และ domain permission
6. ระบบพาไป dashboard
7. ผู้ใช้เห็นข้อมูลและเมนูตามสิทธิ์

Exceptions:

- email/password ผิด แสดง error
- user inactive ไม่ให้เข้าสู่ระบบ
- ไม่มี permission ให้ซ่อนเมนูและ block API

### WF-02: Migrate Data from SharePoint

1. Admin export ข้อมูลจาก SharePoint เป็น CSV หรือ Excel
2. Admin เข้าเมนู Import
3. Upload ไฟล์เข้าสู่ระบบ
4. ระบบ preview ข้อมูลและ field mapping
5. Admin ยืนยัน mapping เช่น serial no., model, domain, status, note
6. ระบบ validate duplicate serial no. และ required fields
7. ระบบ import records ที่ถูกต้อง
8. ระบบแยก rows ที่มีปัญหาไว้ให้ review
9. ระบบสร้าง migration batch และ log ผลการ import

Exceptions:

- serial no. ซ้ำ ให้ reject row นั้น
- status จาก SharePoint ไม่ตรงกับ status ใหม่ ให้ map เป็น Wait หรือ Need Check เพื่อ review
- domain ไม่ชัดเจน ให้ส่งไป review ก่อน import เป็นข้อมูลใช้งานจริง

### WF-03: New Asset Arrival

1. ของเข้าบริษัท
2. P' Arm หรือ P' Mek รับทราบว่าของเข้าวันไหน
3. เมื่อของมาถึง ผู้ดูแลตรวจเช็คความเรียบร้อย
4. ผู้ดูแลแยกของตาม serial no.
5. เปิดหน้า Register Asset
6. กรอก model/product name
7. กรอก serial no.
8. เลือก domain Server หรือ Network
9. เลือก status เริ่มต้น เช่น Ready หรือ Wait
10. ใส่ note ถ้ามี
11. ระบบสร้าง asset record
12. ระบบสร้าง history แรกของ asset

Example:

```text
HPE Fan For DL380 DL388 Gen9 / SN001 / Ready
HPE Fan For DL380 DL388 Gen9 / SN002 / Ready
HPE Fan For DL380 DL388 Gen9 / SN003 / Ready
HPE Fan For DL380 DL388 Gen9 / SN004 / Ready
HPE Fan For DL380 DL388 Gen9 / SN005 / Ready
```

### WF-04: Borrow Asset

1. ลูกค้าหรือผู้เกี่ยวข้องต้องการยืมของ
2. เขียนเอกสารกระดาษ
3. เซ็นลายมือ
4. P' Arm หรือ P' Mek ตรวจ serial no. ของ item ที่จะให้ยืม
5. เปิด asset ในระบบ
6. ตรวจว่า status ปัจจุบันสามารถให้ยืมได้
7. เปลี่ยน status เป็น Borrow
8. ใส่ note เช่น ชื่อลูกค้า เลขที่เอกสาร วันที่ยืม
9. ระบบบันทึก status history

Exceptions:

- asset เป็น Sold ไม่ให้ยืม
- asset เป็น Fail, Lost หรือ Need Check ต้องไม่ให้ยืมจนกว่าจะเปลี่ยนกลับเป็น Ready
- ผู้ใช้ไม่มีสิทธิ์ domain นั้น ให้ block action

### WF-05: Return Borrowed Asset

1. ลูกค้านำของมาคืน
2. เซ็นคืนในเอกสารใบเดิม
3. P' Arm หรือ P' Mek ตรวจ serial no. และสภาพของ
4. เปิด asset ในระบบ
5. หากของปกติ เปลี่ยน status เป็น Ready
6. หากของเสีย เปลี่ยน status เป็น Fail
7. หากยังไม่แน่ชัด เปลี่ยน status เป็น Need Check
8. ใส่ note อ้างอิงเอกสารเดิมและผลการตรวจ
9. ระบบบันทึก status history

### WF-06: Use Asset Internally

1. พนักงานหรือทีมภายในต้องการใช้อุปกรณ์
2. เขียนเอกสารกระดาษและเซ็นตาม process เดิม
3. P' Arm หรือ P' Mek เลือก asset ตาม serial no.
4. ตรวจว่า asset พร้อมใช้งาน
5. เปลี่ยน status เป็น Using
6. ใส่ note เช่น ผู้ใช้ แผนก งาน หรือ project
7. ระบบบันทึก history

### WF-07: Sell Asset

1. มีการขาย asset ออกไป
2. P' Arm หรือ P' Mek เปิด asset ตาม serial no.
3. ตรวจว่า asset ไม่ได้ Sold อยู่แล้ว
4. เปลี่ยน status เป็น Sold
5. ใส่ note เช่น ขายให้ใคร เลขที่เอกสาร หรือรายละเอียดการขาย
6. ระบบบันทึก history
7. asset ยังอยู่ในระบบ แต่ไม่ถูกใช้ใน workflow ปกติอีก

### WF-08: Mark Problem Status

1. ผู้ดูแลพบว่า asset เสีย หาย หรือข้อมูลไม่แน่ชัด
2. เปิด asset ในระบบ
3. เลือก status เป็น Fail, Lost, Need Check หรือ Wait
4. ใส่ note ระบุเหตุผล
5. ระบบบันทึก status history

### WF-09: Stock Check

1. P' Oak, P' Arm หรือ P' Mek เริ่มรอบตรวจ stock
2. ระบบแสดงรายการ asset ที่ควรตรวจตาม domain
3. ผู้ดูแลตรวจของจริงตาม serial no.
4. ถ้าเจอและปกติ คง status เดิมหรือเปลี่ยนเป็น Ready
5. ถ้าเจอแต่พัง เปลี่ยนเป็น Fail
6. ถ้าหาไม่เจอ เปลี่ยนเป็น Need Check หรือ Lost
7. ใส่ note รอบการตรวจ
8. ระบบเก็บ history ทุกครั้งที่ status เปลี่ยน

### WF-10: View Asset History

1. ผู้ใช้ค้นหา asset ด้วย serial no. หรือ model
2. เปิดหน้า Asset Detail
3. ระบบแสดงข้อมูลปัจจุบันของ asset
4. ระบบแสดง timeline การเปลี่ยน status ทั้งหมด
5. ผู้ใช้ดูได้ว่าใครเปลี่ยน status เมื่อไหร่ จากอะไรเป็นอะไร และ note คืออะไร

## Business Rules

- 1 asset record เท่ากับของจริง 1 ชิ้น
- Asset ทุกตัวใน MVP ต้องมี serial no.
- Serial no. ต้องไม่ซ้ำ
- ระบบ MVP ไม่มี quantity field สำหรับ serialized asset
- หาก source file มี `QTY` หรือ `FG` ให้เก็บเป็น legacy/reference fields เท่านั้น ห้ามใช้เป็น stock balance logic
- ของเหมือนกันหลายชิ้นต้องสร้างหลาย records ตาม serial no.
- Asset ต้องมี domain เป็น Server หรือ Network
- P' Arm แก้ไขได้เฉพาะ asset domain Server
- P' Mek แก้ไขได้เฉพาะ asset domain Network
- P' Oak แก้ไขได้ทุก domain
- พนักงานทั่วไปหรือ Viewer ดูข้อมูลแบบ read-only ได้ แต่ไม่สามารถเปลี่ยน status หรือแก้ไขข้อมูลได้
- ทุกการเปลี่ยน status ต้องสร้าง status history
- Status Borrow, Using, Sold, Fail, Lost, Need Check และ Wait ต้องมี note
- เอกสารลายเซ็นยังเป็นกระดาษ ระบบเก็บเฉพาะ note/reference
- การเช่ากับการยืมใช้ status `Borrow` เดียวกันใน MVP
- Asset ที่ Sold แล้วต้องไม่ถูกลบออกจากระบบ
- Asset ที่ Sold แล้วไม่ควรถูกเลือกไปยืม ใช้งาน หรือขายซ้ำใน workflow ปกติ
- Asset ที่ Fail, Lost หรือ Need Check ไม่ควรถูกยืม ใช้งาน หรือขาย จนกว่าจะถูก review
- ข้อมูลที่ migrate จาก SharePoint ต้องเก็บ source reference หรือ migration batch
- ห้ามแก้ไข asset นอก domain ของผู้ใช้ แม้จะเรียก API โดยตรง
- การเปลี่ยน status ต้องบันทึก changed by และ changed at เสมอ

## Source Data Profile

ข้อมูลต้นทางที่ใช้ migrate มาจากไฟล์ SharePoint export:

### data/Network.csv

- Rows: 594
- Blank serial no.: 0
- Duplicate serial no.: 0
- Columns: Image, Category, Types, Brand, Model, Comment, Part No., Serial No., Stock Code, QTY, FG, Status, Location, Remark
- Status counts: Ready 371, Sold 171, Borrow 25, Using 12, Need Check 8, Fail 4, Lost 2, Wait 1
- Category values: Connector, Network, Accessory
- Type values: Module, AccessPoint, Switch, Cable, Firewall, Power Supply Swtich, Injector, SparePart, Router

### data/Server.csv

- Rows: 551
- Blank serial no.: 0
- Duplicate serial no.: 0
- Columns: Image, Category, Types, Brand, Model, Part No., Serial No., Description, Stock Code, QTY, FG, Status, Location, Remark, Comment
- Status counts: Ready 473, Sold 38, Borrow 18, Using 8, Fail 7, Wait 5, Lost 1, Need Check 1
- Category values: Accessories, HDD&SSD, Connector, HPE, Storage, Dell, Fujitsu, Nutanix, Cisco, IBM, SuperMicro
- Type values: SAS, Card, Memory, Server, SATA, Module, Power Supply Server, Sparepart

Notes:

- ไฟล์ CSV มีบรรทัดแรกเป็น SharePoint `ListSchema=...` และบรรทัดถัดไปจึงเป็น header จริง
- Importer ต้องข้าม schema line ก่อน parse CSV data
- Domain ไม่ต้องให้ผู้ใช้ map เองใน MVP: `data/Network.csv` map เป็น Network และ `data/Server.csv` map เป็น Server
- `QTY` และ `FG` เป็นข้อมูล legacy/reference จาก SharePoint ไม่ใช่ quantity logic ของระบบใหม่

## Data Entities

รายละเอียด schema เชิงเทคนิคอยู่ใน `design.md` แต่ PRD ระบุ entity หลักดังนี้:

- User
- Role
- Domain Permission
- Asset Domain
- Asset Category
- Asset Model
- Asset
- Asset Status History
- Location
- Migration Batch
- Migration Row

## Page Requirements

### Dashboard

- Summary แยกตาม status
- Summary แยกตาม Server/Network
- รายการ Need Check
- รายการ Fail และ Lost
- Status changes ล่าสุด

### Assets

- รายการ asset ทั้งหมดตามสิทธิ์
- ค้นหาด้วย serial no. และ model
- กรองตาม domain, status, location
- pagination

### Asset Detail

- ข้อมูล asset ปัจจุบัน
- status ปัจจุบัน
- note ล่าสุด
- status history timeline
- source SharePoint/migration info ถ้ามี

### Register Asset

- ฟอร์มเพิ่ม asset ราย serial no.
- เลือก domain
- เลือกหรือกรอก model
- เลือก status เริ่มต้น
- note

### Change Status

- เปลี่ยน status ของ asset
- บังคับ note ตาม business rules
- แสดง status ปัจจุบันก่อนเปลี่ยน

### Import

- upload CSV/Excel จาก SharePoint
- preview data
- field mapping
- validation result
- import summary

### Reports

- Assets by status
- Assets by domain
- Borrowed assets
- Using assets
- Sold assets
- Fail/Lost/Need Check assets
- Status history report

### Users and Settings

- จัดการผู้ใช้
- จัดการ role
- จัดการ domain permission
- จัดการ category/model/location

## Success Metrics

- ข้อมูลจาก SharePoint ถูก migrate เข้าระบบใหม่ได้
- ผู้ใช้ค้นหา asset ด้วย serial no. ได้
- P' Arm แก้ไขได้เฉพาะ Server
- P' Mek แก้ไขได้เฉพาะ Network
- P' Oak จัดการได้ทั้งหมด
- ทุก asset มีสถานะปัจจุบันที่ชัดเจน
- ทุก status change มี history พร้อม user/time/note
- Sold asset ยังอยู่ในระบบและไม่ถูกนำกลับมาใช้ซ้ำ
- ผู้ดูแลสามารถดูรายงาน Borrow, Using, Sold, Fail, Lost และ Need Check ได้

## Acceptance Criteria for MVP

MVP ถือว่าเสร็จเมื่อ:

- ผู้ใช้ login/logout ได้
- ระบบรองรับ Admin, Server Stock Owner, Network Stock Owner และ Viewer
- Admin import ข้อมูลจาก SharePoint ได้
- Admin เห็น asset ทุก domain
- Server Stock Owner จัดการได้เฉพาะ Server
- Network Stock Owner จัดการได้เฉพาะ Network
- เพิ่ม asset ใหม่แบบแยก serial no. ได้
- serial no. ซ้ำถูกปฏิเสธ
- เปลี่ยน status asset ได้ตามสิทธิ์
- ทุก status change สร้าง history
- note ถูกบังคับสำหรับ status สำคัญ
- ค้นหา asset ด้วย serial no. ได้
- ดู asset detail และ history ได้
- dashboard แสดง summary ตาม status/domain ได้

## Open Questions

- ต้องมี field `asset no.` แยกจาก `Stock Code` หรือใช้ `Stock Code` เป็น asset reference พอ
- ต้องเก็บ `Image` จาก SharePoint เป็น reference string เท่านั้น หรือจะ migrate รูปจริงในอนาคต

## Future Enhancements

- Upload เอกสารกระดาษเป็นรูปหรือ PDF
- Digital signature
- Barcode/QR code scanner
- Request workflow สำหรับพนักงานก่อนทำเอกสาร
- Approval workflow
- Export reports เป็น Excel
- SharePoint sync หลัง migration
- Notification สำหรับ Need Check หรือของที่ยืมนาน
- Mobile-friendly stock check
