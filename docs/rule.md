# Rules: Warehouse Management System

กฎต่อไปนี้เป็น invariants ของ Prisma schema และ runtime code สำหรับผู้พัฒนาที่แก้การจอง การจ่าย การคืน หรือการอนุมัติ อ่านภาพรวมใน [PRD](prd.md) และจุดบังคับใช้ใน [Design](design.md)

## 1. ข้อมูลและประวัติ

- Runtime ใช้ PostgreSQL; CSV/SharePoint เป็น import/bootstrap input
- Business workflow ไม่ลบสินค้า ประวัติ Approval, Movement, Return และเอกสารต้องตรวจสอบย้อนหลังได้
- เก็บ snapshots ของชื่อ/ตำแหน่ง ณ เวลาอนุมัติเพื่อใช้ตรวจสอบย้อนหลัง
- UUID เป็น Internal Key ไม่ใช่เลขเอกสารที่แสดงต่อผู้ใช้

## 2. Role และ Permission

- RoleCode จริง: ADMIN, STOREMAN, USER
- Storeman และ Warehouse Manager กำหนดในบริบทของคลัง
- canView/canManage เป็นสิทธิ์รายคลัง; Admin ไม่ได้มีสิทธิ์เริ่มคืนแทน requester โดยอัตโนมัติ
- Approval ต้องเป็น assigned user ของ current step และผ่าน permission/context ที่ Server ตรวจ
- Organization Assignments รองรับหลายตำแหน่ง, Active/Primary
- Project Lead อ้าง membership ปัจจุบัน; ผ่านแล้วเก็บ snapshots เดิม การเปลี่ยน Lead ไม่ reopen ขั้นที่จบไปแล้ว

## 3. สินค้าและ Tracking

- SERIAL เมื่อ AssetModel.isSerialized=true และ Asset มี Serial Number; จำนวนรายชิ้นเท่ากับ 1
- หากไม่มี Serial Number ให้ทำงานเป็น QUANTITY แม้ Model เป็น Serialized
- โหมดติดตามสินค้าเป็นค่าคำนวณจาก Model และ Serial Number; จำนวน Quantity Pool ใช้ `assetQuantity`
- NEW/USED เป็น AssetCondition แยกจาก AssetStatus; ห้ามสร้าง Model Used ใหม่ใน Flow คืน
- AssetStatus: READY, REQUEST, BORROW, USING, SOLD, FAIL, LOST, NEED_CHECK
- เริ่มขอสินค้า READY ที่มี Available ตามสิทธิ์/เงื่อนไข; SOLD เป็น terminal state ของ serialized asset
- การลบ Master/Asset/คลังต้องผ่าน administrative guards; คลังที่มี active asset ห้ามลบ

## 4. Quantity Accounting

- `IN_USE = issued - resolved`: จำนวนที่จ่ายจริงและยังไม่มี Outcome ที่อนุมัติและ Post สำเร็จ
- `Open Quantity = requestedQuantity - approved outcomes - pending outcomes` สำหรับ TransactionItem ที่จ่ายแล้ว โดยไม่นำรอบที่ Reject/Cancel มาหัก
- `Reserved = active AssetReservation + open TransactionItem ที่ยังไม่ dispatched` สำหรับ Quantity Pool
- `Available = max(0, assetQuantity - Reserved)`; Serial มี Available เท่ากับ 1 เฉพาะ READY ที่ไม่มี open request/lock
- requestedQuantity เป็นจำนวนเต็มบวกและไม่เกิน Available
- Draft ใช้ AssetReservation; Serial ใช้ lock owner/time
- ก่อนจ่าย Available หัก draft reservations และ open transaction items ที่ dispatchedAt ยังว่าง
- เมื่อจ่ายจริงลด On-hand แล้ว ไม่หักยอดของที่ dispatched ซ้ำจาก On-hand
- RETURN/USED เพิ่ม On-hand เมื่อ final approval ของรอบคืนผ่านครบ ไม่ใช่ตอน Submit หรือ Lead ผ่าน
- FAIL/LOST ไม่เพิ่ม Ready stock; SOLD จากของที่เบิกแล้วไม่ตัด On-hand ซ้ำ
- จำนวนอนุมัติแล้ว + จำนวนรอในรอบที่ยังมีผลต้องไม่เกินที่เบิก; rejected/cancelled/revised history ไม่ทำให้จองซ้ำ
- Concurrency ต้องไม่สร้างรอบคืนซ้ำหรือลง Movement ซ้ำ

## 5. เลขคำขอ

- รูปแบบ REQ-YYYYMMDD-XX, วันที่ Asia/Bangkok, running reset รายเดือนและจำกัด 99
- ตัวนับรวม Transaction และ ReturnBatch ภายใต้ monthly advisory lock
- Draft ไม่จองเลข; Reject/Edit/Resubmit ของรายการเดิมคงเลข
- รอบคืนใหม่ใช้ REQ ใหม่ ส่วน revision ของรอบคืนใช้เลขเดิม
- Derived SOLD ไม่ consume running ใหม่ ใช้ From REQ ของต้นทางเพื่อแสดงผล
- Internal UUID ยังใช้ใน relation/URL ได้ แต่ไม่ fallback มาแสดงเป็น Request No.
- Cancel เก็บเลขและประวัติ ไม่คืนเลขให้รายการใหม่

## 6. การเบิกและอนุมัติ

- USING ต้องเป็น Internal; BORROW/SOLD ต้องเลือก Service หรือ Project อย่างใดอย่างหนึ่ง
- Submit เก็บ requester confirmation ที่ sequence 1; approval gate เริ่ม sequence 2
- Project request เพิ่ม Lead Project และอาจเพิ่ม Supervisor ตาม staff-tag ของ requester
- Storeman ทุกคนที่ได้รับมอบหมายทุกคลังต้องผ่านก่อน Post แบบ atomic
- SOLD เพิ่ม BSD_STAFF เพื่อราคาและ Final Sale Approval
- Warehouse Manager และ BSD เป็นผู้รับทราบตามงานที่กำหนด; ไม่ใช่ Approval Gate ของการจ่าย BORROW/USING
- ACK_BSD / ACK_WAREHOUSE_MANAGER แยกจาก Approval ไม่บล็อก Post หรือ Source Completion
- Approval จริงต้องมีลายเซ็นและ snapshots; Auto-approve ไม่ใช้ข้าม Manual Check, Signed Evidence, Final Storeman หรือ BSD Price Gate
- หากหา approver ที่จำเป็นไม่พบให้แจ้ง configuration error ไม่ข้ามขั้นเงียบ ๆ

## 7. Reject / Edit / Cancel

- Reject ต้องมีเหตุผลและรักษาประวัติ
- Requester แก้ PENDING ได้ก่อน Approval จริง sequence >1 สำเร็จ
- REJECTED แก้/เพิ่มสินค้า/ส่งใหม่ด้วยเลขเดิมได้ แม้มี approved history รอบเก่า; สร้าง current cycle ใหม่
- ตรวจ Availability และสิทธิ์ใหม่เมื่อแก้ ไม่ถือ approval เก่าเป็นการผ่านรอบใหม่
- Cancel Request และ Return Batch มี API แล้ว ต้องตรวจ requester/approval/posting guards
- รายการที่ Post สำเร็จแล้วไม่ย้อนแก้จำนวน/ราคาโดยเขียนทับประวัติ

## 8. Return และเอกสาร

- Requester เดิมเท่านั้นที่เริ่มคืน Borrow/Using ที่ยังเปิดอยู่
- ReturnBatch เก็บ requestNo/revision/state; Outcome เก็บจำนวนและผลคืน
- UI คืนรองรับ RETURN, SOLD, FAIL, LOST; Quantity เพิ่ม USED ได้ Serialized ห้าม USED
- RETURN map เป็น READY; Quantity RETURN เข้า condition NEW และ USED เข้า condition USED; Serial RETURN กลับ Asset รายชิ้นเป็น READY โดยไม่เพิ่ม Quantity Pool
- Project return ใช้ Lead; non-project return ใช้ Supervisor ตาม routing ของรอบคืน
- ผ่าน RETURN_CHECK ทุกคลังก่อน Final Storeman
- FAIL/LOST/USED ต้องมี Condition Report และ uploaded wet-signed PDF ก่อน final approval
- รอบที่มีเพียง RETURN/SOLD ไม่บังคับเอกสารเสียหาย
- Stock Code รับคืนต้องเป็นสินค้ารุ่นเดียวกัน คลังตรง และผ่าน server validation; ใช้ bucket condition เดิมถ้ามี ไม่ออก Stock Code ใหม่เอง
- Non-SOLD Post เมื่อ Storeman final ครบ; Derived SOLD เชื่อมกับ Outcome ตอน Submit รอบคืน รอ BSD Staff และไม่ Post ผลคืนซ้ำ
- Source COMPLETED ต่อเมื่อทุกจำนวน resolve สำเร็จ
- ผู้ Login ทุกคนดู uploaded Signed PDF ได้ แต่การ Check/Generate/Upload/Approve ต้องมีสิทธิ์
- PDF สูงสุด 10 MiB; multipart envelope จำกัด 10 MiB +64 KiB; เก็บหลักฐาน revision เก่า

## 9. ราคา

- BSD_STAFF เป็นผู้กรอก/อนุมัติราคาขาย ทั้งขายตรงและ Derived SOLD
- รองรับหลาย Sale Price Groups, Split/Remove และ Save Draft
- Unit Price ไม่ติดลบและทศนิยมไม่เกิน 2 ตำแหน่ง; จำนวนเป็น integer
- Group Total และ Grand Total เป็นผลคำนวณ ไม่ใช่ยอดที่ผู้ใช้แก้เอง
- Server คำนวณด้วยหน่วยสตางค์และเก็บ Decimal(12,2); ไม่เชื่อ totals จาก Client
- Draft เว้นราคาได้ แต่ Approval ต้องมีราคาครบและจำนวนกลุ่มตรง item

## 10. UI และ Authentication

- Project รวมแสดง Customer-Projectname (ID); เฉพาะคอลัมน์ Project Name หน้า Project แสดงชื่อ
- Search suggestion/Enter trigger search; X ล้าง q และคง filters อื่น
- Filter Dropdown auto-apply; Side Sheet ไม่ปิดหลังเลือกและไม่มี Apply; Parent เลือก/ปลด Child ทั้งหมด
- Click Outside/Escape ปิดเมนูที่ใช้ behavior ส่วนกลาง; ไม่เหมารวมว่ากล่องแก้ไขทุกแบบยอมทิ้งข้อมูลเมื่อคลิกนอก
- Note/Remark ของ Asset Detail ซ่อน UUID ในการแสดงผล ข้อมูลอ้างอิง/audit ในฐานข้อมูลยังอยู่
- USED auto remark อ้างเลขคำขอจริง ไม่เดาเลขเมื่อไม่มี relation
- AD Email ต้อง Verify ก่อนบันทึกบัญชี AD; ไม่เก็บ AD password
- Local Admin แยกโหมด ไม่มี AD fallback, ไม่มี default password และต้องมี Active/ADMIN/passwordHash
- Login rate limits/audit และวิธีตั้งรหัสฉุกเฉินดู [Emergency Local Login](emergency-local-login.md)
