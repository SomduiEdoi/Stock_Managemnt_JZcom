# Product Requirements Document (PRD)

## Project Name

Stock Management System

## Document Purpose

เอกสารนี้ใช้เป็นแหล่งอ้างอิงหลักของโปรเจกต์ เพื่ออธิบายว่าเรากำลังสร้างระบบอะไร ทำไมต้องสร้าง ใครเป็นผู้ใช้งานหลัก ระบบต้องแก้ปัญหาอะไร และฟีเจอร์ใดบ้างที่ต้องมีในขอบเขต MVP

เอกสารนี้ควรถูกอ่านก่อนเริ่มเขียนโค้ดทุกครั้ง และควรถูกอัปเดตเมื่อ requirement หรือขอบเขตของระบบเปลี่ยนแปลง

## Product Overview

Stock Management System คือเว็บแอปสำหรับจัดการสินค้าคงคลัง ช่วยให้ธุรกิจสามารถติดตามสินค้า รับสินค้าเข้า เบิกหรือขายสินค้าออก ปรับยอด โอนสินค้าระหว่างคลัง และตรวจสอบยอดคงเหลือได้อย่างเป็นระบบ

ระบบนี้จะใช้แนวคิด stock movement เป็นแกนหลัก กล่าวคือยอดคงเหลือของสินค้าไม่ควรถูกแก้ไขโดยตรง แต่ควรคำนวณจากประวัติการเคลื่อนไหวของสินค้า เช่น รับเข้า เบิกออก ปรับยอด และโอนคลัง เพื่อให้ตรวจสอบย้อนหลังได้และลดความผิดพลาดของข้อมูล

## Problem Statement

ธุรกิจที่จัดการสต็อกด้วยกระดาษ Excel หรือการจดบันทึกแบบ manual มักเจอปัญหาต่อไปนี้:

- ไม่รู้ยอดสินค้าคงเหลือแบบ real-time
- ข้อมูลรับเข้าและเบิกออกไม่เป็นระบบ
- ตรวจสอบย้อนหลังได้ยากว่าใครแก้ไขสต็อก เมื่อไหร่ และเพราะอะไร
- สินค้าหมดโดยไม่รู้ตัว เพราะไม่มีการแจ้งเตือน stock ต่ำ
- SKU หรือชื่อสินค้าซ้ำ ทำให้ข้อมูลคลังสับสน
- การปรับยอดสินค้าไม่มีเหตุผลหรือหลักฐานประกอบ
- มีความเสี่ยงที่ยอดคงเหลือผิดพลาดเมื่อมีหลายคนทำรายการพร้อมกัน

## Goals

- สร้างระบบจัดการสินค้าคงคลังที่ใช้งานง่ายและตรวจสอบย้อนหลังได้
- ทำให้ผู้ใช้เห็นยอดคงเหลือของสินค้าได้อย่างถูกต้อง
- รองรับการรับเข้า เบิกออก ปรับยอด และโอนคลัง
- ลดความผิดพลาดจากการจัดการ stock แบบ manual
- แจ้งเตือนเมื่อสินค้าใกล้หมดหรือต่ำกว่าจุดสั่งซื้อ
- วางโครงสร้างระบบให้ต่อยอดเป็นระบบจัดซื้อ รายงานขั้นสูง หรือ barcode ได้ในอนาคต

## Non-Goals

สิ่งต่อไปนี้ยังไม่อยู่ในขอบเขต MVP เว้นแต่มีการตัดสินใจเพิ่มในภายหลัง:

- ระบบบัญชีเต็มรูปแบบ
- ระบบขายหน้าร้าน POS
- ระบบ barcode scanner
- ระบบ purchase order เต็มรูปแบบ
- ระบบ multi-company
- ระบบ forecast ความต้องการสินค้า
- ระบบ integration กับ marketplace หรือ accounting software ภายนอก

## Target Users

### 1. Business Owner / Manager

ผู้ดูแลภาพรวมของธุรกิจ ต้องการเห็นยอดสินค้าคงเหลือ รายงานความเคลื่อนไหว และรายการสินค้าที่ใกล้หมด

ความต้องการหลัก:

- ดูภาพรวมสินค้าคงเหลือ
- ตรวจสอบสินค้าใกล้หมด
- ดูประวัติการเคลื่อนไหวของสินค้า
- ดูรายงานเบื้องต้น

### 2. Warehouse Staff

พนักงานคลังที่ทำรายการรับเข้า เบิกออก โอนสินค้า และตรวจนับสินค้า

ความต้องการหลัก:

- รับสินค้าเข้าคลัง
- เบิกสินค้าออก
- โอนสินค้าระหว่างคลัง
- ปรับยอดจากการตรวจนับ
- ค้นหาสินค้าได้รวดเร็ว

### 3. Admin

ผู้ดูแลระบบที่จัดการผู้ใช้ สิทธิ์การเข้าถึง ข้อมูลสินค้า หมวดหมู่ และคลังสินค้า

ความต้องการหลัก:

- จัดการบัญชีผู้ใช้
- กำหนดสิทธิ์ผู้ใช้
- จัดการสินค้า หมวดหมู่ และคลัง
- ตรวจสอบ activity สำคัญของระบบ

## User Roles

### Admin

- จัดการผู้ใช้ได้
- จัดการสินค้าได้
- จัดการหมวดหมู่สินค้าได้
- จัดการคลังหรือ location ได้
- ทำ stock transaction ได้
- ดูรายงานได้
- เข้าถึงการตั้งค่าระบบได้

### Manager

- ดู dashboard และรายงานได้
- ดูรายการสินค้าและยอดคงเหลือได้
- ทำรายการ stock transaction ได้
- อนุมัติหรือ review การปรับยอดได้ หากระบบเพิ่ม approval flow ในอนาคต

### Staff

- ดูรายการสินค้าได้
- รับสินค้าเข้าได้
- เบิกสินค้าออกได้
- โอนสินค้าได้
- ส่งคำขอปรับยอดได้ หรือปรับยอดได้ตามสิทธิ์ที่กำหนด

### Viewer

- ดูข้อมูลสินค้าและยอดคงเหลือได้
- ดูรายงานได้
- ไม่สามารถสร้าง แก้ไข หรือลบข้อมูลสำคัญได้

## MVP Scope

MVP คือเวอร์ชันแรกที่ใช้งานได้จริงและครอบคลุม workflow สำคัญของการจัดการ stock

### Included in MVP

- Authentication พื้นฐาน
- Role-based access control พื้นฐาน
- Dashboard แสดงภาพรวม stock
- Product management
- Category management
- Location / warehouse management
- Stock in
- Stock out
- Stock adjustment
- Stock transfer
- Inventory balance view
- Low stock alert
- Stock movement history
- Basic reports

### Excluded from MVP

- Barcode scanner
- Purchase order workflow
- Supplier portal
- Advanced approval workflow
- Accounting integration
- Mobile app แยกต่างหาก
- Multi-language interface

## Core Features

### 1. Authentication

ผู้ใช้ต้องเข้าสู่ระบบก่อนใช้งานเว็บแอป

Requirements:

- ผู้ใช้สามารถ login ได้
- ผู้ใช้สามารถ logout ได้
- ระบบต้องรู้ role ของผู้ใช้หลัง login
- route ที่ต้องการสิทธิ์ต้องป้องกันผู้ใช้ที่ยังไม่ login

Acceptance Criteria:

- ผู้ใช้ที่ login สำเร็จจะเข้าสู่ dashboard
- ผู้ใช้ที่ยังไม่ login ไม่สามารถเข้าหน้าภายในระบบได้
- ผู้ใช้เห็นเมนูตาม role ของตัวเอง

### 2. Product Management

ผู้ใช้ที่มีสิทธิ์สามารถเพิ่ม แก้ไข และดูรายการสินค้าได้

Product fields:

- SKU
- Product name
- Category
- Unit
- Description
- Reorder point
- Active status

Requirements:

- SKU ต้องไม่ซ้ำ
- Product name ต้องไม่ว่าง
- สินค้าสามารถปิดใช้งานได้แทนการลบทิ้ง
- สินค้าควรค้นหาได้จาก SKU หรือชื่อสินค้า

Acceptance Criteria:

- สร้างสินค้าใหม่ได้เมื่อข้อมูลถูกต้อง
- ระบบปฏิเสธ SKU ที่ซ้ำ
- แก้ไขข้อมูลสินค้าได้
- ปิดใช้งานสินค้าได้โดยไม่ลบประวัติ movement เดิม

### 3. Category Management

ใช้จัดกลุ่มสินค้าเพื่อให้ค้นหาและรายงานได้ง่ายขึ้น

Requirements:

- เพิ่มหมวดหมู่ได้
- แก้ไขชื่อหมวดหมู่ได้
- ปิดใช้งานหมวดหมู่ได้
- หมวดหมู่ที่มีสินค้าอยู่ไม่ควรถูกลบแบบถาวร

Acceptance Criteria:

- สินค้าสามารถผูกกับหมวดหมู่ได้
- ผู้ใช้สามารถกรองสินค้าตามหมวดหมู่ได้

### 4. Location / Warehouse Management

ใช้จัดการคลังหรือพื้นที่เก็บสินค้า

Requirements:

- เพิ่ม location ได้
- แก้ไข location ได้
- ปิดใช้งาน location ได้
- stock balance ต้องแยกตาม product และ location

Acceptance Criteria:

- ระบบแสดงยอดคงเหลือของสินค้าแยกตาม location ได้
- location ที่มีประวัติ movement ไม่ควรถูกลบแบบถาวร

### 5. Stock In

ใช้บันทึกการรับสินค้าเข้าคลัง

Requirements:

- เลือกสินค้าได้
- เลือก location ได้
- ระบุจำนวนรับเข้าได้
- ระบุ note หรือ reference ได้
- จำนวนต้องมากกว่า 0
- รายการรับเข้าต้องสร้าง stock movement ประเภท IN

Acceptance Criteria:

- เมื่อรับสินค้าเข้า ยอดคงเหลือเพิ่มขึ้น
- ประวัติ movement แสดงรายการรับเข้า
- ระบบบันทึกผู้ทำรายการและเวลาที่ทำรายการ

### 6. Stock Out

ใช้บันทึกการเบิกหรือขายสินค้าออกจากคลัง

Requirements:

- เลือกสินค้าได้
- เลือก location ได้
- ระบุจำนวนจ่ายออกได้
- จำนวนต้องมากกว่า 0
- ห้ามจ่ายออกเกินยอดคงเหลือ
- รายการจ่ายออกต้องสร้าง stock movement ประเภท OUT

Acceptance Criteria:

- เมื่อจ่ายสินค้าออก ยอดคงเหลือลดลง
- ระบบปฏิเสธรายการที่ทำให้ stock ติดลบ
- ประวัติ movement แสดงรายการจ่ายออก

### 7. Stock Adjustment

ใช้ปรับยอดสินค้าเมื่อมีการตรวจนับจริงหรือพบความคลาดเคลื่อน

Requirements:

- เลือกสินค้าได้
- เลือก location ได้
- ระบุจำนวนที่ต้องการปรับได้
- ต้องระบุเหตุผลในการปรับยอด
- การปรับยอดต้องสร้าง movement ประเภท ADJUSTMENT
- ระบบต้องบันทึกผู้ทำรายการและเวลาที่ทำรายการ

Acceptance Criteria:

- ปรับยอดได้เมื่อมีเหตุผลประกอบ
- ระบบแสดงประวัติการปรับยอดย้อนหลังได้
- การปรับยอดไม่ทำลายประวัติ movement เดิม

### 8. Stock Transfer

ใช้โอนสินค้าจาก location หนึ่งไปยังอีก location หนึ่ง

Requirements:

- เลือกสินค้าได้
- เลือก location ต้นทางได้
- เลือก location ปลายทางได้
- location ต้นทางและปลายทางต้องไม่เหมือนกัน
- จำนวนต้องมากกว่า 0
- ห้ามโอนเกินยอดคงเหลือของ location ต้นทาง
- การโอนควรสร้าง movement แบบ TRANSFER_OUT และ TRANSFER_IN หรือ movement pair ที่ตรวจสอบย้อนหลังได้

Acceptance Criteria:

- โอนสินค้าแล้วต้นทางลดลง
- โอนสินค้าแล้วปลายทางเพิ่มขึ้น
- ประวัติ movement แสดงความเชื่อมโยงของรายการโอน

### 9. Inventory Balance

ใช้ดูยอดคงเหลือปัจจุบันของสินค้า

Requirements:

- แสดงยอดคงเหลือตามสินค้า
- แสดงยอดคงเหลือตาม location
- ค้นหาได้จาก SKU หรือชื่อสินค้า
- กรองตาม category และ location ได้
- แสดงสถานะ low stock เมื่อยอดต่ำกว่าหรือเท่ากับ reorder point

Acceptance Criteria:

- ยอดคงเหลือสะท้อน stock movement ล่าสุด
- ผู้ใช้สามารถค้นหาและกรองข้อมูลได้
- สินค้าที่ต่ำกว่า reorder point ถูกแสดงเป็น low stock

### 10. Stock Movement History

ใช้ตรวจสอบประวัติการเคลื่อนไหวทั้งหมดของสินค้า

Requirements:

- แสดงรายการ movement ทั้งหมด
- กรองตามสินค้า location ประเภท movement และช่วงวันที่ได้
- แสดงผู้ทำรายการ
- แสดง note หรือ reference

Acceptance Criteria:

- ผู้ใช้สามารถตรวจสอบย้อนหลังได้ว่าสต็อกเปลี่ยนเพราะรายการใด
- movement แต่ละรายการมีข้อมูลเพียงพอสำหรับ audit

### 11. Dashboard

หน้าแรกหลัง login แสดงภาพรวมสำคัญของระบบ

Requirements:

- แสดงจำนวนสินค้าทั้งหมด
- แสดงจำนวนสินค้า low stock
- แสดง movement ล่าสุด
- แสดง summary ของ stock in และ stock out ในช่วงเวลาล่าสุด

Acceptance Criteria:

- ผู้ใช้เห็นสถานะ stock สำคัญได้ทันทีหลัง login
- dashboard โหลดข้อมูลที่จำเป็นโดยไม่ทำให้ระบบช้าเกินไป

### 12. Basic Reports

ใช้ดูรายงานพื้นฐานเพื่อช่วยตัดสินใจ

Reports in MVP:

- Current inventory report
- Low stock report
- Stock movement report

Acceptance Criteria:

- ผู้ใช้สามารถดูรายงาน inventory ปัจจุบันได้
- ผู้ใช้สามารถดูรายการสินค้า low stock ได้
- ผู้ใช้สามารถดู movement ตามช่วงวันที่ได้

## User Flows

### Flow 1: Add New Product

1. Admin หรือผู้ใช้ที่มีสิทธิ์เข้าสู่ระบบ
2. ไปที่หน้า Products
3. คลิกสร้างสินค้าใหม่
4. กรอก SKU ชื่อสินค้า หมวดหมู่ หน่วยนับ และ reorder point
5. กดบันทึก
6. ระบบตรวจสอบ SKU ซ้ำ
7. ระบบสร้างสินค้าใหม่
8. ผู้ใช้เห็นสินค้าในรายการสินค้า

### Flow 2: Receive Stock

1. Staff เข้าสู่ระบบ
2. ไปที่หน้า Stock In
3. เลือกสินค้าและ location
4. กรอกจำนวนรับเข้า
5. กรอก reference หรือ note หากมี
6. กดบันทึก
7. ระบบสร้าง stock movement ประเภท IN
8. ยอดคงเหลือของสินค้าเพิ่มขึ้น

### Flow 3: Issue Stock

1. Staff เข้าสู่ระบบ
2. ไปที่หน้า Stock Out
3. เลือกสินค้าและ location
4. ระบบแสดงยอดคงเหลือปัจจุบัน
5. กรอกจำนวนจ่ายออก
6. กดบันทึก
7. ระบบตรวจสอบว่ายอดพอหรือไม่
8. ถ้ายอดพอ ระบบสร้าง movement ประเภท OUT
9. ยอดคงเหลือลดลง

### Flow 4: Transfer Stock

1. Staff เข้าสู่ระบบ
2. ไปที่หน้า Stock Transfer
3. เลือกสินค้า
4. เลือก location ต้นทางและปลายทาง
5. กรอกจำนวนโอน
6. กดบันทึก
7. ระบบตรวจสอบยอดคงเหลือของต้นทาง
8. ระบบสร้างรายการ movement ที่สัมพันธ์กัน
9. ยอดต้นทางลดลงและยอดปลายทางเพิ่มขึ้น

### Flow 5: Check Low Stock

1. Manager เข้าสู่ระบบ
2. ไปที่ Dashboard หรือ Low Stock Report
3. ระบบแสดงรายการสินค้าที่ต่ำกว่าหรือเท่ากับ reorder point
4. Manager ใช้ข้อมูลนี้เพื่อตัดสินใจเติมสินค้า

## Business Rules

- SKU ต้องไม่ซ้ำกันในระบบ
- Product name ต้องไม่ว่าง
- จำนวน stock transaction ต้องมากกว่า 0
- ห้าม stock out เกินยอดคงเหลือ
- ห้าม stock transfer เกินยอดคงเหลือของ location ต้นทาง
- location ต้นทางและปลายทางของการโอนต้องไม่เหมือนกัน
- การปรับยอด stock ต้องมีเหตุผลเสมอ
- ยอดคงเหลือควรคำนวณจาก stock movements
- ห้ามลบสินค้า location หรือ category ที่มีประวัติ movement แบบถาวร
- ควรใช้ active/inactive status แทนการลบข้อมูลสำคัญ
- ทุก stock transaction ต้องบันทึกผู้ทำรายการและเวลาที่ทำรายการ
- ทุก stock transaction ควรถูกจัดการด้วย database transaction เพื่อป้องกัน race condition
- ระบบต้องป้องกันไม่ให้ stock balance ติดลบ
- Low stock คือสินค้าที่มียอดคงเหลือน้อยกว่าหรือเท่ากับ reorder point

## Data Entities

รายละเอียด schema เชิงเทคนิคจะอยู่ใน `design.md` แต่ PRD ระบุ entity หลักที่ระบบต้องมีดังนี้:

- User
- Role
- Product
- Category
- Location
- Stock Movement
- Inventory Balance
- Supplier

หมายเหตุ: Supplier อาจเป็น optional ใน MVP หากยังไม่ทำ purchase workflow เต็มรูปแบบ

## Page Requirements

### Dashboard

- แสดงภาพรวม stock
- แสดงสินค้า low stock
- แสดง movement ล่าสุด

### Products

- รายการสินค้า
- ค้นหาและกรองสินค้า
- เพิ่มและแก้ไขสินค้า
- เปิดหรือปิดใช้งานสินค้า

### Categories

- รายการหมวดหมู่
- เพิ่มและแก้ไขหมวดหมู่
- เปิดหรือปิดใช้งานหมวดหมู่

### Locations

- รายการคลังหรือพื้นที่เก็บ
- เพิ่มและแก้ไข location
- เปิดหรือปิดใช้งาน location

### Stock In

- ฟอร์มรับสินค้าเข้า
- แสดงรายการรับเข้าล่าสุด

### Stock Out

- ฟอร์มจ่ายสินค้าออก
- แสดงยอดคงเหลือก่อนทำรายการ

### Stock Transfer

- ฟอร์มโอนสินค้า
- แสดงต้นทาง ปลายทาง และจำนวน

### Stock Adjustment

- ฟอร์มปรับยอด
- บังคับระบุเหตุผล

### Inventory

- ดูยอดคงเหลือปัจจุบัน
- กรองตามสินค้า category และ location
- แสดงสถานะ low stock

### Movements

- ดูประวัติ stock movement
- กรองตามสินค้า location ประเภท movement และช่วงวันที่

### Reports

- Current inventory report
- Low stock report
- Stock movement report

### Settings

- จัดการผู้ใช้
- จัดการ role และ permission
- ตั้งค่าพื้นฐานของระบบ

## Success Metrics

- ผู้ใช้สามารถเพิ่มสินค้าและทำ stock transaction หลักได้ครบ
- ยอดคงเหลือถูกต้องหลังทำ stock in, stock out, adjustment และ transfer
- ระบบป้องกัน stock ติดลบได้
- ผู้ใช้สามารถดูประวัติ movement ย้อนหลังได้
- ผู้ใช้สามารถเห็นสินค้า low stock ได้ชัดเจน
- ระบบสามารถใช้งาน workflow หลักได้โดยไม่ต้องพึ่ง Excel

## Acceptance Criteria for MVP

MVP จะถือว่าเสร็จเมื่อ:

- ผู้ใช้ login และ logout ได้
- ระบบรองรับ role พื้นฐานอย่างน้อย Admin และ Staff
- Admin สามารถสร้างและแก้ไขสินค้าได้
- Admin สามารถสร้าง category และ location ได้
- Staff สามารถรับสินค้าเข้าได้
- Staff สามารถจ่ายสินค้าออกได้
- Staff สามารถโอนสินค้าระหว่าง location ได้
- ผู้ใช้ที่มีสิทธิ์สามารถปรับยอดสินค้าโดยระบุเหตุผลได้
- ระบบป้องกันการจ่ายออกหรือโอนเกินยอดคงเหลือได้
- ระบบแสดง inventory balance ปัจจุบันได้
- ระบบแสดง low stock ได้
- ระบบแสดง stock movement history ได้
- ข้อมูลสำคัญไม่ถูกลบถาวรเมื่อมีประวัติ movement

## Open Questions

- จะใช้ระบบนี้สำหรับธุรกิจประเภทใดเป็นหลัก
- ต้องมี supplier ตั้งแต่ MVP หรือไม่
- ต้องมีการ export report เป็น Excel หรือ PDF ตั้งแต่ MVP หรือไม่
- ต้องมี approval flow สำหรับ stock adjustment หรือไม่
- ต้องรองรับหลายสาขาหรือหลายคลังตั้งแต่แรกหรือไม่
- ต้องรองรับหน่วยนับหลายแบบต่อสินค้าเดียวกันหรือไม่
- ต้องคิดต้นทุนสินค้า เช่น FIFO หรือ average cost หรือไม่

## Future Enhancements

- Purchase order
- Supplier management เต็มรูปแบบ
- Barcode scanner
- Stock counting workflow
- Approval workflow สำหรับ adjustment
- Import/export Excel
- Advanced reports
- Costing method เช่น FIFO หรือ weighted average
- Audit log แบบละเอียด
- Notification ผ่าน email หรือ LINE
- Mobile responsive workflow สำหรับพนักงานคลัง
- Integration กับ POS หรือ accounting software
