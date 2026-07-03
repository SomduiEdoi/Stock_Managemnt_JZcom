# กฎของระบบ

อัปเดตล่าสุด: 2026-07-03

## Core Data Rules

- PostgreSQL เป็น runtime source of truth เพียงตัวเดียว
- CSV/SharePoint ใช้เฉพาะสำหรับ initial migration/bootstrap
- หลัง migration แล้ว runtime pages และ APIs ห้ามอ่านข้อมูลจาก CSV/SharePoint อีก

## การเข้าสู่ระบบ

- ใช้ login flow เดิมไปก่อน
- Microsoft 365, Azure AD, LDAP และ SSO เป็น future enhancements
- ทุก mutating API ต้อง validate authenticated user และ permission ที่ server-side

## Roles และ Tags

- `ADMIN` จัดการได้ทุก domain, user, project, category, type, asset, approval และ report
- `STOCK_CONTROLLER` จัดการได้เฉพาะ domain ที่ได้รับมอบหมาย และเห็น domain อื่นแบบ read-only
- `USER` ดู assets/logs และสร้าง request ได้
- ระบบมี system role แค่ 3 ตัวเท่านั้น: `ADMIN`, `STOCK_CONTROLLER`, `USER`
- Scope ของ Stock Controller กำหนดด้วย domain permission tags เช่น `SERVER` และ `NETWORK`
- Organization level tags ได้แก่ `EXECUTIVE`, `MANAGER`, `SUPERVISOR`, `STAFF`
- Organization unit tags ได้แก่ `BSD_MANAGER`, `BSD_STAFF`, `SCN_MANAGER`, `S1_SUPERVISOR`, `S1_STAFF`, `N1_SUPERVISOR`, `N1_STAFF`, `C1_SUPERVISOR`, `C1_STAFF`, `DL_MANAGER`, `DL_STAFF`, `EN_MANAGER`, `CMS_SUPERVISOR`, `CMS_STAFF`, `SD_SUPERVISOR`, `SD_STAFF`
- Project tags ได้แก่ `LEAD_PROJECT`, `TEAM_MEMBER`
- `USER` คนใดก็สามารถเป็น `LEAD_PROJECT` หรือ `TEAM_MEMBER` ได้ผ่าน project membership
- BSD เป็น organization/approval context ไม่ใช่ system role แยก

## Domains

- Domains ต้องเป็น dynamic data
- Initial domains คือ Server และ Network
- อนาคตสามารถเพิ่ม domains สำหรับฝ่ายอื่นได้
- Category และ type ต้อง belong to domain
- Admin สร้าง/แก้ไข domain/category/type ได้
- Stock Controller สร้าง/แก้ไข category/type ได้เฉพาะ assigned domain

## การ Track Asset

- Asset tracking method คือ `SERIAL` หรือ `QUANTITY`
- `SERIAL` asset มี quantity เป็น 1 และควรมี serial number
- `QUANTITY` asset ใช้ `asset_quantity` และอาจไม่มี serial number
- `transactions_items` ต้องเก็บ `requested_quantity`
- Request ห้าม reserve quantity เกินจำนวนที่ available

## Asset Status Rules

- Valid statuses: `READY`, `REQUEST`, `BORROW`, `USING`, `SOLD`, `FAIL`, `LOST`, `NEED_CHECK`
- `READY` สามารถถูก request ได้
- `REQUEST` หมายถึงมีคน request asset นั้นแล้ว หรือ quantity ถูก reserve แล้ว
- `BORROW` หมายถึงการยืมชั่วคราว
- `USING` หมายถึงการเบิกใช้ภายในบริษัท
- `SOLD` เป็น terminal status สำหรับ normal workflow
- `FAIL` สามารถกลับเป็น `READY` ได้หลังซ่อม/ตรวจสอบ
- `LOST` ไม่สามารถถูก request ได้
- `NEED_CHECK` ต้องถูก resolve ไปเป็น `READY`, `FAIL`, หรือ `LOST`
- ทุก status change ต้องเขียน `asset_status_history`

## Request Lock Rules

- Request ทำงานเหมือน cart
- User สามารถ request หลาย assets ใน transaction เดียวได้
- Request เดียวสามารถรวม Server, Network หรือ future domain items ได้
- Serial asset ต้องถูก set เป็น `REQUEST` ทันทีหลังคลิก request
- Quantity asset ต้อง reserve ตาม requested quantity ทันที
- User คนอื่นยังเห็น requested assets ได้ แต่ request asset/quantity ที่ถูก lock อยู่ซ้ำไม่ได้
- Submit จะเริ่ม approval และคง lock/reservation ไว้จนกว่า approval จะจบ
- Reject หรือ cancel ต้อง release lock/reservation เว้นแต่มีการ resubmit

## Approve Rules

- Requester ที่เป็น `STAFF` ต้อง route ไปที่ `SUPERVISOR` ของทีมตัวเอง
- Requester ที่เป็น `SUPERVISOR` ต้อง route ไปที่ department `MANAGER`
- Requester ที่เป็น `MANAGER` หรือ `EXECUTIVE` ให้ skip business approver tier
- Project-bound request ที่ requester เป็น `TEAM_MEMBER` ต้อง route ไปที่ project `LEAD_PROJECT`
- ถ้า requester เป็น `LEAD_PROJECT` ของ project นั้นอยู่แล้ว ให้ skip project approver tier
- Transaction ที่มีหลาย domains ต้องได้รับ approval จาก Stock Controller ของทุก domain ที่เกี่ยวข้อง
- Multi-domain Stock Controller approvals สามารถ run parallel ได้
- `BORROW` และ `USING` ต้องผ่าน `BSD_STAFF`
- `RETURN` และ `SOLD` ต้องผ่าน `BSD_STAFF -> BSD_MANAGER`
- Reject ต้องมี reason
- Approval state ต้องแยกจาก business status
- ต้อง snapshot ชื่อ/tag ของ approver เพื่อ audit

## Transaction Rules

Approval State

- `PENDING` = รออนุมัติ (อยู่ระหว่างการพิจารณา)
- `APPROVED` = อนุมัติแล้ว
- `REJECTED` = ปฏิเสธคำขอ
- `IN_PROGRESS` = อยู่ระหว่างดำเนินการ (ใบคำขอนี้มีผลสัมฤทธิ์ ณ ปัจจุบัน)
- `COMPLETED` = คำขอเสร็จสมบุรณ์ 

## Return และ Sold Outcome Rules

- Return ต้องผ่าน Stock Controller approvals ที่จำเป็น และ `BSD_STAFF -> BSD_MANAGER`
- Approved borrow/using return ต้อง set asset เป็น `READY` หรือ restore quantity
- Sold outcome ต้องผ่าน Stock Controller approvals ที่จำเป็น และ `BSD_STAFF -> BSD_MANAGER`
- Approved sold outcome ต้อง set asset เป็น `SOLD`
- Sold asset ห้ามถูก borrow, request หรือ set เป็น using อีกผ่าน normal workflow
- ตอน return ผู้ใช้สามารถเลือก Lost/Fail 


## Transaction History

- Transaction History เห็นได้โดย authenticated users ทุกคน
- ต้องรวมทุก queue, pending approvals, rejected transactions, completed transactions, ทุก projects และทุก users
- UI ต้องมี filters สำหรับ project, requester, type, status และ action
- Action column ต้องแสดงเฉพาะ action ที่ permission และ current status อนุญาต

## Asset Detail

- Asset detail page ต้องแสดง asset fields ทั้งหมด
- ต้องแสดง current status และ availability
- ต้องแสดง asset status history
- ต้องแสดง related transaction history

## การ Generate Code

- Stock code format: `xx-yy0000`
- `xx` คือ domain prefix เช่น `SV` หรือ `NW`
- `yy` คือ type code
- `0000` คือ sequence
- Requisition format: `REQ-yyyymmdd-00`
- Stock code และ requisition number ต้อง unique

## ความถูกต้องของข้อมูล

- ห้าม delete assets 
- ห้าม duplicate serial numbers สำหรับ active serialized assets
- ห้ามใช้ category/type จากคนละ domain กับ asset
- ห้ามให้ quantity ต่ำกว่า zero
- Approval, status และ quantity changes ทั้งหมดควรทำแบบ transactional
