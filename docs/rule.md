# Rules: Warehouse Management

อัปเดตล่าสุด: 2026-09-02

## 1. Naming Rules

- ชื่อระบบคือ Warehouse Management
- ใช้คำว่า `Warehouse` สำหรับคลังหรือกลุ่ม asset ทั้งใน code, schema, API, UI และเอกสาร
- ใช้คำว่า `Inventory` ได้เมื่อหมายถึงหน้าตารางหรือรายการ asset
- Server และ Network เป็น Warehouse เริ่มต้น ไม่ใช่ขอบเขตถาวรของระบบ

## 2. Source of Truth Rules

- CSV ใช้เป็น master data
- เมื่อ migration สำเร็จ runtime ต้องอ่านและเขียน PostgreSQL เท่านั้น
- Transaction, approval, reservation และ status change สำคัญต้องมี audit trail

## 3. Asset Rules

- Asset ต้องไม่ถูกลบจากระบบใน workflow การ request, borrow, using, sold, return, fail, lost หรือ need check
- การลบ master record เป็น administrative operation ที่ต้องตรวจ permission และ dependency แยกจาก business workflow
- `READY` เท่านั้นที่เริ่ม request ได้
- `REQUEST` หมายถึง asset แบบ Serial ถูก lock หรือ Quantity ถูก reserve จนไม่มีจำนวนพร้อมใช้
- `BORROW` และ `USING` เกิดหลัง approval ครบ
- `SOLD` เป็น terminal status
- `FAIL`, `LOST`, `NEED_CHECK` ต้องมีเหตุผลและ status history
- ทุกการเปลี่ยนสถานะต้องบันทึก `asset_status_histories`

## 4. SERIAL / QUANTITY Rules

- `SERIAL` track รายตัว ต้องมี serial number และมี quantity เท่ากับ 1
- `QUANTITY` track เป็นจำนวนและไม่บังคับ serial number
- Request ของ Quantity ต้องระบุ `requestedQuantity` และห้ามเกิน available quantity
- Availability คำนวณจาก total quantity หัก draft reservation และ open transaction items
- การ reject หรือแก้ไขคำขอต้องคืน reservation ที่ไม่ใช้งาน
- Partial return ต้องคืนเฉพาะจำนวนของ item ที่ได้รับอนุมัติแล้ว

## 5. Status Rules

| Transaction Type | Business Status |
| --- | --- |
| `BORROW` | `BORROWED`, `RETURNED` |
| `USING` | `USING`, `RETURNED` |
| `SOLD` | `COMPLETED` |

Workflow status มีเพียง `PENDING`, `IN_PROGRESS`, `REJECTED`, `COMPLETED`

## 6. Requisition No. Rules

- Transaction ใช้เลข `REQ-YYYYMMDD-XX`
- `XX` เป็นเลขสองหลักและ reset รายเดือนโดยนับจาก prefix `REQ-YYYYMM`
- การสร้างเลขต้องทำใน database transaction และแจ้ง error เมื่อเกิน 99 รายการต่อเดือน

## 7. Approval Rules

- Approver approve/reject ได้เฉพาะ current step และต้องมีลายเซ็นก่อน approve
- Approval ตรวจทั้ง assigned user, Organization Assignment ที่ active, project membership และ Warehouse controller tag
- Organization request: `STAFF -> SUPERVISOR` และ `SUPERVISOR -> MANAGER`; Manager/Executive ข้าม tier นี้
- Project request จาก Team Member ต้องผ่าน Lead Project
- ทุก Warehouse ใน transaction ต้องมี `STOCK_CONTROLLER:<WAREHOUSE_CODE>` และ `HEAD_STOCK_CONTROLLER:<WAREHOUSE_CODE>`
- Approval หลาย Warehouse ใน sequence เดียวกันทำแบบ parallel และต้องครบทุก Warehouse ก่อนเลื่อนไป sequence ถัดไป
- Borrow, Using, Sold และ Return ต้องผ่าน `BSD_STAFF` แล้วจึงผ่าน `BSD_MANAGER`
- SOLD price ต้องถูกกรอกโดย `BSD_STAFF` ก่อนอนุมัติ step ของตน
- Reject ต้องมีเหตุผล; request ปกติต้อง release lock/reservation
- Requester แก้ไข request ได้เมื่อเป็น `PENDING` หรือ `REJECTED` และยังไม่มี approval ใดสำเร็จ
- User หนึ่งคนมี Organization Assignment ได้หลายรายการ โดยแต่ละรายการมี Organization Tag และ Organization Level ของตน
- User มี primary assignment ที่ active ได้ไม่เกินหนึ่งรายการ
- ถ้า User มีหลาย assignment ระบบต้องใช้ request context ที่ผู้ใช้เลือก หรือใช้ primary assignment เมื่อไม่มีการเลือก
- ถ้า User คนเดียวเป็น approver ของหลาย sequence ที่ติดกัน ให้ manual approve ครั้งเดียวและ auto-approve sequence ถัดไปของบุคคลเดียวกัน
- Auto-approved step ต้องมี Approval History แยก, required tag ที่ถูกต้อง, timestamp และเหตุผลว่าอนุมัติอัตโนมัติจาก step ก่อนหน้า

## 8. Return Rules

- Return ทำได้เฉพาะ `BORROW` หรือ `USING` ที่มี workflow เป็น `IN_PROGRESS`
- ผู้เริ่ม Return ต้องเป็น requester เดิมหรือ Admin
- Return ทำได้ทั้งรายการหรือราย item
- การเลือก `READY` ต้องสร้าง derived Return transaction ที่เป็น `PENDING`; ห้ามคืน asset เป็น `READY` ทันที
- การเลือก `SOLD` ต้องสร้าง derived SOLD transaction และให้ BSD Staff กรอกราคา
- Derived transaction ต้องผ่าน approval chain เดียวกับ action อื่น รวม `BSD_STAFF` และ `BSD_MANAGER`
- Source transaction คงเป็น `IN_PROGRESS` จน item ถูก resolve ครบ แล้วจึงเป็น `COMPLETED`
- ห้ามสร้าง Return/Sold derived transaction ซ้ำสำหรับ item ที่มีรายการ pending อยู่แล้ว
- Return outcome `FAIL`, `LOST`, `NEED_CHECK` ยังเป็น target; ปัจจุบันใช้ manual status management แยกจาก return flow

## 9. Log / Visibility Rules

- Transaction History เป็น internal public view เห็นคำขอ งานรออนุมัติ รายการกำลังดำเนินการ และรายการเสร็จของทุกคนทุก Project
- ใช้ scope, status และ search/filter เพื่อแยกข้อมูล ไม่ซ่อนประวัติตามเจ้าของรายการ
- Log ต้องแสดง Request No., requester, request date, return date, type, business status และ workflow status ที่เกี่ยวข้อง
- Derived Return/Sold transaction ต้องเชื่อมกลับ Source Transaction ได้

## 10. Warehouse and Permission Rules

- Warehouse, Category, Type, permission และ approval routing ต้องอ่านจาก PostgreSQL
- Logic กลางห้ามจำกัดเฉพาะ `SERVER` และ `NETWORK`; dedicated page สำหรับสอง Warehouse นี้มีได้เพื่อ UX
- Admin จัดการ Warehouse และ master data ได้ทุก Warehouse
- Stock Controller จัดการ asset/category/type เฉพาะ Warehouse ที่มี `canManage`
- Warehouse prefix กำหนดตอนสร้างและไม่แก้ภายหลัง
- Stock code ใช้รูปแบบ `XX-YYY0000` จาก Warehouse prefix และ Type code
- ห้ามลบ Warehouse ขณะที่ยังมี active asset

## 11. Project Rules

- Project และ Project Member ต้องเก็บใน PostgreSQL
- User คนเดียวเป็น Lead Project หรือ Team Member ได้โดยไม่ขึ้นกับ organization level
- Admin สร้าง Project ได้; Admin และ Lead Project ที่เกี่ยวข้องแก้ไขสมาชิกหรือสถานะ Project ได้
- Project request ต้องอ้างอิง Project จริงและใช้ membership ปัจจุบันในการหา approver
- Project Approval ต้องอ้างอิง Lead Project ปัจจุบัน ไม่ล็อก Lead ตั้งแต่วันที่สร้าง Transaction
- เมื่อเปลี่ยน Lead ต้องโอน pending Project Approval ของ transaction ที่ยัง `PENDING` ไปยัง Lead ใหม่ทันที
- Lead ที่ถูกถอดต้องหมดสิทธิ์อนุมัติ pending assignment เดิมทันที
- Project ที่มี Lead หลายคนต้องได้รับอนุมัติจาก Lead ที่ active ครบทุกคน
- Approval ที่สำเร็จแล้วต้องคงชื่อ, tag, signature และ timestamp เดิมไว้เป็น audit history
- ถ้า Project sequence ยังไม่จบ การเพิ่ม Lead ใหม่ทำให้ Lead ใหม่นั้นต้องอนุมัติด้วย
- ถ้า Project sequence จบแล้วและ workflow ไปขั้นถัดไป ห้าม reopen sequence เพราะเปลี่ยน Lead
- ทุกการเพิ่ม ถอด หรือเปลี่ยน Lead ต้องมี audit history ระบุผู้ดำเนินการและเวลา

## 12. Organization Assignment Rules

- Organization Level และ Organization Tag ต้องเก็บต่อ assignment ไม่เก็บเป็นค่าเดียวของ User ใน target model
- Tag ที่รองรับต้องอ้างอิงโครงสร้าง Executive, Solution Consult, Customer Service, Delivery & Client และ BSD
- Project Tag และ Stock Controller Tag ไม่ใช่ Organization Assignment และต้องแยก permission context
- การปิด assignment ต้องไม่ลบ Approval History เดิม
- Approval ต้องเก็บ snapshot ของ tag/ตำแหน่ง ณ เวลาที่อนุมัติ เพื่อไม่ให้ประวัติเปลี่ยนเมื่อย้ายทีม
- ถ้าไม่มี Supervisor ในทีม workflow ต้องข้ามไป Manager ของสายงานตาม mapping ที่กำหนด ห้ามปล่อย transaction ค้างเพราะหา tag ไม่พบ

## 13. PDF Rules

- Transaction PDF ต้องอ่านข้อมูลจาก PostgreSQL และแสดง Request No., items, approval/signature snapshot และข้อมูล Return/Sold
- Asset Detail ต้องสามารถ export PDF ได้ แต่การเชื่อมปุ่ม/endpoint ยังเป็นงานค้าง
- Official format ของใบยืม/คืนให้ปรับเมื่อได้รับ template สุดท้าย

## 14. Code Maintenance Rules

- Prisma schema, migration, runtime code และเอกสารต้องใช้คำและสถานะชุดเดียวกัน
- เมื่อเปลี่ยน enum/status ต้องตรวจ schema, migration, badge, filter, PDF และ tests
- เมื่อเปลี่ยน approval chain ต้องเพิ่ม test สำหรับ role/tag, multi-Warehouse และ derived Return
- การย้ายจาก organization tag เดียวเป็นหลาย assignments ต้องมี data migration และ backward compatibility plan
- Migration เปลี่ยนชื่อ Domain เป็น Warehouse ต้องตรวจ backup และข้อมูลจริงก่อน deploy
