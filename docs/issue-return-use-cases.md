# Use Cases และ Flow: การเบิก การคืน และการขายสินค้า

เอกสารนี้แสดงกรณีใช้งานของ [PRD](prd.md), [Rules](rule.md) และ [Design](design.md) สำหรับการเบิก การคืน และการขาย

### กฎร่วมของ Flow

- System roles คือ ADMIN / STOREMAN / USER; ไม่มี Head หรือ BSD Manager เป็น approval gate
- การเบิก Project เพิ่ม Lead และอาจเพิ่ม Supervisor อีกขั้นตาม staff tags ของ requester ไม่ใช่เลือกอย่างใดอย่างหนึ่งเสมอไป
- การคืนใช้ ReturnBatch มี revision/check/evidence/final Storeman; เฉพาะ SOLD สร้าง derived sale รอ BSD Staff
- ราคาแบ่งกลุ่มได้: Group total = quantity x unit price และ Grand Total รวมทุกกลุ่ม คำนวณหน่วยสตางค์แล้วแสดง 2 ตำแหน่ง ช่อง totals อ่านอย่างเดียว; Draft ยังไม่ครบราคาได้ แต่อนุมัติต้องครบ
- เลข REQ นับทั้ง Transaction และ ReturnBatch ร่วมกันรายเดือน; derived sale แสดง From REQ ต้นทาง ไม่แสดง UUID เป็นเลขคำขอ
- การตรวจสอบผลทดสอบอยู่ใน [Verification](workflow-implementation-verification.md) แยกจากข้อกำหนด Use Cases

## 1. แหล่งอ้างอิงและลำดับความสำคัญ

เอกสารที่กำหนดบริบทของ Use Cases:

- [prd.md](./prd.md): Asset, Transaction Status, Request No., Approval, Derived Return/Sold และ Project
- [rule.md](./rule.md): Permission, Reservation, Partial Return, Warehouse, Audit และ Project Lead
- [design.md](./design.md): Transaction/Item/Approval, Source Transaction และ Derived Transaction
- [schema.prisma](../prisma/schema.prisma): Entities, relations และ enums
- [workflow.ts](../src/lib/workflow.ts): Approval, Return และ Stock Post

## 2. ขอบเขตและคำศัพท์

| คำ | ความหมาย |
| --- | --- |
| Source Request | คำขอเบิกที่ผู้ขอได้รับสินค้าไปใช้งาน |
| Return Request / Return Batch | คำขอคืนรอบหนึ่ง อ้างอิงคำขอเบิกและเลือกคืนเฉพาะบางรายการ/บางจำนวนได้ |
| Derived Sold | รายการขายที่เกิดจากสินค้าที่เบิกไปแล้ว เชื่อม Source Request และ Return Outcome |
| Item | รายการสินค้าในคำขอ ไม่เท่ากับสินค้าหนึ่งชิ้นเสมอไป เพราะ Quantity Item มีหลายชิ้นได้ |
| Outcome | ผลจำแนกสินค้าและจำนวนที่ต้องการปิดการถือครอง เช่น RETURN 2, USED 3, FAIL 10 |
| Warehouse | คลังต้นทางหรือคลังปลายทางที่ระบบกำหนดสิทธิ์ |
| Stock Code | รหัสสต๊อกที่มีอยู่แล้ว ใช้เลือกแถวสต๊อกสำหรับรับกลับ |
| On-hand / Stock | จำนวนสินค้าที่อยู่ในคลังจริงตามบัญชีสต๊อก |
| Reserved | จำนวนพร้อมใช้ที่ถูกกันไว้สำหรับ Cart/คำขอรออนุมัติ |
| Available | จำนวนที่ผู้อื่นสามารถขอได้ หลังหักยอดจอง |
| IN_USE | จำนวนที่เบิกไปและยังไม่ได้ปิดการถือครองด้วย Outcome ที่อนุมัติสำเร็จ |
| Pending Outcome Quantity | จำนวนที่อยู่ในคำขอคืน/ขายรออนุมัติ ยังไม่ถือว่าปิด IN_USE |
| Open Quantity | จำนวนที่ยังสามารถส่งคืนเพิ่มได้ หลังหัก Outcome ที่สำเร็จและจำนวนที่กำลังรออนุมัติ |
| Acknowledgment | การกดรับทราบ แยกจาก Approval และไม่มีผลต่อ Stock หรือการสำเร็จของคำขอ |

RETURN เป็นผลคืนปกติของ UI ส่วน NEW เป็นสภาพสต๊อกของ Quantity ที่รับคืนปกติ USED คือ Reuse ไม่สร้าง Outcome NEW อีกตัวใน UI

## 3. ผู้เกี่ยวข้องและสิทธิ์

| ผู้เกี่ยวข้อง | หน้าที่และขอบเขต |
| --- | --- |
| Requester | สร้าง/ยืนยันคำขอเบิก และเป็นผู้ขอของ Source Request ที่เริ่มคืน แก้ไข/Cancel ได้ตามเงื่อนไข |
| Lead Project | อนุมัติคำขอประเภท Project ตาม Project และสมาชิกปัจจุบัน |
| Supervisor | อนุมัติคำขอประเภทที่ใช้สายงาน เช่น Internal/Service ตาม Context |
| Storeman | ตรวจจริงและอนุมัติเฉพาะ Warehouse ที่ตนได้รับมอบหมาย เลือก Stock Code รับคืน และอัปโหลด PDF ลงนาม |
| Executive | ลงนามรับรู้เอกสาร FAIL/LOST/USED ด้วย Wet Signature เป็นหลักฐานก่อนอนุมัติสุดท้าย |
| BSD Staff | รับทราบเบิก/คืนทั่วไป และเป็นผู้กรอกราคาต่อหน่วยพร้อมอนุมัติขั้นสุดท้ายของการขาย |
| Warehouse Manager | รับทราบเฉพาะ Warehouse ของตน ไม่ใช่ Approval Gate |
| Admin | จัดการระบบและ Master Data ตามสิทธิ์ การเป็น Admin ไม่ให้สิทธิ์เริ่มคืนแทนผู้ขอเดิม |

- เริ่มคืนได้เฉพาะ requester ของ Source Request การมีสิทธิ์ดู Log ไม่เท่ากับมีสิทธิ์คืนหรืออนุมัติ
- User มีหลาย Organization Assignments ได้ ใช้ assignment ที่ active และ Context ที่ถูกต้อง ไม่ตัดสินสิทธิ์จากชื่อหรือ primary title ที่แสดงอย่างเดียว
- Project ใช้ Lead ที่มีสิทธิ์ขณะนั้น หากมีหลาย Lead ต้องครบทุกคน
- Storeman ที่ต้องอนุมัติทุกคนของ Warehouse ที่เกี่ยวข้องต้องครบ ไม่ใช้กฎใครคนหนึ่งอนุมัติก็พอ
- ไม่ Hardcode ชื่อ bsd, Tanawat หรือบุคคลอื่น ใช้ assignment, Warehouse permission และ Approval ที่ได้รับมอบหมาย
- Approval API และ UI ต้องใช้กฎสิทธิ์เดียวกัน ตรวจบน Server ทุกครั้ง

## 4. ประเภทสินค้าและ Stock Code

### 4.1 Serialized

- ใช้ `AssetModel.isSerialized = true` และ Asset มี Serial Number; ถ้าไม่มี Serial Number ให้ทำงานแบบ Quantity Pool
- มี Serial Number ติดตาม Asset รายชิ้น จำนวนต่อ Asset เท่ากับ 1
- การเบิก/คืน/ขายอ้างอิง Asset และ Serial เดิม
- เปลี่ยน/จัดสรร Serial ได้เฉพาะขั้นจัดของก่อนการจ่ายตามสิทธิ์เดิม เมื่อจ่ายแล้ว Return UI/API ห้ามเปลี่ยน Serial
- Outcome คืนเลือกได้ RETURN, SOLD, FAIL, LOST; USED เลือกไม่ได้

### 4.2 Quantity Pool

- ใช้ `AssetModel.isSerialized = false` หรือ Asset ไม่มี Serial Number แม้สินค้าเป็น Serialized; จำนวนคงเหลือใช้ `Asset.assetQuantity`
- เบิกตามจำนวนจำนวนเต็มบวก และแบ่งผลคืนตามจำนวนได้
- Outcome คืนเลือกได้ RETURN, SOLD, FAIL, LOST, USED
- RETURN รับกลับแถวเดิมสภาพ NEW ใน Warehouse เดิม
- USED รับกลับ Stock Code สำหรับ Reuse ที่มีอยู่แล้วและตรงสินค้ากับ Warehouse
- Storeman ยืนยัน Stock Code ปลายทาง ห้ามรับเข้า Warehouse อื่นที่ตนไม่มีสิทธิ์
- ใช้ AssetModel เดิมและ condition NEW/USED ห้ามสร้าง Master Product ด้วยชื่อเติม `(Used)`
- เมื่อมีแถวสต๊อกที่ตรงแล้วต้องเพิ่มในแถวนั้น แม้ยอดเป็น 0; สร้าง stock row ได้เมื่อยังไม่มีแถวที่ตรงจริง และต้องใช้ Stock Code ที่มีอยู่ ไม่ออก Stock Code ใหม่
- ข้อมูล Used เก่าที่แยกเป็นคนละ Master ต้องตรวจ Mapping ให้ถูกต้องก่อนใช้ ไม่จับคู่ด้วยชื่อคล้ายกันอย่างเดียว

## 5. เลขคำขอและความสัมพันธ์ของเอกสาร

### 5.1 เลขคำขอทั่วไป

- ใช้ `REQ-YYYYMMDD-XX`
- XX เริ่ม 01 เป็น running สองหลัก Reset รายเดือน โดยนับกลุ่ม `REQ-YYYYMM`
- สูงสุด 99 เลขต่อเดือน วันที่ในเลขเป็นวันที่สร้างตาม Asia/Bangkok
- Allocate เลขเมื่อ Submit สำเร็จ พร้อมสร้าง Transaction แบบ atomic ป้องกันการสร้างซ้ำ/เลขซ้ำ
- Draft ยังไม่ต้องจองเลข Reject/Edit/Resubmit ใช้เลขเดิม ไม่เริ่มคำขอใหม่และไม่ใช้ running ใหม่
- Cancel คงเลขและประวัติไว้ ไม่คืนเลขให้คำขออื่น
- Return Request รอบใหม่ใช้เลข REQ ใหม่ อ้าง Source Request เดิม; แก้ไขรอบคืนเดิมใช้เลขของรอบนั้น
- การขายจากคลังโดยตรงใช้เลข REQ ตามปกติ

### 5.2 ข้อยกเว้น Derived Sold จากของที่เบิกไปแล้ว

- ไม่จอง running ใหม่ ไม่สร้าง SAL หรือ RTN Prefix เอง
- แสดงเลขอ้างอิง `FROM REQ-20261002-01` เมื่อขายจากคำขอต้นทางเลขนั้น
- มี Internal ID แยกสำหรับ Derived Sold และ Approval รอบขาย แม้หลายรอบใช้ข้อความ FROM เลขเดียวกัน
- เชื่อม Source Request, Return Batch, Transaction Item และ Outcome ที่ขายเพื่อแยกแต่ละรอบ
- PDF ขายเป็นหน้าเพิ่มในชุด PDF ของคำขอเดิม ไม่ออกเป็นชุดไฟล์คำขอใหม่แยกจากต้นทาง
- แบบจำลอง Database ต้องรองรับ Reference Display ที่ซ้ำได้โดยไม่ทำลาย Unique Request No. ห้ามใช้ FROM เป็น Primary Key

## 6. สถานะ: แยก Business, Workflow, Phase และ Outcome

Business/Workflow ให้ยึด Prisma ปัจจุบันตาม Rules ส่วน Phase ด้านล่างเป็นคำอธิบายขั้นตอน ไม่ใช่ Enum ในฐานข้อมูล

### 6.1 Business Status ของ Transaction

| Type | หลังสำเร็จ | เงื่อนไขปิด Source |
| --- | --- | --- |
| BORROW | BORROWED ระหว่างถือครอง; RETURNED เมื่อปิดผลครบ | ทุกจำนวนปิดด้วย Outcome ที่อนุมัติสำเร็จ ไม่มี Pending ค้าง |
| USING | USING ระหว่างถือครอง; RETURNED เมื่อปิดผลครบ | เงื่อนไขเดียวกับ BORROW |
| SOLD | COMPLETED เมื่อ BSD Staff ยืนยันราคาและอนุมัติ | ยังไม่สำเร็จเพียงเพราะ Storeman อนุมัติ |

RETURNED หมายถึงปิดการถือครองครบ อาจมีบางส่วน Sold/Fail/Lost ไม่ได้หมายความว่าทุกชิ้นกลับมาเป็น Stock พร้อมใช้ ต้องอ่าน Outcome ประกอบ

### 6.2 Workflow Status

| Status | ความหมาย |
| --- | --- |
| PENDING | มีการอนุมัติ/ตรวจ/เอกสาร/ราคาค้างอยู่ |
| IN_PROGRESS | Source เบิกได้รับอนุมัติและยังถือครอง/ยังมีผลปิดการถือครองค้าง |
| REJECTED | ส่งกลับ requester เพื่อแก้ไข เป็นคำขอเปิดที่ส่งใหม่ได้ |
| COMPLETED | รอบนั้นบันทึกผลครบ; Source ครบเมื่อทุกจำนวน Resolve สำเร็จ |
| CANCELLED | ยกเลิกคำขอ คงเลขและประวัติ ไม่ใช่สำเร็จ |

Prisma TransactionWorkflowStatus มี CANCELLED แล้ว และหมายถึงจบแบบยกเลิก ไม่ใช่ธุรกรรมสำเร็จ ส่วน DRAFT เป็น lifecycle ก่อนส่งคำขอ ไม่ใช่ TransactionWorkflowStatus; ReturnBatch.state เป็น String แยกต่างหาก

### 6.3 Phase เชิงอธิบาย (ไม่ใช่ชื่อ Enum)

| Phase / UI Label | คำขอ | ผู้ดำเนินการถัดไป | Stock |
| --- | --- | --- | --- |
| DRAFT | ยังร่าง | Requester | เบิกอาจมี Reservation; คืนไม่มีการคืนจริง |
| WAITING_LEAD / SUPERVISOR | Submit แล้ว ผู้ขอยืนยันขั้นแรก | Lead/Supervisor | ไม่ตัด/เพิ่ม Stock |
| WAITING_STOREMAN | Lead/Supervisor ครบ | Storeman ทุกคลัง | ไม่เปลี่ยนจน Approval Gate ครบ |
| WAITING_MANUAL_CHECK | คืนรอตรวจ | Storeman ทุกคลัง | ไม่เปลี่ยน |
| WAITING_SIGNED_PDF | มี FAIL/LOST/USED ตรวจครบ | Storeman Export, Executive ลงนาม, Storeman Upload | ไม่เปลี่ยน |
| WAITING_FINAL_STOREMAN | เอกสารครบหรือไม่มี Outcome ที่ต้องมีเอกสาร | Storeman ทุกคลัง | รอ Final Gate |
| WAITING_BSD_PRICE | ขายผ่าน Storeman แล้ว | BSD Staff | SOLD ยังไม่ Post |
| REJECTED / REVISION | ถูกปฏิเสธ | Requester แก้และ Submit ใหม่ | ไม่ Post รอบที่ถูกปฏิเสธ |
| COMPLETED | รอบนั้น Post สำเร็จ | ผู้รับทราบ | ไม่เปลี่ยนซ้ำ |

### 6.4 Approval, Check และ Acknowledgment

- Submit บันทึก requester confirmation เป็นขั้นที่ 1 พร้อม timestamp, request revision และ signature snapshot เมื่อใช้เอกสาร ไม่ให้ผู้ขอกดอนุมัติตนเองซ้ำ
- Approval แยกสถานะ PENDING, APPROVED, REJECTED และผลยกเลิก/แทนที่ของรอบเก่า พร้อมรอบและผู้ดำเนินการ
- Manual Check เป็นการยืนยันผลตรวจราย Outcome แยกจาก Final Approval
- Signature Document แยกขั้น Generated, Awaiting Wet Signature, Uploaded, Superseded ตาม revision
- Acknowledgment แยก Pending/Received พร้อม actor/time ไม่มีผลต่อ Approval Gate
- ห้าม Auto-approve ข้ามการตรวจจริง, Wet Signature/Upload, Final Storeman หรือ BSD price เพราะเป็นคนเดียวกันหลายหน้าที่

### 6.5 Asset / Stock

- READY: พร้อมใช้; Quantity ต้องอ่านยอด Available ประกอบ
- REQUEST: Serialized ถูก Lock หรือ Quantity ถูก Reserve จนหมด Available ไม่ได้แปลว่าจ่ายแล้ว
- BORROW / USING: Serialized จ่ายแล้ว; Quantity เก็บ IN_USE ในรายการถือครอง แถว Stock ที่ยังมีของอาจคง READY
- SOLD: ปิดขาย ไม่พร้อมขออีก
- FAIL / LOST: ไม่พร้อมขอ ไม่เพิ่ม Available
- NEED_CHECK เป็น AssetStatus ของ Inventory แต่ไม่เป็นตัวเลือกในรอบคืน
- Awaiting approval เป็นสถานะของ Outcome/งานอนุมัติ ไม่ควรใช้ไปเปลี่ยน Asset ต้นทางทุกชิ้นเป็นสถานะเดียวกัน

## 7. Use Case การเบิก BORROW / USING

### UC-I01: เลือกสินค้าและสร้าง Cart

ผู้ขอเลือกสินค้า READY ที่ Available เพียงพอ ระบุจำนวนและวัตถุประสงค์ สามารถเพิ่ม/ลบรายการก่อน Submit

- Serialized: Lock Asset รายตัวตามกฎ Cart เดิม
- Quantity: Reserve ตามจำนวน โดยไม่ลด On-hand จริง
- Cart หลายรายการ/หลาย Warehouse ได้ ไม่ให้ยอดจองเกินของพร้อมใช้
- ลบจาก Cart/ถอน Draft คืน Lock/Reservation ที่เกี่ยวข้อง

### UC-I02: Submit และยืนยันขั้นแรก

1. ตรวจสิทธิ์ Context, Project, Item, Serial, Stock และจำนวนล่าสุด
2. Allocate เลข REQ และสร้าง Items/Approval แบบ atomic
3. บันทึก requester confirmation ขั้นที่ 1
4. คำขอ PENDING ไป Lead Project สำหรับ Project หรือ Supervisor ตามประเภทคำขอ
5. คง Reservation ระหว่างรอ Approval ยังไม่เพิ่ม IN_USE และไม่ตัด On-hand

ผู้ขอแก้หรือ Cancel ได้ก่อน Lead/Supervisor คนแรกอนุมัติ การ Submit ของผู้ขอไม่ใช่ตัวล็อกสิทธิ์นี้

### UC-I03: Lead / Supervisor อนุมัติ

- ผู้ที่ได้รับมอบหมายในขั้นปัจจุบันกดอนุมัติ พร้อมเก็บชื่อ/Tag/Signature/เวลา
- หากมีหลาย Lead ต้องครบทุกคน เมื่อครบจึงเปิด Storeman
- ตาม buildApprovalCandidates ปัจจุบัน Project เพิ่ม Lead และ Supervisor เพิ่มแยกเมื่อ staff tags ของ requester เข้ากฎ จึงอาจต้องผ่านทั้งสองขั้นก่อน Storeman
- หาก Context หา approver ไม่ได้ ให้ใช้สายงานที่กำหนดใน routing; หากยังหาไม่ได้แจ้งปัญหาการตั้งค่า ไม่ข้าม Approval เอง

### UC-I04: Storeman ตรวจและอนุมัติครบทุก Warehouse

1. Storeman ตรวจจริงว่าทุกชิ้นของคลังตนพร้อมจ่ายครบ
2. อนุมัติได้เฉพาะคลังที่ได้รับมอบหมาย
3. Storeman A อนุมัติแต่ B ยังรอ: คำขอยัง PENDING ไม่มีการจ่าย/ตัด Stock/เพิ่ม IN_USE ของ A
4. เมื่อ Storeman ทุกคลังและทุกคนที่ต้องอนุมัติครบ ระบบตรวจ Stock ซ้ำและ Post ทุก Item พร้อมกัน
5. ลด Stock/Reservation และเพิ่ม IN_USE ครบจำนวน ไม่มี Partial Issue
6. Serialized เป็น BORROW หรือ USING; Source เป็น BORROWED/IN_PROGRESS หรือ USING/IN_PROGRESS

การตรวจขั้นสุดท้ายและการ Post ทุกคลังอยู่ใน transaction เดียว หาก Item ใดไม่พร้อมให้ไม่มี Item ใดถูก Post บันทึกประวัติผู้อนุมัติทุกคลังโดยไม่ทำให้เป็นการจ่ายแยก

### UC-I05: Reject ทั้งคำขอ

- Lead/Supervisor หรือ Storeman คลังใดปฏิเสธ ต้องมีเหตุผล
- ถ้า A อนุมัติแล้วแต่ B Reject ถือว่าทั้งคำขอถูก Reject และยังไม่ตัดสินค้าของ A
- แสดง REJECTED ส่งกลับ requester คงเลข REQ เดิม
- Release Lock/Reservation ตามกฎคำขอปกติ สินค้ายังอยู่คลัง
- Approval ที่เคยผ่านเป็นประวัติของรอบเดิม ไม่มีผลอนุมัติในรอบใหม่
- Requester แก้รายการ/จำนวน/Context แล้ว Submit ใหม่ ตรวจ Available และจองใหม่ เริ่ม requester confirmation -> Lead/Supervisor -> Storeman ใหม่ทั้งรอบ

### UC-I06: Edit / Cancel ก่อนผู้อนุมัติถัดไปอนุมัติ

- ทำได้โดย requester ก่อน Lead/Supervisor คนแรกอนุมัติ แม้ผู้อื่นเปิดดูแล้วแต่ยังไม่อนุมัติก็ยังทำได้
- Edit เปลี่ยนข้อมูลแล้วตรวจ Reservation/Availability ใหม่ สร้าง Approval ตาม revision ล่าสุด
- Cancel เก็บเลขและประวัติ คืน Reservation คำขอไม่มีผลจ่าย
- หลัง Lead คนใดคนหนึ่งอนุมัติแล้ว Requester แก้/Cancel โดยตรงไม่ได้ ต้องใช้ Reject กลับมาแก้ตาม Flow
- การ Edit และ Approve พร้อมกันต้องให้สำเร็จเพียง operation ที่ตรง revision ปัจจุบัน

### UC-I07: รับทราบหลังเบิกสำเร็จ

- BSD และ Warehouse Manager ของแต่ละคลังกดรับทราบ
- การรับทราบค้างไม่ทำให้การเบิกกลับเป็น PENDING และไม่ตัด Stock อีก
- กรณี Sold ดู Approval จริงของ BSD Staff ในหัวข้อ 12 ไม่รวมเป็นแค่รับทราบ

## 8. Use Case การคืน: ผู้ขอเลือกและแบ่ง Outcome

### UC-R01: เงื่อนไขเริ่มคืน

- ใช้กับ Source BORROW/USING ที่เบิกสำเร็จและยังมี IN_USE
- Requester เดิมเป็นคนเริ่ม เลือกสินค้าที่ถือครองจริงได้เท่านั้น
- Admin, ผู้อนุมัติ และ Storeman เริ่มคืนแทนไม่ได้เพียงเพราะ Role
- Source SOLD ที่สำเร็จแล้วไม่เข้าสู่ Return Flow นี้

### UC-R02: คืนบางรายการ

ตัวอย่าง Source มี 4 Items เลือกคืน 2 Items ให้สร้าง Outcome เฉพาะ 2 Items

- อีก 2 Items คงถือครองและมี Action คืน
- Pending Approval ของ Items ที่เลือกไม่ Lock ทุก Item ของ Source
- Source คง IN_PROGRESS จนทุกจำนวนปิดสำเร็จ

### UC-R03: คืน Quantity บางชิ้นและ Split Outcome

ตัวอย่างเบิก 5 คืนรอบนี้ 2 อีก 3 ยังใช้งาน หรือแยก RETURN 1, USED 1, FAIL 1 และยังใช้งาน 2

- จำนวนต่อ Outcome เป็นจำนวนเต็มบวก
- ผลรวมในฟอร์มต้องไม่เกิน Open Quantity ของ Item
- `+ Split outcome` เพิ่มแถวย่อย Outcome ของ Item เดิม ไม่สร้างสินค้า Master ใหม่
- ลบแถวย่อย/แก้จำนวนได้ตามสิทธิ์ Edit ของรอบนั้น
- Pending จำนวน 2 ทำให้ Open Quantity เหลือ 3 แต่ IN_USE ยัง 5 จน Post ผลสำเร็จ
- สร้างคำขอคืนเพิ่มสำหรับ Open Quantity ได้ทันที แม้รอบแรกยังรออนุมัติ ไม่ต้องรอครบ Source
- ห้ามทำคำขอซ้ำทับจำนวนที่ Pending; Serialized มี Pending แล้ว Open เป็น 0

### UC-R04: Submit คืน

1. ตรวจ Source, requester, จำนวนและ Outcome ที่อนุญาต
2. สร้าง Return Batch/Items/Outcomes เชื่อม Source และ Allocate REQ สำหรับรอบคืนตามกฎทั่วไป
3. บันทึก requester confirmation ขั้นแรก และไป Lead/Supervisor ตาม Context
4. บันทึกว่ามีรายการส่งคืน แต่ยังไม่เพิ่ม Stock/ลด IN_USE/เปลี่ยน Asset เป็น READY
5. ผู้ขอกลับมา Edit/ลบ Outcome/Cancel รอบนี้ได้ก่อน Lead/Supervisor คนแรกอนุมัติ

การเรียกว่า Submit แล้วทำการคืน หมายถึงเริ่มคำขอคืนและส่งให้ตรวจ ไม่ได้หมายความว่า Post Stock แล้ว

## 9. Flow อนุมัติคืนและเอกสาร

### UC-R05: Lead / Supervisor อนุมัติหรือ Reject

- รอครบทุกผู้อนุมัติในขั้นนั้นก่อนเปิด Manual Check ของ Storeman
- Reject ส่งกลับทั้ง Return Batch รอบนั้น คงเลขเดิม ไม่ย้อน Source ไป Draft และไม่ยกเลิกรอบคืนอื่น
- ปลด Pending allocation ของรอบที่ปฏิเสธให้ส่งใหม่ได้ พร้อมตรวจจำนวนล่าสุดอีกครั้งเมื่อ Resubmit
- ไม่มีการเปลี่ยน Stock/IN_USE ของรอบที่ Reject

### UC-R06: Storeman Manual Check ทุกคลัง

- ผู้ขอเลือก RETURN/SOLD/FAIL/LOST/USED เอง Storeman ตรวจว่าสภาพและจำนวนตรงที่ส่งมา
- Storeman กดยืนยันผลตรวจทีละรายการของคลังตน
- Storeman ตัดสิน Stock Code รับกลับของ Quantity ตามสินค้าที่ตรงและคลังที่มีสิทธิ์
- ถ้าข้อมูลผิดให้ Reject พร้อมเหตุผล ส่งผู้ขอแก้และเริ่ม Approval ใหม่ ไม่แก้สภาพเงียบ ๆ โดยใช้ Approval เดิม
- Storeman ทุกคลังและทุกคนที่จำเป็นต้องตรวจครบก่อนออกเอกสารรวม/เข้าสู่ Final Gate
- การยืนยันตรวจยังไม่เพิ่ม Stock หรือปิด IN_USE

### UC-R07: มี FAIL / LOST / USED ต้องมีเอกสารลงนาม

1. หลังทุกคลังตรวจครบ Generate PDF รวมเฉพาะ Outcome FAIL, LOST, USED และจำนวนของรอบนี้
2. RETURN และ SOLD ไม่ปรากฏในเอกสารความเสียหาย/สภาพนี้
3. PDF แสดงงาน/Project, Source REQ, เลขรอบคืน, ผลตรวจ และผู้เกี่ยวข้อง
4. นำ PDF ให้ Executive ลงนามรับรู้ด้วย Wet Signature
5. Storeman คนใดคนหนึ่งในคลังที่เกี่ยวข้องอัปโหลด PDF ที่ลงนามแล้วเข้ารอบนั้น
6. เอกสาร Uploaded ใช้ร่วมกันทั้งรอบ ทุกคลังไม่ต้องอัปโหลดซ้ำ
7. เมื่อเอกสารครบจึงเปิด Final Approve ให้ Storeman ทุกคลัง

ลายเซ็น Executive เป็นหลักฐานรับรู้บนเอกสาร ไม่ใช่การเพิ่ม BSD Manager Approval Gate ในระบบ อัปโหลดไฟล์ที่ลงนามจริงเป็นเงื่อนไขบังคับ ไม่ใช้ checkbox แทนไฟล์

### UC-R08: ทั้งรอบเป็น RETURN / SOLD เท่านั้น

- ยังต้องผ่าน requester -> Lead/Supervisor -> Storeman ทุกคลัง
- ไม่ Generate เอกสารความเสียหาย ไม่รอ Wet Signature และไม่บังคับ Upload เอกสารดังกล่าว
- Storeman ตรวจและกดอนุมัติได้ทันที โดย Final Gate ต้องครบทุกคลัง
- RETURN Post เมื่อ Final Storeman ครบ; SOLD ส่งต่อ BSD Staff

### UC-R09: Final Storeman ครบและ Post ผลที่ไม่ใช่ SOLD

- ถ้าคลัง A Final Approve แล้วแต่ B ยังไม่ครบ ไม่มีผลคืนของรอบนี้ถูก Post
- ถ้าคลังหนึ่ง Reject ก่อน Post ทั้งรอบคืนยังไม่สำเร็จ ส่งกลับผู้ขอ ใช้เลขเดิม
- เมื่อครบทุกคลัง Post RETURN/USED/FAIL/LOST ของรอบนั้นพร้อมกันแบบ atomic
- SOLD ยังไม่ Post และยังคงรอ Approval ราคาของ BSD Staff ใน Derived Sold
- Source ยัง IN_PROGRESS ถ้ามี IN_USE, Outcome รอขาย หรือปิดผลไม่ครบ
- BSD และ Warehouse Managers รับทราบผลคืนทั่วไป โดยไม่ทำให้การรับคืนล่าช้า

### UC-R10: แก้ไข Cancel หรือ Reject หลังมีเอกสาร

- ผู้ขอ Cancel/แก้เองได้ก่อน Lead/Supervisor อนุมัติคนแรกของรอบปัจจุบันเท่านั้น
- การอนุมัติ requester เองไม่ตัดสิทธิ์ Cancel
- หลัง Lead อนุมัติ ต้อง Reject กลับเพื่อแก้ ไม่เปิดปุ่ม Remove เพียงเพราะ Outcome ยังไม่ Post
- Reject/Resubmit ที่เปลี่ยนข้อมูลทำให้ Manual Check, Approval และ PDF revision เดิมใช้อนุมัติรอบใหม่ไม่ได้
- เก็บ PDF เดิมและ Approval เดิมเป็นประวัติ Superseded หากยังต้องมี FAIL/LOST/USED ต้องตรวจและออกเอกสารลงนามใหม่ให้ตรง revision
- การ Reject รอบปัจจุบันไม่ย้อน Stock ของรอบที่ Post สำเร็จแล้ว

## 10. ผลคืนแต่ละประเภท

| Outcome | ชนิดสินค้า | Stock เมื่อ Post | การถือครอง | หลักฐานและเงื่อนไข |
| --- | --- | --- | --- | --- |
| RETURN | Serialized | Asset เดิมเป็น READY ในคลังเดิม | ปิด 1 ชิ้น | Serial เดิม ไม่เลือก condition |
| RETURN | Quantity | เพิ่มแถวเดิม condition NEW | ลดจำนวนตาม Outcome | Stock Code/คลังเดิม ไม่เข้า Reuse |
| USED | Quantity เท่านั้น | เพิ่มแถว Reuse condition USED ที่เลือก | ลดจำนวนตาม Outcome | Code ต้องมีอยู่; อยู่ใน PDF ลงนาม |
| FAIL | ทั้งสองแบบ | ไม่เพิ่ม Stock พร้อมใช้ | ปิดจำนวนที่อนุมัติ | PDF ลงนาม, เหตุผล, Remark/History |
| LOST | ทั้งสองแบบ | ไม่เพิ่ม Stock ใด | ปิดจำนวนที่อนุมัติ | PDF ลงนาม, เหตุผล, Remark/History |
| SOLD | ทั้งสองแบบ | ไม่รับเข้า Stock ระหว่างทาง | ปิดเมื่อ BSD Staff อนุมัติ | Derived Sold, ราคา, FROM Source REQ |

### UC-R11: RETURN Serialized

- ไม่มี Change Serial/Assign Serial ใน Return UI/API
- ตรวจ Asset เดิมสัมพันธ์กับ Source Item และยังมีจำนวนถือครอง
- หลัง Final Storeman Asset เดิม READY บันทึกเวลา ผู้รับคืนและ Source

### UC-R12: RETURN Quantity

- เพิ่ม QTY เข้าสต๊อกเดิมสภาพ NEW ในคลังเดิมเมื่อ Post
- ไม่สร้างแถวใหม่ถ้ามีแถวที่ตรงอยู่แล้ว รวมถึงแถวที่ qty เป็น 0
- การคืนบางส่วนของ Item ไม่เปลี่ยน Qty ทั้ง Item ให้จบ ส่วนที่เหลือยังใช้งาน

### UC-R13: USED Quantity

- Requester เลือก USED; Storeman ตรวจและเลือก Existing Stock Code สำหรับสินค้ารุ่นเดียวกันในคลังเดียวกัน
- เพิ่มในแถว condition USED ที่ตรง ถ้าแถวไม่มีจริงสร้างเฉพาะ Stock Row ตาม Code ที่มีอยู่
- ถ้าไม่มี Existing Code ที่เหมาะสม ให้แก้ Master/Mapping ผ่านผู้มีสิทธิ์ก่อน Final Approve ไม่สร้าง Code อัตโนมัติจากการคืน
- USED ไม่เป็นสถานะเสียและไม่ใช่ NEED_CHECK เป็นสินค้าพร้อมนำกลับใช้เมื่อรับเข้าแล้ว

### UC-R14: FAIL / LOST

- Serialized เก็บ Asset เดิมพร้อมสถานะ FAIL หรือ LOST; Quantity เก็บจำนวนผลลัพธ์ใน Outcome/History ไม่ทำให้ทั้ง Pool ที่เหลือพร้อมใช้กลายเป็น FAIL/LOST
- จำนวนดังกล่าวไม่เพิ่มใน Stock Code ใดของสินค้าพร้อมใช้
- สร้าง Remark อัตโนมัติที่ Stock Code ต้นทาง ระบุประเภท จำนวน Source REQ เลขรอบคืนและเวลา เช่น `Fail 10 from REQ-...; Lost 5 from REQ-...`
- รักษา Remark ที่คนกรอกไว้ บันทึกส่วนที่ Generate แยก/มี Reference เพื่อไม่บวกซ้ำเมื่อ retry
- Report แสดงจำนวน FAIL/LOST แยกจาก Available และ IN_USE
- การซ่อม FAIL หรือพบ LOST ภายหลังเป็น workflow การปรับ/ฟื้นสถานะพร้อม Audit แยก ไม่เปิดให้ย้อน Outcome ที่สำเร็จแบบลบประวัติ

## 11. การคืนหลายรอบและผลต่อ Source

### UC-R15: Source ยังมีของใช้อยู่

- Source คง BORROWED หรือ USING / IN_PROGRESS
- Return Date ใน Log แสดง `CONTINUES` เมื่อยังมีการถือครองค้าง แม้บางรอบคืนเสร็จแล้ว
- แสดงวันที่รับคืนแต่ละรอบใน Outcome History แยกจากวันที่ปิด Source
- เมื่อทุกจำนวนปิดสำเร็จและไม่มี Pending ค้าง Source เป็น RETURNED/COMPLETED และ Return Date เป็นวันที่ปิดผลครบจริง

### UC-R16: ทุกจำนวนถูกส่งคืนแต่ยัง Pending

- อาจแสดง `0 open` เพราะไม่มีจำนวนส่งเพิ่มได้ แต่ยังไม่ใช่ Source COMPLETED
- IN_USE ยังมีจำนวนที่ Pending จน Post สำเร็จ; UI ต้องแสดง Pending Quantity ประกอบ ไม่ตีความ Open=0 เป็นคืนสำเร็จแล้ว
- หากบางส่วน Sold รอ BSD ยังไม่มี Final Return Date ของ Source

### UC-R17: คืนเพิ่มขณะรอบเก่ารออนุมัติ

- เปิดให้ทำรอบใหม่ตาม Open Quantity ของ Items ที่เหลือ
- แยกเลขรอบคืน, revision, Approval, เอกสารและจำนวนของแต่ละรอบ
- ระบบเช็ก pending allocation ขณะ Submit แบบ atomic ป้องกัน 2 รอบใช้จำนวนเดียวกัน
- ยกเลิก/Reject รอบหนึ่งไม่กระทบรอบอื่นที่ Pending หรือสำเร็จแล้ว

## 12. Use Case การขาย

### UC-S01: ขายจากคลังโดยตรง

Flow: requester Submit -> Lead/Supervisor -> Storeman ทุกคลังตรวจและอนุมัติ -> BSD Staff กรอกราคาและ Approve -> Post ขายพร้อมกันทุก Item

- ใช้เลข REQ ใหม่ตามกฎทั่วไป
- Stock ยังไม่ถูกตัดเมื่อ Storeman อนุมัติ คง Reservation จน BSD Staff ยืนยัน
- ไม่ใช้เอกสารความเสียหายเพียงเพราะเป็น SOLD
- BSD Staff กรอกราคาต่อหน่วยใน Sale Price Groups; Serialized qty=1, Quantity แบ่งจำนวนเป็นหลายกลุ่มได้
- `Group Total = quantity * unit price`; `Grand Total = sum(Group Total)` คำนวณอัตโนมัติบน Server และแสดงใน UI
- บังคับข้อมูลราคาครบทุกรายการก่อน Approve ใช้ Decimal เพื่อไม่คลาดเคลื่อนจาก Floating Point
- เมื่อ BSD Approve ตรวจยอด/Reservation อีกครั้ง ลด Stock ตามจำนวนขาย Serialized เป็น SOLD และคำขอ COMPLETED/COMPLETED
- ไม่เพิ่ม IN_USE สำหรับการขายจากคลัง
- Warehouse Manager รับทราบแยกจาก Approval; BSD Staff เป็น Final Sale Approval

### UC-S02: ขายจากสินค้าที่เบิกไปแล้ว

Flow: requester เลือก SOLD ใน Return -> Lead/Supervisor -> Storeman ทุกคลังตรวจและ Final Approve ตามเงื่อนไขเอกสารของรอบคืน -> Derived Sold รอ BSD Staff -> ราคา/Approve -> ปิดถือครองเป็น SOLD

- Derived Sold ใช้ `FROM REQ-...` ของ Source เบิก ไม่ Consume running ใหม่
- Derived Sold อ้างขั้นอนุมัติของ ReturnBatch และมี BSD Price Approval แยก
- เก็บ Sale Approval แยกจาก Outcome คืนทั่วไปเพื่อให้ SOLD รอราคาได้
- Stock ถูกตัดไปแล้วตอนเบิก จึงห้ามตัด On-hand ต้นทางซ้ำและห้ามเพิ่มคืนชั่วคราวก่อนขาย
- เมื่อ BSD Staff อนุมัติจึงลด IN_USE ของจำนวนขาย และ Serialized เดิมเป็น SOLD
- สินค้ายัง Pending Sale ไม่กลับเป็น Available และไม่เริ่มคืน/ขายซ้ำจำนวนเดิม

### UC-S03: คำขอคืนผสม RETURN / USED / FAIL / LOST / SOLD

1. ทุก Outcome ของรอบคืนผ่าน Lead และ Storeman ตรวจตามคลัง
2. ถ้ามี FAIL/LOST/USED ต้องมี PDF เฉพาะประเภทเหล่านี้และ Upload Wet Signature
3. Storeman Final Approve ครบแล้ว Post ผลที่ไม่ใช่ SOLD พร้อมกัน
4. ส่วน SOLD คงรอ BSD Staff พร้อมราคาและ Approval แยก
5. การอนุมัติ SOLD ภายหลังปิดเฉพาะจำนวนขาย ไม่ Post RETURN/USED/FAIL/LOST ซ้ำ
6. การ Reject ของ BSD ส่งเฉพาะงานขายที่ยังไม่สำเร็จกลับแก้ ไม่ย้อนผลคืนที่ Post แล้ว

หากขายถูก Reject และแก้ประเภท/จำนวน/รายการ ต้องสร้าง revision/Approval รอบใหม่ของส่วนขายโดยเริ่ม requester -> Lead/Supervisor -> Storeman -> BSD พร้อมเก็บ FROM เดิมและป้องกันการใช้จำนวนที่ปิดไปแล้ว

### UC-S04: Reject / Edit / Cancel การขาย

- ขายจากคลัง Reject ที่ขั้นใดก่อน BSD Post ถือว่า Reject ทั้งคำขอ ใช้เลข REQ เดิมและคืน Reservation
- ส่งใหม่ต้องตรวจ Available และเริ่ม Approval ใหม่
- Derived Sold Reject คงผู้ขอและ Source เดิม สินค้ายังถือครอง ไม่คืน Stock อัตโนมัติ และไม่ย้อนผลคืนอื่น
- Cancel/Edit ขายใช้เกณฑ์ก่อน Lead/Supervisor อนุมัติคนแรกของรอบนั้น ตามประวัติ Approval ที่ Reference มาจากรอบคืนด้วย
- หลังขายสำเร็จไม่แก้ราคา/จำนวนโดยเขียนทับหรือลบ Sale ต้องใช้กระบวนการแก้ไขธุรกรรมที่มี Audit แยก

### UC-S05: PDF ขายและยอดเงิน

- ขายจากคลังมีใบขายตามคำขอ REQ ของตน
- ขายจากคืนเป็นหน้าขายเพิ่มในชุด PDF Source Request แสดง FROM เลขต้นทาง
- หน้า Damage/Condition Report ไม่รวม SOLD และหน้า Sale ไม่รวม Outcome ที่ไม่ขาย
- แสดง No., Model, Stock Code, Serial, QTY, Price/Unit, Total, Details และยอดรวมทั้งคำขอ
- ราคาใน PDF สุดท้ายอ่านจาก BSD Staff ที่อนุมัติแล้ว เอกสารก่อนราคาเป็นฉบับร่างและไม่ถือว่าการขายสำเร็จ
- หากต้อง Generate หน้าขายภายหลัง ไม่แก้ไฟล์หลักฐาน Wet Signature ที่ Upload ไว้ เก็บและแนบเอกสารนั้นตาม revision
- ยอดขายใน Flow นี้คำนวณจากจำนวนและราคาต่อหน่วยของ Sale Price Groups

## 13. ตารางเหตุการณ์และการเปลี่ยนยอด

| เหตุการณ์ | Workflow / Phase | Stock | Reserved | IN_USE | ผลอนุมัติ |
| --- | --- | --- | --- | --- | --- |
| เพิ่มสินค้า Cart | Draft | คงเดิม | เพิ่ม/Lock | คงเดิม | ยังไม่ Submit |
| Submit เบิก | PENDING / Lead | คงเดิม | คงจอง | คงเดิม | requester ยืนยัน |
| Lead ครบ | PENDING / Storeman | คงเดิม | คงจอง | คงเดิม | Lead APPROVED |
| Storeman A ผ่าน B ยังรอ | PENDING | ทุกคลังคงเดิม | คงจอง | คงเดิม | A APPROVED แต่ยังไม่จ่าย |
| Storeman ทุกคลังผ่านเบิก | Source IN_PROGRESS | ลดครบทุก Item | ใช้/ปล่อยยอดจอง | เพิ่มครบ | Storeman ครบและ Post |
| Reject เบิกก่อน Post | REJECTED | คงเดิม | Release | คงเดิม | รอบเดิมถูก Reject |
| Submit คืน | PENDING / Lead | คงเดิม | ไม่จอง Available ของคลัง | คงเดิม | กันจำนวน Pending Outcome |
| Storeman ตรวจคืนครบ | PENDING / PDF หรือ Final | คงเดิม | คงเดิม | คงเดิม | Check Verified |
| Upload PDF ลงนาม | PENDING / Final | คงเดิม | คงเดิม | คงเดิม | หลักฐานพร้อม |
| Final คืนครบ | รอบคืนสำเร็จส่วน Non-Sold | RETURN/USED เพิ่ม; FAIL/LOST ไม่เพิ่ม | คงเดิม | ลด Non-Sold | Post แบบ atomic |
| Sold รอ BSD | PENDING / BSD | คงเดิม | ขายคลังคงจอง | ขายจากคืนคง IN_USE | ยังไม่ขายสำเร็จ |
| BSD ขายจากคลังผ่าน | COMPLETED | ลดจำนวนขาย | ใช้/ปล่อยยอดจอง | ไม่เพิ่ม | Sale สำเร็จ |
| BSD ขายจากคืนผ่าน | COMPLETED ส่วนขาย | ไม่ลด Stock ต้นทางซ้ำ | คงเดิม | ลดจำนวนขาย | Asset/Outcome SOLD |
| ทุกจำนวน Source ปิด | COMPLETED | ตามผลแต่ละ Outcome | ไม่มีที่เกี่ยวข้อง | 0 | Source ปิดครบ |
| BSD/Manager รับทราบ | สถานะเดิม | คงเดิม | คงเดิม | คงเดิม | Acknowledgment เท่านั้น |

## 14. สูตรจำนวนและตัวอย่าง

### 14.1 สูตรที่ต้องรักษา

- `IN_USE = issuedQuantity - sum(successfullyPostedOutcomeQuantity)`
- `Open Quantity = issuedQuantity - postedOutcomeQuantity - activePendingOutcomeQuantity`
- Draft เลือกจำนวนแล้วอาจแสดง Open หลังหัก Draft แบบ Real-time แต่ค่าบน Database ต้องไม่ถือว่า Post แล้ว
- ผลรวม RETURN + USED + FAIL + LOST + SOLD ที่สำเร็จและที่ Pending ต้องไม่เกินจำนวนที่เบิก
- `Available = On-hand - active reservations` เมื่อใช้แบบจำลองตัด On-hand จริงตอนเบิก
- ห้ามหัก IN_USE ซ้ำจาก On-hand ที่ถูกลดตอนเบิกแล้ว
- ไม่ให้ Stock, Reserved, IN_USE หรือ Open Quantity ติดลบ

### 14.2 ตัวอย่างคำนวณ

เริ่มต้น LAN001 (NEW) 100, LAN002 (USED/Reuse) 3

เบิก LAN001 30: ระหว่าง Approval Stock ยัง 100; Reserved 30; Available 70 เมื่อ Storeman ทุกคลังครบจึงเป็น Stock LAN001 70, Reserved 0, IN_USE 30

คืนรอบหนึ่ง FAIL 10, LOST 5, USED 3, RETURN 2 รวม 20 อีก 10 ยังใช้งาน

ระหว่าง Approval/PDF Stock LAN001 70, LAN002 3, IN_USE 30, Pending Outcome 20, Open Quantity 10

เมื่อ Storeman Final ทุกคลังครบ:

```text
LAN001 = 70 + 2 = 72
LAN002 =  3 + 3 =  6
IN_USE = 30 - 20 = 10
FAIL   = 10 (ไม่เพิ่ม Stock)
LOST   =  5 (ไม่เพิ่ม Stock)
```

PDF ลงนามของรอบนี้มี FAIL 10, LOST 5, USED 3 ไม่รวม RETURN 2 Remark ที่ LAN001 อ้าง FAIL/LOST และ Source REQ

### 14.3 ตัวอย่างผสม SOLD

Source เบิก 30 และ Stock เหลือ 70 รอบคืนเลือก RETURN 2, USED 3, FAIL 10, LOST 5, SOLD 4 รวม 24 อีก 6 ไม่เลือกคืน

- Pending ทั้งรอบ: IN_USE 30, Open 6, Stock คงเดิม
- Final Storeman Post Non-Sold 20: LAN001 72, LAN002 6, IN_USE 10 ซึ่งประกอบด้วยยังใช้งาน 6 และรอขาย 4
- BSD Approve SOLD 4: Stock คง 72/6, IN_USE 6, Sold 4 ห้ามหัก LAN001 อีก 4
- Source ยัง IN_PROGRESS และ Return Date CONTINUES จนอีก 6 ปิดผลครบ

## 15. UI และ Current Step

- Request Items แสดงชื่อผู้อนุมัติปัจจุบันของ Item/Outcome ตามคลัง ไม่ใช้ชื่อของทั้ง Transaction ไปใส่ทุกแถว
- Storeman ของ Item นั้นผ่านแล้วแต่ยังรอคลังอื่น ให้ Current Step ของ Item ที่ผ่านแสดง `Awaiting approval` ไม่แสดงชื่อ Storeman ของคลังอื่นเสมือนเป็นผู้อนุมัติ Item นี้
- Item ที่ยังไม่ส่งคืนและมี Open Quantity ต้องมี Action Return แม้ Item อื่น Pending
- Item ที่คืนบางส่วนแสดงยอดยังใช้งาน, Pending และปิดผลแล้วแยกกัน
- Returned / Outcome Summary แสดง Pending approval, ผลตรวจ, เอกสาร, เวลา Post และผล Sale ตาม Outcome จริง
- `X open / Y total (Z qty remaining)` ใช้ Open Quantity สำหรับจำนวนที่เลือกคืนเพิ่มได้ และแสดง Pending Quantity แยกไม่ให้เข้าใจผิดว่าปิดแล้ว
- ผลคืน RETURN/USED แสดง Stock Code ปลายทาง Condition และจำนวน; FAIL/LOST แสดงเหตุผล; SOLD แสดงราคา/Total เมื่อ BSD กรอกแล้ว
- UI Disable/Hide USED สำหรับ Serialized และ Change Serial ใน Return
- Approval Queue เฉพาะงานในขั้นปัจจุบันที่ผู้ใช้มีสิทธิ์จริง ส่วน Acknowledgment อยู่เป็นงานรับทราบแยก
- เวลา UI/PDF ใช้ locale, calendar และ timezone ที่ระบุชัดทั้ง Server/Client ป้องกัน Hydration mismatch เช่น Gregorian และ Asia/Bangkok
- `dueDate` เป็นข้อมูลประกอบ ไม่คำนวณ Overdue อัตโนมัติ

## 16. PDF และลายเซ็น

- หัวบริษัทสองภาษา JZ Computer and Consultant Ltd., Part. / หจก. เจซี คอมพิวเตอร์ แอนด์ คอนซัลแทนส์ ตาม Template องค์กร
- ชื่อใบเบิก-ยืม / ใบคืน / ใบขาย ตามประเภท มี Customer, Detail, เลขคำขอ และ Internal/Service/Project
- Description ในตารางสินค้าคือ Description ของสินค้า ไม่ใช้ Detail ของคำขอไปใส่เหมือนกันทุกแถว
- ตารางเบิก/คืนมี No., Model, Stock Code, Serial, QTY, Description/Remark; Quantity แสดง Serial เป็น `-`
- ใบขายเพิ่ม Price/Unit, Total และยอดรวม
- ใบเบิกมี Requisition by, Lead Project/Supervisor, Storeman ไม่มี BSD Manager Signature Block โดยอัตโนมัติ
- ใบคืน/ขายเพิ่ม Authorized by ตาม Template; เอกสาร FAIL/LOST/USED ต้องมี Wet Signature ของ Executive และ Upload จริง
- สัดส่วนคอลัมน์ลายเซ็นหลัก 22% / 28% / 50%; แยก Signature Item ต่อคนเป็นภาพ/เส้น ชื่อ วันที่ และ Wrap ภายในคอลัมน์
- ใช้เฉพาะผู้ยืนยัน/อนุมัติที่สัมพันธ์กับประเภทเอกสารและรอบนั้น ไม่รวมผู้อนุมัติเบิกกับคืนทุกครั้งซ้ำ ๆ
- ภาพชื่อ/ลายเซ็นเป็น snapshot ตามเวลานั้น การเปลี่ยน User/Lead ภายหลังไม่เปลี่ยนเอกสารประวัติ
- Font ไทย Sarabun/TH Sarabun ตาม Asset ที่ระบบมี, A4, Page Break, Document Code ตาม Template เช่น FM-5300(2)-R.5
- เป้าหมายรายการไม่เกิน 10 อยู่ในหนึ่งหน้าเมื่อข้อมูลพอดี ไม่ตัด Serial/ชื่อ/ลายเซ็นจนข้อมูลสำคัญหาย; หลายหน้าต้องคงความอ่านได้
- PDF รวมขายจากคืนเป็นหน้าเพิ่มของชุด Source เดิม พร้อม FROM และจำนวนเฉพาะ Sold

## 17. Special Conditions และกรณีผิดปกติ

### SC-01: กดซ้ำ / Retry / Network ขาด

ใช้ Request ID/Revision/Idempotency ของ operation เดิม การ Submit/Approve/Upload Retry ไม่สร้างเลข, Outcome, Sale, Remark หรือ Stock movement ซ้ำ หากผลไม่แน่นอนให้ตรวจผลบน Server

### SC-02: สต๊อกเปลี่ยนระหว่างอนุมัติ

ตรวจยอดอีกครั้งในจุด Post จริง กรณีหลายคลังมีคลังหนึ่งไม่พอทั้งคำขอไม่ Post แจ้งเหตุให้ Storeman/Requester ดำเนินการ ไม่มีการจ่ายบางส่วน

### SC-03: Item ถูกปิด/แก้ Master ระหว่าง Pending

Stock Code/Asset/Model ต้องยังใช้ได้และตรง Warehouse ในจุด Post ถ้าไม่ผ่านให้ระบุเหตุ ไม่ย้ายไปสินค้าหรือ Code อื่นอัตโนมัติ และไม่แก้ Stock Code ที่มี Transaction อ้างโดยไม่มี Audit

### SC-04: เปลี่ยน Lead ระหว่าง Approval

โอน Pending ไป Lead ที่มีสิทธิ์ขณะนั้น รอครบ Lead active ทุกคน และเก็บ Approval ที่สำเร็จแล้วโดยไม่เปิดขั้นที่จบไปแล้วซ้ำ

### SC-05: ผู้รับผิดชอบ Warehouse เปลี่ยน

ตรวจ Assignment/Permission ล่าสุดก่อน Action เก็บผู้ตรวจ/ผู้อนุมัติเดิมเป็น History เปลี่ยน Pending Assignment ด้วย Audit ไม่ให้คนพ้นสิทธิ์อนุมัติจาก URL/API ได้

### SC-06: Document revision ไม่ตรง Outcome

ห้ามใช้ไฟล์ลงนามของจำนวน/ผลตรวจ/Project/รายการคนละ revision มา Post รอบล่าสุด ต้องตรวจ Reference และเก็บประวัติเอกสารที่ถูกแทนที่

### SC-07: ไม่มีความเสียหายแต่มี USED

USED ต้องอยู่ในเอกสารสภาพและมี Wet Signature เช่นเดียวกับ FAIL/LOST

### SC-08: ทั้งรอบเป็น SOLD อย่างเดียว

ไม่ต้องมีเอกสารความเสียหาย Storeman ทุกคลังตรวจและ Approve แล้วรอ BSD Staff ราคา/Approve; ยังไม่ปิด IN_USE หรือขายสำเร็จเพียงเพราะ Storeman ครบ

### SC-09: BSD Staff กับ Storeman เป็นคนเดียวกัน

เก็บการตรวจ/Storeman Approval และ BSD Price Approval แยกบทบาท ต้องมีการกรอกราคาครบและยืนยันขั้นขาย ไม่ Auto-approve ราคาจากการกด Storeman

### SC-10: Cancel กับ Reject

Cancel เป็นการถอนโดย requester ก่อน Lead/Supervisor คนแรกอนุมัติ; Reject เป็นการส่งกลับแก้โดยผู้อนุมัติในขั้นปัจจุบัน มีเหตุผลและคงเลขคำขอ ทั้งสองกรณีไม่ลบ Audit การ Reject ทำให้แก้และเริ่มรอบใหม่ได้

### SC-11: Source หมด Open แต่ยังมี Pending

ไม่ให้ส่งจำนวนซ้ำ และไม่ปิด Source จนทุก Outcome Post แล้ว คืนรอบที่ Pending ได้เฉพาะแก้/Cancel ตามสิทธิ์หรือ Reject ห้ามนำ IN_USE ที่รอขายไปขายซ้ำ

### SC-12: หลายรอบคืนมีผลสำเร็จไม่พร้อมกัน

Each Return Batch มี Approval และเอกสารของตน ไม่ใช้เอกสาร/ผู้อนุมัติจากรอบหนึ่งไปทำให้อีกรอบผ่าน Source คำนวณจาก Outcome สำเร็จทั้งหมด และไม่ Reset ประวัติ/ยอดรอบเก่าเมื่อ Reject รอบใหม่

## 18. Audit และเกณฑ์ตรวจรับ

บันทึก Source/Derived ID, REQ/FROM, Batch, Item, Outcome, Revision, Actor, Warehouse, เวลา, เหตุผล, Manual/Auto Approval, Signature snapshot และ Document Reference

Quantity movement ต้องมี quantityBefore, quantityAfter, quantityChanged, condition, Stock Code ต้นทาง/ปลายทาง และ Post Reference เก็บใน `asset_status_histories` หรือ Movement Model ที่รองรับ โดยไม่ใช้ Remark เป็นหลักฐานตัวเลขเพียงอย่างเดียว

Acceptance Scenarios:

- [ ] Submit เป็น requester confirmation และแก้/Cancel ได้ก่อน Lead/Supervisor คนแรกผ่าน
- [ ] Lead ผ่านแล้ว requester แก้/Remove/Cancel โดยตรงไม่ได้
- [ ] Reject ทุกขั้นเปิด Revision ใหม่และใช้เลขเดิม พร้อมประวัติเดิม
- [ ] Storeman A ผ่าน B ยังรอ ไม่ตัด/รับ Stock ของ A
- [ ] B Reject หลัง A ผ่าน ทั้งคำขอรอบนั้น Reject และ Stock ไม่เปลี่ยน
- [ ] เบิกทุกคลัง Post พร้อมกันเต็มจำนวน ไม่มี Partial Issue
- [ ] Acknowledgment ของ BSD/Manager ไม่ขวางสำเร็จและไม่ Post ซ้ำ
- [ ] ผู้ขอเดิมคืนได้ Admin และคนอื่นคืนแทนไม่ได้
- [ ] คืน 2 จาก 4 Items อีก 2 ยังมี Return Action
- [ ] Quantity เบิก 2 คืน 1 เหลือ IN_USE 1 หลัง Post
- [ ] ระหว่าง Pending Open ลดตามจำนวนที่กัน แต่ IN_USE ไม่ลดก่อน Post
- [ ] คืนเพิ่มได้ตาม Open ขณะรอบอื่น Pending แต่ไม่ใช้จำนวนซ้ำ
- [ ] USED ใช้เฉพาะ Quantity, ใช้ Existing Code/Model, เพิ่มแถวเดิมเมื่อมี
- [ ] Serialized Return ไม่เปลี่ยน Serial, RETURN กลับ Asset เดิม READY
- [ ] FAIL/LOST/USED ทุกคลังตรวจครบก่อน PDF และต้อง Upload Wet Signature
- [ ] PDF สภาพไม่มี RETURN/SOLD, RETURN/SOLD ล้วนข้าม PDF สภาพได้
- [ ] Storeman คนหนึ่ง Upload หลักฐานรวมได้ แต่ Final Approve ยังต้องครบทุกคลัง
- [ ] Final Approve Post RETURN/USED/FAIL/LOST พร้อมกัน และ SOLD ยังรอ BSD
- [ ] Fail/Lost ไม่เพิ่ม Available และ Remark มีจำนวน/Source ไม่ซ้ำเมื่อ Retry
- [ ] ขายจากคลังตัด Stock เมื่อ BSD ราคา/Approve เท่านั้น
- [ ] ขายจากคืนไม่ตัด Stock ต้นทางซ้ำ ปิด IN_USE เมื่อ BSD Approve
- [ ] ราคาต่อ Item และ Total ทั้งคำขอตรงกันบน UI/PDF/Server
- [ ] Derived Sold ไม่ใช้ running ใหม่ ใช้ FROM Source และมี Internal ID แยกรอบ
- [ ] PDF Sale จากคืนเป็นหน้าต่อในชุด Source เดิม มีเฉพาะผู้ลงนามของรอบที่เกี่ยวข้อง
- [ ] BSD Reject ส่วน Sold ไม่ย้อน Stock คืนที่สำเร็จแล้ว
- [ ] Source ปิดเมื่อทุกจำนวน Resolve จริง ไม่มี Pending, Return Date ก่อนปิดเป็น CONTINUES
- [ ] Concurrent Submit/Approve/Edit ไม่สร้างซ้ำหรือทำจำนวนติดลบ
- [ ] Lead reassignment, หลาย assignments และ Warehouse scope ตรวจทั้ง UI/API
- [ ] เวลาและวันที่ Render ตรง Server/Client ไม่มี Buddhist/Gregorian Hydration mismatch

## 19. จุดตรวจสำหรับผู้พัฒนา

| จุดที่เปลี่ยนพฤติกรรม | Invariant ที่ต้องรักษา |
| --- | --- |
| Submit/Edit/Reject | เลข REQ ของคำขอเดิมคงเดิม; Approval รอบที่มีผลต้องสอดคล้องกับรายการปัจจุบัน |
| Multi-Warehouse Approval | ทุก Storeman ที่กำหนดต้องผ่านก่อน Post; Reject คลังใดปิดรอบนั้น |
| Split Outcomes | จำนวนที่ Post แล้วและที่รอในรอบที่มีผลรวมกันไม่เกินจำนวนที่จ่าย |
| Return Post | RETURN/USED เพิ่มสต๊อกตาม condition; FAIL/LOST ไม่เพิ่ม READY; SOLD รอ BSD |
| Sale Price | จำนวนกลุ่มตรง Item; คำนวณ Group Total และ Grand Total จากหน่วยสตางค์ |
| เอกสารลงนาม | Revision ของไฟล์ต้องตรง Outcome ที่จะอนุมัติ; FAIL/LOST/USED ต้องมีไฟล์ที่ลงนาม |
| Source Completion | จำนวนทุก Item ต้อง resolve สำเร็จ ไม่มี Pending ที่ยังถือครอง |

รายการตรวจรับในหัวข้อ 18 เป็นชุดกรณีที่ใช้ทดสอบ ไม่ใช่สถานะการผ่านทดสอบ ดูผลการรันใน [Verification](workflow-implementation-verification.md)
