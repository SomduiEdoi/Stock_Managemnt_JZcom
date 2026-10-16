# Warehouse Management

อัปเดตฐานอ้างอิง: 2026-10-16

เริ่มอ่านระบบจากเอกสารหลักตามลำดับด้านล่าง แต่ละไฟล์อธิบายพฤติกรรมที่โค้ดและ Prisma schema กำหนด

## เอกสาร

1. [PRD](docs/prd.md): วัตถุประสงค์ ความสามารถ และ workflow ตั้งแต่คำขอจนปิดรายการ
2. [Rules](docs/rule.md): invariants ของสต๊อก สิทธิ์ ราคา และเอกสาร
3. [Design](docs/design.md): ความสัมพันธ์ข้อมูล แผนผังโค้ด และ API
4. [Issue / Return Use Cases](docs/issue-return-use-cases.md): กรณีใช้งานและเงื่อนไขแต่ละขั้น
5. [Emergency Local Login](docs/emergency-local-login.md): ตั้งค่าบัญชี Local Admin และข้อจำกัดด้านความปลอดภัย

เอกสารติดตามงานและหลักฐานแยกจากข้อกำหนดระบบ: [Task Status](docs/task.md), [Decision Log](docs/decision-log.md), [Verification History](docs/workflow-implementation-verification.md) และ [Used Model Mapping](docs/generated-used-model-mapping.md)

## ภาพรวมระบบ

- Next.js 15, React, TypeScript, Tailwind CSS, Prisma และ PostgreSQL
- PostgreSQL เป็นแหล่งข้อมูล runtime; CSV/SharePoint เป็นข้อมูลนำเข้าหรือ bootstrap ไม่ใช่ Master ที่อ่านสด
- System roles ในฐานข้อมูลคือ `ADMIN`, `STOREMAN`, `USER`
- ผู้ใช้มีหลาย Organization Assignments; เลือก Storeman และ Warehouse Manager ในบริบท Warehouse ไม่ใช้ Head/Stock Controller Tag ในฟอร์ม User
- สินค้าเป็น SERIAL เมื่อ `AssetModel.isSerialized=true` และมี Serial Number; กรณีอื่นทำงานเป็น QUANTITY
- Quantity จองผ่าน Cart/คำขอที่ยังไม่จ่าย และตัด On-hand เมื่อจ่ายจริง; ห้ามหัก Open Quantity ของที่จ่ายแล้วซ้ำ
- คำขอเบิกมี Requester Confirmation, Project Lead และ/หรือ Supervisor ตามเงื่อนไขจริง ก่อน Storeman ทุกคลัง; SOLD เพิ่ม BSD Staff
- Warehouse Manager และ BSD มีงานรับทราบแยกจาก Approval Gate; การขายอนุมัติราคาขั้นสุดท้ายโดย BSD Staff
- คืนเป็น `ReturnBatch` และ `TransactionItemOutcome`; ส่วนขายจากคืนมี Derived SOLD แยก
- RETURN/USED/FAIL/LOST ต้องผ่าน Flow คืน; USED เป็นสภาพสินค้า ไม่ใช่ AssetStatus หรือ Product Model ใหม่
- Request No. ใช้ `REQ-YYYYMMDD-XX`, วันที่ Asia/Bangkok, Running รายเดือนสูงสุด 99 รวมคำขอและรอบคืน
- Derived SOLD ไม่ออก Running ใหม่ แสดง `From REQ-...`
- ราคาแบ่งกลุ่มได้ คำนวณ Group Total/Grand Total บน Server ด้วยหน่วยสตางค์และเก็บ Decimal สองตำแหน่ง
- ไม่คำนวณ Overdue จาก dueDate

## Authentication

- หน้า Login เลือก Active Directory หรือ Local Admin อย่างชัดเจน ไม่มีการ fallback อัตโนมัติ
- AD ใช้ Email/Password; Add/Edit บัญชี AD ต้อง Verify AD ผ่านก่อนบันทึก ไม่มี Input AD Username
- บัญชีค้นหา Directory ใช้สิทธิ์อ่านและตั้งค่าใน environment ห้าม commit รหัสผ่าน
- Production ต้องใช้การเชื่อมต่อ AD ที่เข้ารหัสตามนโยบาย; ค่า LDAP ไม่เข้ารหัสเป็นเพียงข้อยกเว้นสำหรับสภาพแวดล้อมทดสอบที่ตั้งใจอนุญาต
- Local Admin ต้องมี localUsername, bcrypt hash, Active และ ADMIN role; บัญชีฉุกเฉินชื่อ `admin` ไม่มี default password
- Login counters อยู่ PostgreSQL; แยก 401, 429 และ 503 พร้อม Audit
- ดูรายละเอียดใน [Emergency Local Login](docs/emergency-local-login.md) ไม่คัดลอก Secret ลงเอกสาร

## การใช้งานและตรวจสอบ

```powershell
npm install
npx prisma generate
npx prisma migrate status
npm run dev -- --hostname 127.0.0.1 --port 3000
npm run typecheck
npm test
npm run build
```

ตรวจและสำรองข้อมูลก่อนใช้ Migration กับฐานข้อมูลที่มีข้อมูลจริง ห้าม reset ฐานข้อมูลเพื่อแก้ Migration โดยไม่อนุมัติ

ผลการทดสอบและขอบเขตที่ตรวจรับบันทึกแยกใน [Task Status](docs/task.md) และ [Verification History](docs/workflow-implementation-verification.md)

การส่งต่อ, PostgreSQL ชั่วคราว และ CI Gate ดู [Environment Baseline](docs/environment-baseline.md)

ทีมพัฒนาใหม่เริ่มที่ [Onboarding And Handover](docs/ONBOARDING_HANDOVER.md) สำหรับ State Matrix, จำนวนสต๊อก และ Recovery Runbook
