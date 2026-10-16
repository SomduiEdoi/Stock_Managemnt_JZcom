# Onboarding And Handover

ทบทวน: 2026-10-16 ยึด implementation ปัจจุบัน ไม่ใช่ข้อกำหนดอนาคต เอกสารนี้เป็นจุดเริ่มต้นและ Runbook ส่วนรายละเอียดเดิมให้ตามลิงก์ ไม่เขียนซ้ำทั้งหมด

> **ห้ามรัน `npx prisma migrate reset` ใน Production รวมถึงฐานที่มีข้อมูลจริงหรือข้อมูลที่ยังไม่ได้สำรอง** ห้ามใช้ `db push`, ลบ migration history หรือแก้ Migration ที่สำเร็จไปแล้วเป็นทางลัดแก้ Incident

## 1. Read First

| เรื่อง | เอกสารหลัก |
| --- | --- |
| ขอบเขตและกฎธุรกิจ | [PRD](prd.md), [Rules](rule.md) |
| Schema, API และสถาปัตยกรรม | [Design](design.md), [schema.prisma](../prisma/schema.prisma) |
| Domain ownership และ Transaction Boundary | [Workflow Modules](workflow-modules.md) |
| CI, Repository Hygiene และ Main Protection | [Environment Baseline](environment-baseline.md) |
| AD / บัญชีฉุกเฉินและข้อจำกัด | [Emergency Local Login](emergency-local-login.md) |
| ผลตรวจและงานที่ยังไม่รับรอง | [Task Status](task.md), [Verification History](workflow-implementation-verification.md) |

Decision Log และ Mapping Reports เป็นหลักฐานตามวันที่ ไม่ใช่คำอนุมัติให้แก้ข้อมูลปัจจุบัน

## 2. Architecture And Data Flow

```mermaid
flowchart TD
  Browser --> ReadPage[Server Component / Feature Page]
  ReadPage --> ReadService[src/lib read service]
  ReadService --> Prisma[Prisma Client]
  Browser --> Client[Client Component / Hook]
  Client --> Route[API Route: session + Zod payload + permissions]
  Route --> Facade[src/lib/workflow.ts facade or asset service]
  Facade --> Domain[Request / Approval / Return / Stock domains]
  Domain --> Tx[Prisma transaction: scope validation + guards + mutation + audit]
  Prisma --> DB[(PostgreSQL)]
  Tx --> DB
  Client --> Refresh[Router refresh / navigation]
  Refresh --> ReadPage
```

- การอ่านหน้าไม่จำเป็นต้องผ่าน API; เริ่มตามจาก `src/app` -> `src/features` -> read service ได้โดยตรง
- Mutation ต้องตรวจสิทธิ์ฝั่ง Server; ห้ามเชื่อ UI, ID หรือ warehouseCode จาก Payload อย่างเดียว
- Category/Type/Custom Field ต้องตรง Parent และคลัง ส่วน Asset ตรวจคลังจริง; PATCH ทั่วไปไม่ใช่คำสั่งย้ายคลัง
- Transaction-owning entry points คงขอบเขตเดิม; helper รับ `Prisma.TransactionClient` ของผู้เรียก ห้ามแยกเป็น transaction ใหม่กลาง Flow
- External callers ใช้ `@/lib/workflow` ต่อไป ส่วน Domain Modules import กันโดยตรง ไม่ย้อนผ่าน Facade
- JSON ข้อมูลราคาใช้ [sale-price-groups-schema.ts](../src/lib/sale-price-groups-schema.ts); Prisma Asset ใช้ `toWorkflowAsset` ที่ compiler ตรวจความเข้ากันได้ ไม่ใช้ double cast; Session และ Inventory Preferences มี Runtime Schema แยก

## 3. State Matrix

### TransactionStatus: Business State

| ค่า | ความหมาย | อ่านร่วมกับ |
| --- | --- | --- |
| BORROWED | คำขอ Borrow และอาจยังถือของอยู่ | Workflow, dispatchedAt, approved outcomes |
| USING | คำขอใช้ภายในและอาจยังถือของอยู่ | เช่นเดียวกับ BORROWED |
| RETURNED | Source ปิดจำนวนที่ถือครองครบแล้ว อาจมี SOLD/FAIL/LOST ไม่ใช่คืนคลังทั้งหมด | Outcome แต่ละประเภท |
| COMPLETED | Business state ของ SOLD รวมถึงค่าเริ่มต้นก่อนอนุมัติสำเร็จ | **ต้องตรวจ WorkflowStatus ด้วย** |

`getInitialTransactionStatus` ตั้ง Business State ตอนสร้างคำขอ จึงห้ามใช้ Business State ตัวเดียวตัดสินว่าจ่ายสินค้า/ขายสำเร็จแล้ว

### TransactionWorkflowStatus (WorkflowStatus ใน UI/เอกสาร)

| ค่า | เงื่อนไข / Transition หลัก |
| --- | --- |
| PENDING | คำขอหรือ Derived Sale กำลังรอ Gate; ผ่านครบไป IN_PROGRESS สำหรับการถือครอง หรือ COMPLETED สำหรับขาย |
| REJECTED | ส่งกลับแก้ในเลขเดิม; Resubmit สร้าง approval revision ใหม่กลับ PENDING โดยเก็บประวัติเดิม |
| CANCELLED | จบแบบยกเลิกตาม guard ไม่ใช่สำเร็จ ไม่คืน running number |
| IN_PROGRESS | คำขอเบิกผ่านแล้ว ยังมีการถือครองหรือ Return/Sale ที่ยังไม่ Post; Source ไป COMPLETED เมื่อปิดครบจริง |
| COMPLETED | Gate และผลจำนวนครบตามชนิดคำขอ; Acknowledgement ที่แยกไว้ไม่เปิด Gate กลับมา |

ไม่มี DRAFT หรือ OVERDUE ใน enum นี้ การแก้ Pending ถูกล็อกหลังผู้อนุมัติถัดจาก requester อนุมัติแล้ว ส่วน Rejected มีเส้นทางแก้ไขแยก ห้ามย่อเป็นกฎเดียวโดยไม่อ่าน guards

### AssetStatus

| ค่า | ความหมาย / ทางเปลี่ยน |
| --- | --- |
| READY | Serial พร้อมใช้; Quantity ต้องอ่านยอด Available เพิ่ม; Manual ไป REQUEST/BORROW/USING/SOLD/FAIL/LOST/NEED_CHECK ตาม transition map แต่ REQUEST ถูกจำกัดให้ Request Flow เป็นผู้สร้าง |
| REQUEST | Lock/จองสำหรับขอ ยังไม่ใช่จ่ายจริง; Manual transition map ว่าง ให้ Workflow ปลดหรือจ่าย |
| BORROW | Serial ที่ยืมแล้ว; คืน/ขาย/เสีย/หายผ่าน Return Flow ไม่ผ่าน Manual Status API |
| USING | Serial ใช้ภายใน; ใช้ข้อจำกัดเดียวกับ BORROW |
| SOLD | ไม่พร้อมเบิก; ไม่มี Manual transition ออก |
| FAIL | Manual ไป READY หรือ NEED_CHECK ได้ตามสิทธิ์และ Remark |
| LOST | Manual ไป READY หรือ NEED_CHECK ได้ตามสิทธิ์และ Remark |
| NEED_CHECK | Manual ไป READY/FAIL/LOST ได้; ไม่ใช่ตัวเลือก Return Outcome ปัจจุบัน |

ดู [workflow-rules.ts](../src/lib/workflow-rules.ts) สำหรับ adjacency map จริง ซึ่งใช้กับ Manual API ไม่ใช่ข้อจำกัดทุก Business Workflow สินค้า Quantity อาจคง READY ขณะที่บางจำนวนถูกเบิกแล้ว; NEW/USED เป็น `AssetCondition` แยกจาก AssetStatus

### ReturnBatchState

`ReturnBatch.state` เป็น **String ไม่ใช่ Prisma Enum** ค่าที่ใช้ใน Runtime:

| ค่า | Transition / ผล |
| --- | --- |
| SUBMITTED | รอบคืนกำลังเดิน Lead/Supervisor -> Check -> เอกสารเมื่อจำเป็น -> Final Storeman; ถูก Reject/Cancel หรือจบ COMPLETED |
| REJECTED | แก้เฉพาะรอบตาม guard แล้ว Resubmit เลขเดิม, revision เพิ่ม กลับ SUBMITTED; ประวัติและหลักฐานรุ่นเก่าคงอยู่ |
| CANCELLED | ถอนรอบที่ยังไม่ Post ตาม guard ไม่เพิ่ม/ลดสต๊อกซ้ำ |
| COMPLETED | Final Gates และการ Post ที่เกี่ยวข้องสำเร็จแล้ว; posted outcomes แก้/ลบเหมือน Draft ไม่ได้ |

WAITING_CHECK / WAITING_SIGNED_PDF เป็น Phase ที่อนุมานจาก Approvals/Checks/Evidence ไม่ใช่ค่า state เพิ่มเอง และ Derived SOLD ยังต้องผ่าน BSD Staff ก่อนนับว่าปิดจำนวนขายแล้ว

## 4. Inventory Quantity Invariants

นิยามต่อ Source Item: `Q` = requestedQuantity ที่จ่ายจริง, `A` = ผลรวม Outcome ที่ approvedAt ไม่ว่าง, `P` = จำนวน Outcome ที่ยังไม่ Post และยังมีผลกันจำนวนในรอบนั้น

| ตัวเลข | สูตร / เงื่อนไข |
| --- | --- |
| On-hand | `Asset.assetQuantity` คือจำนวนในคลังปัจจุบัน ไม่ใช่ยอดเริ่มต้นก่อนเบิก |
| Draft Reserved | ผลรวม AssetReservation.quantity ของ stock row |
| Pending Issue Reserved | ผลรวม requestedQuantity เฉพาะ Source Transaction ที่ PENDING/IN_PROGRESS, returnedAt=null, dispatchedAt=null และ toStatus เป็น BORROW/USING/SOLD |
| Reserved | `Draft Reserved + Pending Issue Reserved` |
| Available (Quantity) | `max(0, On-hand - Reserved)`; ใช้ [asset-availability.ts](../src/lib/asset-availability.ts) เป็น Source of Truth |
| IN_USE / Outstanding | สำหรับ BORROW/USING ที่จ่ายแล้ว: `max(0, Q - A)`; ไม่ลบ Pending Outcome เพราะยังไม่อนุมัติจริง และไม่ใช่ DB column ชื่อนี้ |
| Pending Outcome | Unposted allocations (`approvedAt=null`); Server ไม่นับรอบ REJECTED/CANCELLED เป็นรอบกันจำนวนใหม่ แต่ยังแสดงประวัติ/แก้รอบเดิมได้ตาม Context |
| Open Quantity | `max(0, Q - A - P)` สำหรับส่งรอบใหม่; ตอนแก้รอบเดิมไม่หัก unposted allocations ของรอบที่กำลังแก้ซ้ำ |

UI ใช้ [return-quantity.ts](../src/features/transaction-return/return-quantity.ts) กับรายการที่ Page เตรียมให้ รวม fallback resolvedQuantity สำหรับข้อมูลเดิม ส่วน Server ตรวจ Batch state และจำนวนซ้ำใน transaction อีกครั้ง ตัวเลขบนหน้าจอไม่ใช่สิทธิ์ให้ Post

- Dispatch ลด On-hand ครั้งเดียวและมี dispatchedAt; หลังจ่ายแล้วห้ามนำยอดเดิมมาหัก Available ซ้ำ
- RETURN/USED เพิ่มคลังเมื่อ Final Gate ผ่านเท่านั้น; FAIL/LOST ไม่เพิ่ม Ready stock; SOLD จากของที่เบิกแล้วไม่ตัด On-hand ซ้ำ
- `0 <= A <= Q`, `0 <= P <= Q-A` ตาม Context, จำนวนเป็นจำนวนเต็มบวก และห้าม On-hand ติดลบ
- Serial ต้องมี Model Serialized และ Serial จริง จำนวนรายชิ้น=1; ไม่มี Serial ใช้ Quantity ตามกฎปัจจุบัน
- Quantity RETURN/USED ต้องตรง model, warehouse, Stock Code และ condition ที่อนุมัติ; ห้ามจับคู่ Legacy Used ด้วยชื่อคล้าย
- ต้องไม่เพิ่มยอดคืนด้วยการรวม READY outcomes ของ NEW และ USED แล้วบวกซ้ำทั้งสอง bucket

## 5. Local Setup

ใช้ checkout แยก, Node 22, PostgreSQL 16 และ npm lockfile ของโปรเจกต์ อย่าใช้ฐานจริงสำหรับทดลอง

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
# Local-only credentials; this is a new, isolated development database.
docker run --detach --name stock-handover-dev --publish 127.0.0.1:55432:5432 --env POSTGRES_USER=dev --env POSTGRES_PASSWORD=dev-only --env POSTGRES_DB=stock_dev postgres:16
if ($LASTEXITCODE -ne 0) { throw 'Local container creation failed.' }
docker exec stock-handover-dev pg_isready -U dev -d stock_dev
if ($LASTEXITCODE -ne 0) { throw 'Wait for PostgreSQL readiness before continuing.' }
# Continue only when the database is ready.
$env:DATABASE_URL='postgresql://dev:dev-only@127.0.0.1:55432/stock_dev?schema=public'
npm ci
npx prisma generate
npx prisma migrate deploy
```

หยุดเมื่อคำสั่งใดมี Exit Code ไม่เป็น 0 ตั้ง AUTH_SECRET และ AD/Font config ใน `.env` ของเครื่องโดยไม่ Commit ค่า Secret; ตั้ง DATABASE_URL ในไฟล์ให้ตรงฐาน Local ด้วยหากจะเปิด Terminal ใหม่

ต้องการ Demo UI ให้ใช้ `npm run db:seed` **เฉพาะฐาน Local ใหม่ที่สร้างข้างต้น** Script นี้มี Demo Users/รหัสทดสอบและเปลี่ยน Reference Data จึงห้ามใช้ใน Production จากนั้นเตรียม Local Admin ด้วย `node scripts/local-admin.cjs --create-only` และตั้งรหัสผ่านตาม [คู่มือ Local Admin](emergency-local-login.md) ที่ UI เลือก Local Admin ชัดเจน ไม่มี AD fallback อัตโนมัติ

`npm run dev -- --hostname 127.0.0.1 --port 3000` ใช้พอร์ตอื่นถ้าถูกใช้อยู่; ยังไม่ต้อง Import ข้อมูลจริงหรือรัน `db:setup` เพื่อเริ่มอ่านโค้ด

## 6. Integration Test Runbook

ใช้ `stock_ci` แยกจาก Local/Production Database และเปิดทุก Flag ไม่ใช้ Unit pass แทน Integration pass:

```powershell
docker run --detach --rm --name stock-handover-ci --publish 127.0.0.1:55439:5432 --env POSTGRES_USER=ci --env POSTGRES_PASSWORD=ci-disposable-only --env POSTGRES_DB=stock_ci postgres:16
if ($LASTEXITCODE -ne 0) { throw 'Test container creation failed.' }
docker exec stock-handover-ci pg_isready -U ci -d stock_ci
if ($LASTEXITCODE -ne 0) { throw 'Wait for PostgreSQL readiness before continuing.' }
# Continue only after pg_isready succeeds.
$env:DATABASE_URL='postgresql://ci:ci-disposable-only@127.0.0.1:55439/stock_ci?schema=public'
$env:CI='true'
npx prisma migrate deploy
if ($LASTEXITCODE -ne 0) { throw 'Migration failed.' }
node scripts/ci-seed.cjs
if ($LASTEXITCODE -ne 0) { throw 'Reference seed failed.' }
$env:RUN_POSTGRES_WORKFLOW_TESTS='1'
$env:RUN_POSTGRES_CONCURRENCY_TESTS='1'
$env:RUN_POSTGRES_AUTH_TESTS='1'
$env:RUN_POSTGRES_SCOPE_TESTS='1'
$env:DAMAGE_PDF_LAYOUT_SAMPLE=Join-Path $PWD '.artifacts/damage-layout.pdf'
npx tsc --noEmit
if ($LASTEXITCODE -ne 0) { throw 'Typecheck failed.' }
npm run lint
if ($LASTEXITCODE -ne 0) { throw 'Lint failed.' }
npm test -- --no-file-parallelism --reporter=default --reporter=json --outputFile=.artifacts/vitest.json
if ($LASTEXITCODE -ne 0) { throw 'Tests failed.' }
node scripts/check-ci-results.cjs
if ($LASTEXITCODE -ne 0) { throw 'Integration coverage gate failed.' }
# After every test/client has disconnected:
docker stop stock-handover-ci
```

หยุดเมื่อ Migration/Seed/Typecheck/Lint/Test ไม่ผ่าน อย่ารันต่อเพื่อกลบผลที่ล้ม Chrome/Edge และ Thai fonts ต้องพร้อมสำหรับ PDF จริง ดู paths ของ CI ใน [ci.yml](../.github/workflows/ci.yml) Workflow fixture ส่วนใหญ่ rollback; Concurrency/Auth มี cleanup ของตัวเอง จึงห้ามชี้ Flag เหล่านี้ไปฐานจริง

## 7. Production Recovery Policy

### Forward-Fix Is The Default

1. Freeze deployment/affected writes, ระบุ Incident Owner และเก็บ Commit, migration name, logs, สถานะฐานและผลกระทบ ห้ามลอง Reset
2. ตรวจ backup/restore readiness และความเข้ากันได้ของ App/Schema เดิมกับรุ่นใหม่ การย้อน App ไม่ได้ย้อน Schema
3. ถ้า Migration สำเร็จแล้ว ให้แก้ `schema.prisma` บน Dev database แยก แล้วสร้าง Migration **ใหม่**:

```powershell
# Development database only, never production.
npx prisma migrate dev --name rollback_xxx --create-only
```

4. Review SQL ของโฟลเดอร์ timestamp ใหม่ เช่น `20261016..._rollback_xxx` ให้รักษาข้อมูล ใช้ expand/contract หรือ backfill เป็นช่วงหากจำเป็น การสร้าง column เดิมกลับมาไม่สามารถกู้ข้อมูลที่ DROP ไปแล้วได้
5. ทดสอบทั้ง empty database และ staging ที่มีข้อมูลใกล้จริง ตรวจ stock invariants, approvals, PDFs และ app version compatibility; ให้ PR/CI ผ่านและผู้รับผิดชอบอนุมัติ
6. Backup ก่อน Deploy, ตั้ง Production connection จาก Secret Manager แล้วใช้ `npx prisma migrate deploy` ตาม Maintenance Plan; ตรวจ `npx prisma migrate status` และ smoke/invariant checks ก่อนเปิด writes

Migration ที่ **failed/ค้าง** ต้องให้ DBA ตรวจ partial SQL และ `_prisma_migrations.logs` ก่อน อาจต้องแก้ Schema จริงให้สอดคล้องกับแผน recovery แล้วจึงใช้ `npx prisma migrate resolve --rolled-back "<failed_migration_name>"` หรือ `--applied` ตามสภาพที่ตรวจแล้ว **resolve เปลี่ยน metadata ไม่ได้ย้อน SQL/ข้อมูล** ห้ามใช้กับ Migration ที่สำเร็จแล้วเพื่อทำให้ดูเหมือนย้อนสำเร็จ ดู [Prisma recovery guidance](https://www.prisma.io/docs/orm/prisma-migrate/workflows/patching-and-hotfixing) โดยอ้าง CLI รุ่นที่ล็อกใน Repo ไม่คัดลอก flags ของ Prisma รุ่นอื่นมาใช้ทันที

### Backup And Isolated Restore

ตัวอย่างต่อไปนี้เป็น Runbook สำหรับ Operator ที่ได้รับอนุมัติ **ยังไม่ได้รัน Backup/Restore จริงในงานเอกสารนี้** เก็บ Backup เข้ารหัสนอก Repository และจำกัดสิทธิ์ เพราะมีข้อมูลลูกค้า, password hashes, signatures และ PDF Bytes

ตั้ง PostgreSQL service profiles `stock_prod_backup`, `stock_restore_admin`, `stock_restore_target` แยก Host/Database ให้ชัดเจน เก็บ credentials ผ่าน `.pgpass`/PGPASSFILE ที่จำกัดสิทธิ์หรือ Secret Manager ห้ามใส่รหัสผ่านลง Command/Chat/PR ใช้ pg_dump ที่รองรับ Server version และตรวจ exit codes/logs ทุกครั้ง

```powershell
$backupRoot='<approved secure backup directory outside the repository>'
$backupFile=Join-Path $backupRoot ('stock-'+(Get-Date -Format 'yyyyMMdd-HHmmss')+'.dump')
pg_dump --dbname='service=stock_prod_backup' --format=custom --file="$backupFile"
if ($LASTEXITCODE -ne 0) { throw 'Backup failed; stop recovery/deployment.' }
pg_restore --list "$backupFile"
if ($LASTEXITCODE -ne 0) { throw 'Backup archive cannot be inspected.' }

# Profile stock_restore_admin must target an isolated recovery cluster.
psql 'service=stock_restore_admin' -v ON_ERROR_STOP=1 -c 'CREATE DATABASE stock_restore_20261016;'
if ($LASTEXITCODE -ne 0) { throw 'Recovery database creation failed.' }
# Profile stock_restore_target must point to that NEW database, never the live database.
pg_restore --dbname='service=stock_restore_target' --no-owner --no-acl --exit-on-error "$backupFile"
if ($LASTEXITCODE -ne 0) { throw 'Restore failed; do not switch connections.' }
```

ไม่ใช้ `--clean`/`--create` ทับฐานเดิม การ Inspect archive ไม่ใช่หลักฐานว่า Restore ได้ครบ ต้อง Restore และตรวจจริงก่อน Cutover โดย Roles/Owners/Grants ต้องจัดจากแผน Infrastructure ที่ Review แล้ว เพราะตัวอย่างไม่ Restore ACL/Ownership

1. ปิด Network/Outbound ของฐานและ App กู้คืน ไม่ให้ส่งอีเมล/เรียก Integration จริงหรือรับ writes จาก Production
2. ตรวจ Schema/migration history และ App version ที่ตรงกับจุด Backup ก่อน Deploy Migration ใหม่; อย่า migrate ไป latest โดยอัตโนมัติก่อนตรวจความเข้ากันได้
3. ตรวจจำนวน Asset/Transaction/Approval, Reserved/On-hand/Open Quantity, orphan relations, login audit และเปิด Signed PDF/Signature ตัวอย่าง พร้อมตรวจไฟล์ภายนอกที่ imageRef/documentRef อ้างถึง
4. ให้ผู้รับผิดชอบอนุมัติ RPO/data loss ที่ยอมรับได้ กำหนด write freeze และ delta reconciliation ถ้ามี writes หลังจุด Backup ไม่เปิดสองฐานรับ writes พร้อมกัน
5. สลับ DATABASE_URL ผ่าน Secret/Deployment configuration ไปฐานสำรอง แล้ว restart/redeploy เพื่อสร้าง Prisma connections ใหม่ ตรวจ Health/Login/Read-only Smoke ก่อนเปิด writes
6. คงฐานเดิมแบบเก็บหลักฐาน/อ่านอย่างเดียวตามแผน และเฝ้าติดตาม error/stock reconciliation; หลังเปิด writes ใหม่แล้ว การสลับกลับต้องมีแผน reconcile ใหม่ ไม่สลับกลับทันทีจนข้อมูลแยกสาย

Logical dump กู้ได้ตามจุด snapshot ของ Backup ไม่ใช่ PITR หากต้องการ PITR ต้องเตรียม Physical Base Backup + WAL archive ที่ต่อเนื่องและทดสอบ Recovery Target บน Cluster แยกไว้ก่อน; Repo/Docker Compose ปัจจุบันยังไม่ได้ตั้งระบบนี้ ดู [PostgreSQL 16 Backup](https://www.postgresql.org/docs/16/backup.html), [PITR](https://www.postgresql.org/docs/16/continuous-archiving.html) และ [pg_restore](https://www.postgresql.org/docs/16/app-pgrestore.html)

## 8. Handover Acceptance

ผลตรวจของงาน Type Safety นี้: 433 tests ผ่าน ไม่มี Skip บน PostgreSQL ชั่วคราว รวม Auth/Concurrency/Scope/PDF; Typecheck และ ESLint ผ่าน ไม่มี Warning ตรวจลิงก์ภายในครบแล้ว การทดสอบนี้ไม่ใช่การ Deploy/Backup/Restore ของฐานจริง

- CI ที่ Required Check ต้องผ่านและไม่มี Integration ถูก Skip; Merge ผ่าน PR เท่านั้น ไม่ Bypass Admin protection
- Lint warnings เดิมทั้ง 4 จุดและ unused helpers ถูกลบไปแล้ว ไม่ปิด Rule เพื่อซ่อน Warning
- สาธิต Local Admin/AD ตามสิทธิ์, Request/Reject/Edit, Partial Return, checks/evidence, sale pricing และ Source completion
- Backup/Restore drill, PITR, RPO/RTO, Cloud/LDAPS/proxy และ UAT ทุกบทบาทยังต้องรับรองตามแผนจริง เอกสารหรือ Unit Tests ไม่ใช่หลักฐานว่า Production Recovery ผ่านแล้ว
