# Task Status: Warehouse Management

อัปเดตเอกสาร: 2026-10-16
หลักฐานทดสอบล่าสุด: 2026-10-16
[x] ใช้งาน/ตรวจแล้วในขอบเขตที่ระบุ; [~] มีบางส่วน/ยังไม่ตรวจรับครบ; [ ] ยังไม่มีหลักฐานว่าครบ

## 1. Implemented Baseline

- [x] Runtime PostgreSQL, Prisma migrations และ import audit
- [x] RoleCode ADMIN / STOREMAN / USER, หลาย Organization Assignments และ primary context
- [x] Storeman/Warehouse Manager รายคลัง แยก Approval ออกจาก Acknowledgment
- [x] Serial/Quantity จาก Model และ Serial Number; ลบ warehouse tracking family/legacy tracking fields
- [x] Asset create/edit/detail, dynamic warehouse, category/type และ custom fields
- [x] Request Cart, locks/reservations, dispatched quantity accounting และหลาย Warehouse
- [x] Requester/Lead/Supervisor/Storeman routing ตามโค้ด; SOLD เพิ่ม BSD Staff ไม่ใช้ BSD Manager gate
- [x] Reject/Edit/Resubmit เลขเดิมพร้อม history; Cancel API/UX ตาม guard
- [x] ReturnBatch/Revision/Outcome, manual checks, signed document, Final Storeman และ Derived SOLD
- [x] NEW/USED buckets, return stock validation และ Source completion ตามจำนวนจริง
- [x] Sale Price Groups, Split/Remove, Save Draft, Server-calculated totals สองตำแหน่ง
- [x] Request No. รวมรอบคืน, monthly lock/limit และ From Source REQ สำหรับ Derived SOLD
- [x] Search autocomplete/Enter/Clear, instant filters, Parent Checkbox และ dismissable Columns/Side Sheet
- [x] รูปแบบ Project ส่วนกลางและข้อยกเว้นคอลัมน์ Project Name; Asset History request links/UUID display cleanup
- [x] Auto USED remark จาก source relation โดยคง note เดิม
- [x] AD Verify ผ่าน UI, Local Admin ฉุกเฉิน, persistent login limits/audit และแยก AD unavailable
- [x] จำกัด signed PDF body/file size และคง evidence revisions
- [x] Local admin Login สำเร็จจริงและมี audit; ไม่บันทึกรหัสผ่านลงเอกสาร

## 2. Verification ที่มีหลักฐาน

- [x] Type safety / handover: Prisma Asset mapper แทน double casts, Zod สำหรับ price-group JSON/Session/Inventory Preferences; 433 tests ผ่านบน PostgreSQL ชั่วคราว ไม่มี skip, Typecheck/Lint ผ่าน ดู [Onboarding Handover](ONBOARDING_HANDOVER.md)

- [x] Domain refactor: คง Transaction Entry Points 16 จุด, facade/error identity, รวม reservation query/calculation และ UI golden snapshots 4 สถานะ; 403 tests ผ่านบน PostgreSQL ชั่วคราว ไม่มี skip ดู [Module Map](workflow-modules.md)

- [x] 2026-10-16 Environment Baseline: PostgreSQL 16 ว่าง migrate deploy ครบ 58 ชุด; 390 tests ผ่าน ไม่มี skip รวม real PDF sample; Typecheck ผ่านและ Lint ไม่มี error (4 warnings เดิม)
- [x] เพิ่ม GitHub Actions สำหรับทุก PR เข้า main เปิด workflow/concurrency/auth/scope flags และ fail เมื่อพบ skipped/todo หรือ integration suite ไม่ครบ; ดู [Environment Baseline](environment-baseline.md)

- [x] TypeScript ผ่าน และ Production build ผ่าน
- [x] ผลล่าสุด: Typecheck ผ่าน, Lint 0 errors / 0 warnings และ 433 tests passed ไม่มี skip; ตัวเลข 390/403 และ warnings ข้างต้นเป็นหลักฐานย้อนหลัง ไม่ใช่สถานะปัจจุบัน
- [x] CI บังคับ Production Build (`npm run build`) หลัง Tests และการตรวจ skipped/missing suites; ต้องผ่าน Required Check ของ PR ก่อน Merge
- [x] 2026-10-15: full suite เปิด PostgreSQL workflow/auth/concurrency ได้ 372 passed, 1 skipped
- [x] เปิด DAMAGE_PDF_LAYOUT_SAMPLE รัน PDF suite แยก 19 passed รวม case ที่ถูก skip จึงตรวจครบ 373 unique cases ใน baseline นี้
- [x] PostgreSQL rollback workflow: rejected edit เลขเดิม, asset serial edits, approval gates/partial posting
- [x] PostgreSQL concurrency: ส่งคืนพร้อมกันสำเร็จครั้งเดียว, final approve ไม่ Post Stock ซ้ำ
- [x] PostgreSQL login limiter: concurrent attempts อนุญาต 5 ครั้งตาม window แล้ว block
- [x] PDF ตัวอย่างสองหน้า ไทย/อังกฤษ render จริงและตรวจภาพ ไม่ใช้แทนการตรวจเอกสารธุรกิจทุกแบบ
- [x] Production runtime smoke: session Local Admin, Dashboard/Inventory/Project/Logs, Search/Clear/Columns และ unauthenticated API protection ที่เลือกตรวจ
- [x] หลังทดสอบ Active Assets 1,561: ไม่พบ negative quantity, serialized quantity !=1 หรือ approved outcome เกิน requested ในเงื่อนไขตรวจ
- [x] QA concurrency users/warehouses/transactions ไม่เหลือค้าง; schema ณ เวลาตรวจ migration up to date
- [~] ตัวเลขข้างต้นเป็นผล ณ วันที่ตรวจ ไม่ใช่จำนวนสด และไม่ใช่หลักฐานว่าไม่มีบั๊กทุกกรณี

## 3. ยังต้องตรวจรับก่อน Production

### Pre-Production Launch Checklist (สำหรับทีมรับช่วงต่อก่อนขึ้นใช้งานจริง)

- [ ] **Dependency Security Update:** อัปเดต Patch แพ็กเกจ Next.js เพื่อแก้ช่องโหว่ RCE และอัปเดต/เปลี่ยนแหล่งแพ็กเกจ `xlsx` เป็นรุ่นที่แก้ช่องโหว่แล้ว; ตรวจ advisory และรัน CI ใหม่ ไม่ใช้ `npm audit fix --force` โดยไม่ Review
- [ ] **Environment & Security Drill:** ทดสอบ Backup/Restore Data ลงฐานแยกและตรวจข้อมูล/PDF ครบ พร้อมทดสอบ LDAPS/HTTPS บน Server จริง
- [ ] **End-to-End UAT:** ทดสอบ Workflow การเบิก/คืน/ขายจริงร่วมกับผู้ใช้ทุก Role และบันทึกผลตรวจรับ

รายละเอียดประกอบการตรวจรับ:

- [ ] Backup/Restore drill ลงฐานข้อมูลแยก รวม PDF, signatures และ audit
- [ ] AD outage จริงใน isolated environment ไม่หยุดบริการร่วม
- [ ] Cloud/HTTPS/LDAPS/Proxy headers/cookies และ edge upload/concurrency limits
- [ ] Browser UAT ครบทุกบทบาท/คลัง/การเปลี่ยน assignment ไม่ถือ unit/integration ว่าเท่ากับ UAT
- [ ] Multi-user load/network interruption และ operational monitoring ตามปริมาณใช้งานจริง
- [ ] ธุรกิจรับรอง PDF/Excel, ราคา, signatures และรูปแบบพิมพ์ทุกชนิด
- [ ] ตรวจหมายเหตุ/UUID และหัวข้อ Customer / Project ที่ยังเหลือใน Inventory/Problem Items/Logs
- [x] เพิ่มขั้นตอน CI/ฐานข้อมูลทดสอบให้รัน Integration/Concurrency โดยไม่ต้องเปิดด้วยมือ
- [ ] กำหนด retention/monitoring ของ login audits และการดูแลบัญชีฉุกเฉิน

## 4. งานฐานข้อมูลที่ยังไม่อนุมัติให้เปลี่ยน

- [ ] ตรวจ Normalize typeName/assetTypeId, leadUserId/project_members และ legacy User organization fields
- [ ] แยก system-generated remark จาก user note เป็น structured data หากอนุมัติ
- [ ] ตรวจ Unique/FK/Check Constraints/Indexes และแผน cleanup ข้อมูลนำเข้า
- [ ] ตรวจ/อนุมัติ Legacy Used Mapping ทีละกลุ่มก่อน apply บนสำเนา
- [ ] ไม่ลบ table/column เพราะแค่ไม่มีแถว และไม่ลบ audit/snapshots ด้วยเหตุว่าข้อมูลซ้ำ

## 5. วิธีรันทดสอบ

```powershell
npm run typecheck
npm test
npm run build
```

Integration ปิดตามค่าเริ่มต้นและต้องมี PostgreSQL/schema พร้อม:
- RUN_POSTGRES_WORKFLOW_TESTS=1: fixture ภายใน transaction และ rollback
- RUN_POSTGRES_CONCURRENCY_TESTS=1: สร้าง QA fixtures แยกแล้ว cleanup เฉพาะชุดทดสอบ
- RUN_POSTGRES_AUTH_TESTS=1: ทดสอบ counters แยก แล้วล้างเฉพาะ key ที่สร้าง
- RUN_POSTGRES_SCOPE_TESTS=1: negative API ownership tests บน PostgreSQL ภายใน transaction ที่ rollback เสมอ
- DAMAGE_PDF_LAYOUT_SAMPLE=<absolute PDF output path>: Chrome/Edge + fonts สำหรับ layout sample

โหลด environment ให้ถูกฐานก่อนรัน ห้ามรันกับ Production โดยไม่อนุมัติและไม่มี isolation/backup ที่เหมาะสม
