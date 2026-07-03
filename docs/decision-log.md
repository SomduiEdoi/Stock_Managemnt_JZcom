# บันทึกการตัดสินใจ

อัปเดตล่าสุด: 2026-07-03

## 2026-06-09: Baseline แรกของ Asset Flow

การตัดสินใจ:

- เริ่มสร้าง Asset Flow จาก inventory ของ Server และ Network ก่อน
- Track asset status แทนการลบ assets
- เก็บ status history เพื่อให้ audit ได้
- ใช้ role/permission checks สำหรับ management actions

เหตุผล:

- ระบบต้อง trace การเคลื่อนย้ายและการเปลี่ยนสถานะของอุปกรณ์ได้
- Server และ Network เป็น domains แรก แต่ไม่ควรถูกจำกัดให้มีได้แค่นี้ตลอดไป

## 2026-06-12: แนวทาง CSV Migration

การตัดสินใจ:

- CSV files เป็น mock/bootstrap data
- CSV ใช้สำหรับ migrate initial data เข้า PostgreSQL
- หลัง migration แล้ว PostgreSQL เป็น source of truth ถาวร
- Runtime ห้ามอ่าน CSV หรือ SharePoint อีกหลัง migration

เหตุผล:

- การมี database source เดียวช่วยลดความไม่สอดคล้องของข้อมูล และทำให้ approval/history workflows เชื่อถือได้

## 2026-06-12: พฤติกรรม Request Cart

การตัดสินใจ:

- Staff/user สามารถ request หลาย assets ใน request เดียวได้
- Request ทำงานเหมือน cart ก่อน submit
- เมื่อคลิก request ต้อง lock serial asset ทันทีโดยเปลี่ยน asset status เป็น `REQUEST`
- User คนอื่นยังเห็น asset ได้ แต่ request ซ้ำไม่ได้

เหตุผล:

- ป้องกัน double booking แต่ยังให้ requester รวมหลาย items ก่อน submit ได้

## 2026-06-12: Asset Status Model

การตัดสินใจ:

- Asset statuses คือ `READY`, `REQUEST`, `BORROW`, `USING`, `SOLD`, `FAIL`, `LOST`, `NEED_CHECK`
- Assets จะไม่ถูกลบจริงสำหรับ outcome เช่น borrow, using, sold, fail, lost หรือ need-check
- `SOLD` เป็น terminal status สำหรับ normal workflow
- `FAIL` และ `NEED_CHECK` ภายหลังสามารถเปลี่ยนเป็น `READY`, `FAIL`, หรือ `LOST` ได้ตามผลตรวจสอบ

เหตุผล:

- ธุรกิจต้องการ traceability และ audit history ระยะยาว

## 2026-06-12: Transaction Business Status Model

การตัดสินใจ:

- Borrow ใช้ `BORROWED`, `RETURNED`, `OVERDUE`
- Using ใช้ `ACTIVE`, `RETURNED`
- Sold ใช้ `COMPLETED`
- Approval/workflow state ต้องแยกจาก transaction business status

เหตุผล:

- Approval state ตอบว่า “คำขออยู่ตรงไหนของ workflow”
- Business status ตอบว่า “เกิดอะไรขึ้นกับ asset”

## 2026-07-02: Authentication Scope Update

การตัดสินใจ:

- ใช้ login flow เดิมสำหรับ current scope
- ตอนนี้ยังไม่ implement Microsoft 365, Azure AD, LDAP หรือ SSO
- เก็บ LDAP/SSO/Microsoft login เป็น future enhancement

เหตุผล:

- Priority ปัจจุบันคือทำให้ stock, migration, request, approval และ return workflows เสถียรก่อน
- หลีกเลี่ยงการผสม authentication migration เข้ากับ business workflow redesign

## 2026-07-02: Role and Tag Model

การตัดสินใจ:

- Primary roles คือ `ADMIN`, `STOCK_CONTROLLER`, และ `USER`
- ห้ามมี system roles อื่นนอกเหนือจาก `ADMIN`, `STOCK_CONTROLLER`, และ `USER`
- Stock Controller permission scope กำหนดด้วย domain tags เช่น `SERVER` และ `NETWORK`
- User organization level tags คือ `EXECUTIVE`, `MANAGER`, `SUPERVISOR`, และ `STAFF`
- User organization unit tags ได้แก่ `BSD_MANAGER`, `BSD_STAFF`, `SCN_MANAGER`, `S1_SUPERVISOR`, `S1_STAFF`, `N1_SUPERVISOR`, `N1_STAFF`, `C1_SUPERVISOR`, `C1_STAFF`, `DL_MANAGER`, `DL_STAFF`, `EN_MANAGER`, `CMS_SUPERVISOR`, `CMS_STAFF`, `SD_SUPERVISOR`, และ `SD_STAFF`
- User project tags ถูก assign ผ่าน project membership เป็น `LEAD_PROJECT` หรือ `TEAM_MEMBER`
- User คนใดก็สามารถเป็น `LEAD_PROJECT` หรือ `TEAM_MEMBER` ได้ ไม่ขึ้นกับ organization level
- BSD เป็น organization/approval context ไม่ใช่ system role แยก

เหตุผล:

- Primary role ควรบอกความสามารถหลักในระบบ
- Tags ใช้อธิบาย approval responsibility และ project/organization context

## 2026-07-02: BSD Approval Requirement

การตัดสินใจ:

- `BORROW` และ `USING` ต้องผ่าน `BSD_STAFF`
- `RETURN` และ `SOLD` ต้องผ่าน `BSD_STAFF -> BSD_MANAGER`
- Rejected approval ต้องมี reason

เหตุผล:

- BSD เป็น final business control point ทั้งตอนจ่ายของและตอนคืน/ปิดรายการ

## 2026-07-02: Context-Aware Approval Routing

การตัดสินใจ:

- ถ้า requester เป็น `STAFF` ให้ approval route ไปที่ `SUPERVISOR` ของทีม requester
- ถ้า requester เป็น `SUPERVISOR` ให้ approval route ไปที่ department `MANAGER`
- ถ้า requester เป็น `MANAGER` หรือ `EXECUTIVE` ให้ skip business approver tier
- ถ้า request ผูกกับ project และ requester เป็น `TEAM_MEMBER` ให้ route ไปที่ project `LEAD_PROJECT`
- ถ้า requester เป็น `LEAD_PROJECT` ของ project นั้นอยู่แล้ว ให้ skip project approver tier
- Transaction ที่มีหลาย domains ต้อง generate Stock Controller approval สำหรับทุก domain ที่เกี่ยวข้อง
- Multi-domain Stock Controller approvals สามารถ run parallel ได้
- Workflow จะไป BSD ได้หลังจาก Stock Controller approvals ที่จำเป็นทั้งหมด complete แล้ว

เหตุผล:

- Approval ต้องวิ่งตามบริบทของ requester และ domain owner ทุกส่วนที่ได้รับผลกระทบจาก transaction

## 2026-07-02: Dynamic Domain Direction

การตัดสินใจ:

- Domain ต้องเป็น data-driven
- Initial domains คือ Server และ Network
- อนาคตฝ่ายอื่นสามารถเพิ่ม domains ใหม่ได้โดยไม่ต้องเปลี่ยน core workflow code
- Category/type ต้อง belong to domain
- Admin และ Stock Controller สามารถ create/edit category/type ตาม permission ได้

เหตุผล:

- ระบบปัจจุบันเริ่มจาก Server และ Network แต่ควรรองรับการเติบโตขององค์กร

## 2026-07-02: Mixed Serial and Quantity Tracking

การตัดสินใจ:

- รองรับ tracking methods ทั้ง `SERIAL` และ `QUANTITY`
- Serialized asset ต้องมี serial identity และ quantity 1
- Quantity asset ไม่จำเป็นต้องมี serial และใช้ `asset_quantity`
- `transactions_items` เก็บ `requested_quantity`
- Quantity requests ต้อง reserve available quantity ก่อน submit/approval complete

เหตุผล:

- Stock บางอย่าง track เป็นรายชิ้น และบางอย่าง track เป็นจำนวน

## 2026-07-02: Transaction History Visibility

การตัดสินใจ:

- Transaction History เป็น internal public view
- Authenticated users เห็นทุก queue, pending approvals, rejected/cancelled items, completed transactions, ทุก projects และทุก users
- ต้องมี filtering เพื่อให้ global view ใช้งานได้จริง

เหตุผล:

- ทีมต้องเห็นภาพรวมข้าม project และ stock movement โดยใช้ filters แทนการซ่อน history

## 2026-07-02: Asset Detail Page

การตัดสินใจ:

- Asset Detail Page ต้องแสดง asset data ทั้งหมด
- ต้องแสดง asset status history
- ต้องแสดง related transaction history
- ต้อง export asset detail เป็น PDF ได้

เหตุผล:

- ต้องมี asset-level traceability สำหรับ audit, inspection และ operational handoff

## 2026-07-02: Transaction PDF Timing

การตัดสินใจ:

- Asset detail PDF อยู่ใน current scope
- Borrow/return transaction PDF รอจนกว่าจะได้ final document format

เหตุผล:

- สามารถ build workflow ก่อนได้ ระหว่างที่ document layout ยัง finalize ภายหลัง

## 2026-07-03: ER Naming Baseline

การตัดสินใจ:

- ใช้ ER diagram ล่าสุดเป็น schema naming baseline
- Core entities คือ `USER`, `DOMAINS`, `ASSETS_CATEGORIES`, `ASSETS_TYPES`, `ASSETS`, `PROJECT`, `PROJECT_MEMBERS`, `TRANSACTIONS`, `TRANSACTIONS_ITEMS`, `TRANSACTIONS_APPROVALS`, และ `ASSET_STATUS_HISTORY`
- `transactions_approvals` แทน parallel approvals ด้วยหลาย rows ที่มี `approval_step_sequence` เดียวกัน
- `user.organization_tag` เป็น field ใน ER สำหรับ organization context และต้องรองรับทั้ง level tags และ concrete unit tags
- `due_date` และ `requisition_no` ยังเป็น workflow fields ที่ต้องมี แม้ไม่ได้แสดงใน ER ปัจจุบัน

เหตุผล:

- Markdown ต้องตรงกับ ER ล่าสุด และยังต้องคง workflow rules ที่ยืนยันแล้วสำหรับ overdue และ document numbering
