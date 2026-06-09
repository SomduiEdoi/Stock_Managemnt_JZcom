# Technical Design Document

## Project Name

Stock Management System

## Document Purpose

เอกสารนี้อธิบายแนวทางสร้างระบบ Stock Management System ในเชิงเทคนิค โดยอิงจาก requirement ล่าสุดที่ระบบเป็น serialized asset management ไม่ใช่ระบบ stock quantity

เป้าหมายหลักคือสร้างเว็บแอปที่จัดการ asset รายชิ้นด้วย serial no., status, domain permission และ status history พร้อมรองรับ migration จาก SharePoint เดิม

## Technical Direction

ระบบนี้ควรออกแบบด้วยแนวคิด:

- 1 physical item = 1 asset record
- Serial no. เป็นตัวระบุ item รายชิ้น
- ไม่มี quantity field สำหรับ serialized asset ใน MVP
- Status ปัจจุบันอยู่บน asset record
- ทุกการเปลี่ยน status ต้องถูกบันทึกใน asset status history
- Permission ต้องคุมทั้ง role และ domain เช่น Server/Network
- SharePoint migration ต้องตรวจข้อมูลผิดพลาดและ duplicate serial no.
- Source files are `src/data/Network.csv` and `src/data/Server.csv`
- Importer must skip the SharePoint `ListSchema=...` first line before parsing CSV headers
- `QTY` and `FG` from SharePoint are legacy/reference fields only, not stock balance logic
- Viewer users have read-only access and cannot mutate records
- Rent and borrow use the same `BORROW` status/workflow in MVP

## Recommended Tech Stack

### Frontend

- Framework: Next.js
- Language: TypeScript
- Styling: Tailwind CSS
- UI Components: shadcn/ui
- Form Handling: React Hook Form
- Validation: Zod
- Data Fetching: TanStack Query หรือ server actions หากใช้ Next.js

### Backend

- Runtime: Node.js
- Framework: Next.js full-stack with API routes/server actions
- Language: TypeScript
- Validation: Zod
- Authentication: cookie-based session
- Password Hashing: bcrypt หรือ argon2

### Database

- Database: PostgreSQL
- ORM: Prisma
- Migration: ORM migration tool

### Import Tools

- CSV parser สำหรับ SharePoint export แบบ CSV
- Excel parser สำหรับกรณีที่ export เป็น `.xlsx` ในอนาคต

## SharePoint Source Data

### Source Files

```text
D:\Internship\Stock_Management\src\data\Network.csv
D:\Internship\Stock_Management\src\data\Server.csv
```

### CSV Format Rule

ไฟล์ export มีบรรทัดแรกเป็น SharePoint schema metadata:

```text
ListSchema={...}
```

ดังนั้น importer ต้องข้ามบรรทัดแรก และใช้บรรทัดที่สองเป็น CSV header จริง

### src/data/Network.csv Profile

```text
Rows: 594
Blank serial no.: 0
Duplicate serial no.: 0
Columns: Image, Category, Types, Brand, Model, Comment, Part No., Serial No., Stock Code, QTY, FG, Status, Location, Remark
Statuses: Ready 371, Sold 171, Borrow 25, Using 12, Need Check 8, Fail 4, Lost 2, Wait 1
Categories: Connector, Network, Accessory
Types: Module, AccessPoint, Switch, Cable, Firewall, Power Supply Swtich, Injector, SparePart, Router
```

### src/data/Server.csv Profile

```text
Rows: 551
Blank serial no.: 0
Duplicate serial no.: 0
Columns: Image, Category, Types, Brand, Model, Part No., Serial No., Description, Stock Code, QTY, FG, Status, Location, Remark, Comment
Statuses: Ready 473, Sold 38, Borrow 18, Using 8, Fail 7, Wait 5, Lost 1, Need Check 1
Categories: Accessories, HDD&SSD, Connector, HPE, Storage, Dell, Fujitsu, Nutanix, Cisco, IBM, SuperMicro
Types: SAS, Card, Memory, Server, SATA, Module, Power Supply Server, Sparepart
```

### Field Mapping

```text
Source file name     -> asset domain
Category             -> asset_categories.name
Types                -> asset_models.type or subtype field
Brand                -> asset_models.brand
Model                -> asset_models.name
Part No.             -> asset_models.part_no
Description          -> asset_models.description
Serial No.           -> assets.serial_no
Stock Code           -> assets.stock_code
Status               -> assets.status
Location             -> locations.name or assets.location_text
Remark + Comment     -> assets.note and initial history note
Image                -> assets.image_ref
QTY                  -> assets.legacy_qty
FG                   -> assets.legacy_fg
```

## Suggested Architecture

สำหรับ MVP ใช้ Next.js full-stack monolith เพื่อให้พัฒนาเร็วและดูแลง่าย

```text
Browser
  |
  v
Frontend Pages / Components
  |
  v
API Routes / Server Actions
  |
  v
Service Layer
  |
  v
Repository / ORM
  |
  v
PostgreSQL
```

## Application Layers

### UI Layer

รับผิดชอบ:

- แสดงรายการ asset
- ค้นหาและกรองข้อมูล
- แสดง asset detail และ history
- รับ input จาก forms
- แสดง validation, loading, empty และ error states

ไม่ควรรับผิดชอบ:

- ตัดสินสิทธิ์สำคัญเพียงฝั่ง client
- เปลี่ยน status โดยไม่ผ่าน API/service
- map migration data เข้าฐานข้อมูลโดยตรง

### API Layer

รับผิดชอบ:

- authentication
- authorization
- validate request
- call service layer
- return response format ที่สม่ำเสมอ

### Service Layer

รับผิดชอบ:

- asset business rules
- domain permission checks
- status transition validation
- database transaction สำหรับ status update
- migration validation และ import
- สร้าง status history ทุกครั้งที่ status เปลี่ยน

### Repository Layer

รับผิดชอบ:

- database queries
- create/update records
- pagination/filter/search queries

## Folder Structure

ตัวอย่างหากใช้ Next.js:

```text
src/
  app/
    dashboard/
    assets/
      [id]/
      new/
    imports/
    reports/
    settings/
    api/
  components/
    ui/
    layout/
    assets/
    forms/
    tables/
  lib/
    auth.ts
    db.ts
    permissions.ts
    response.ts
    validators/
  modules/
    assets/
      asset.repository.ts
      asset.service.ts
      asset.schema.ts
      asset-status.ts
    asset-models/
    categories/
    locations/
    imports/
      import.repository.ts
      import.service.ts
      sharepoint-mapper.ts
    users/
  types/
  tests/
prisma/
  schema.prisma
  migrations/
```

## Data Model Overview

Core tables:

```text
users
roles
user_roles
asset_domains
user_domain_permissions
asset_categories
asset_models
locations
assets
asset_status_histories
migration_batches
migration_rows
```

## Status Enum

Allowed asset statuses:

```text
READY
BORROW
USING
SOLD
FAIL
LOST
NEED_CHECK
WAIT
```

Display labels:

```text
READY       = Ready
BORROW      = Borrow
USING       = Using
SOLD        = Sold
FAIL        = Fail
LOST        = Lost
NEED_CHECK  = Need Check
WAIT        = Wait
```

## Database Schema

### users

```text
id              uuid primary key
name            varchar not null
email           varchar not null unique
password_hash   varchar not null
is_active       boolean not null default true
created_at      timestamp not null
updated_at      timestamp not null
```

### roles

```text
id              uuid primary key
code            varchar not null unique
name            varchar not null
description     text
created_at      timestamp not null
updated_at      timestamp not null
```

Default roles:

```text
ADMIN
STOCK_OWNER
VIEWER
```

### user_roles

```text
user_id         uuid not null references users(id)
role_id         uuid not null references roles(id)
created_at      timestamp not null
primary key (user_id, role_id)
```

### asset_domains

```text
id              uuid primary key
code            varchar not null unique
name            varchar not null
description     text
is_active       boolean not null default true
created_at      timestamp not null
updated_at      timestamp not null
```

Default domains:

```text
SERVER
NETWORK
```

### user_domain_permissions

ใช้คุมว่า user แต่ละคนดูหรือจัดการ domain ไหนได้

```text
id              uuid primary key
user_id         uuid not null references users(id)
domain_id       uuid not null references asset_domains(id)
can_view        boolean not null default true
can_manage      boolean not null default false
created_at      timestamp not null
updated_at      timestamp not null
unique(user_id, domain_id)
```

ตัวอย่าง:

```text
P' Oak  -> SERVER can_manage, NETWORK can_manage
P' Arm  -> SERVER can_manage
P' Mek  -> NETWORK can_manage
Viewer  -> can_view only
```

### asset_categories

```text
id              uuid primary key
domain_id       uuid not null references asset_domains(id)
name            varchar not null
description     text
is_active       boolean not null default true
created_at      timestamp not null
updated_at      timestamp not null
unique(domain_id, name)
```

### asset_models

ใช้เก็บชื่อรุ่นหรือชนิดของของ เช่น `HPE Fan For DL380 DL388 Gen9`

```text
id              uuid primary key
domain_id       uuid not null references asset_domains(id)
category_id     uuid references asset_categories(id)
name            varchar not null
brand           varchar
model_no        varchar
part_no         varchar
type_name       varchar
description     text
is_active       boolean not null default true
created_at      timestamp not null
updated_at      timestamp not null
```

Indexes:

```text
index asset_models_domain_id_idx on asset_models(domain_id)
index asset_models_category_id_idx on asset_models(category_id)
index asset_models_name_idx on asset_models(name)
```

### locations

```text
id              uuid primary key
name            varchar not null unique
code            varchar unique
description     text
is_active       boolean not null default true
created_at      timestamp not null
updated_at      timestamp not null
```

### assets

ใช้เก็บของจริง 1 ชิ้นต่อ 1 record

```text
id                    uuid primary key
asset_model_id        uuid not null references asset_models(id)
domain_id             uuid not null references asset_domains(id)
location_id           uuid references locations(id)
serial_no             varchar not null
asset_no              varchar
stock_code            varchar
status                varchar not null
note                  text
image_ref             text
legacy_qty            integer
legacy_fg             integer
location_text         text
source_system         varchar
source_record_id      varchar
migration_batch_id    uuid references migration_batches(id)
is_active             boolean not null default true
created_by            uuid references users(id)
updated_by            uuid references users(id)
created_at            timestamp not null
updated_at            timestamp not null
```

Rules:

- `serial_no` ต้องไม่ซ้ำในระบบสำหรับ asset ที่ active
- `domain_id` ต้องตรงกับ domain ของ asset model
- `status` ต้องเป็นค่าที่ระบบรองรับ
- `note` ใช้เก็บ note ล่าสุดหรือรายละเอียดทั่วไปของ asset
- `legacy_qty` และ `legacy_fg` ใช้เก็บข้อมูลเดิมจาก SharePoint เท่านั้น ห้ามใช้เป็น stock balance
- `location_text` ใช้เก็บ location เดิม หากยังไม่ map เป็น `locations` record

Indexes:

```text
unique index assets_serial_no_unique on assets(serial_no)
index assets_domain_id_idx on assets(domain_id)
index assets_status_idx on assets(status)
index assets_location_id_idx on assets(location_id)
index assets_asset_model_id_idx on assets(asset_model_id)
index assets_source_record_id_idx on assets(source_record_id)
index assets_stock_code_idx on assets(stock_code)
```

### asset_status_histories

ใช้เก็บ audit trail ทุกครั้งที่ asset เปลี่ยน status

```text
id              uuid primary key
asset_id        uuid not null references assets(id)
from_status     varchar
to_status       varchar not null
action_type     varchar not null
note            text
changed_by      uuid not null references users(id)
changed_at      timestamp not null
```

Allowed `action_type` values:

```text
CREATE
STATUS_CHANGE
BORROW
RETURN
USE_INTERNAL
SELL
MARK_FAIL
MARK_LOST
MARK_NEED_CHECK
MARK_WAIT
STOCK_CHECK
IMPORT
```

Indexes:

```text
index asset_status_histories_asset_id_idx on asset_status_histories(asset_id)
index asset_status_histories_to_status_idx on asset_status_histories(to_status)
index asset_status_histories_changed_at_idx on asset_status_histories(changed_at)
index asset_status_histories_changed_by_idx on asset_status_histories(changed_by)
```

### migration_batches

```text
id              uuid primary key
source_system   varchar not null default 'SharePoint'
file_name       varchar
status          varchar not null
total_rows      integer not null default 0
success_rows    integer not null default 0
failed_rows     integer not null default 0
created_by      uuid not null references users(id)
created_at      timestamp not null
completed_at    timestamp
```

Allowed `status` values:

```text
PENDING
PROCESSING
COMPLETED
COMPLETED_WITH_ERRORS
FAILED
```

### migration_rows

```text
id                  uuid primary key
migration_batch_id  uuid not null references migration_batches(id)
row_number          integer not null
raw_data            jsonb not null
mapped_data         jsonb
status              varchar not null
error_message       text
asset_id            uuid references assets(id)
created_at          timestamp not null
```

Allowed `status` values:

```text
PENDING
IMPORTED
FAILED
SKIPPED
NEEDS_REVIEW
```

## Status Transition Rules

Normal allowed transitions:

```text
WAIT        -> READY, NEED_CHECK, FAIL
READY       -> BORROW, USING, SOLD, FAIL, LOST, NEED_CHECK, WAIT
BORROW      -> READY, FAIL, LOST, NEED_CHECK, SOLD
USING       -> READY, FAIL, LOST, NEED_CHECK, SOLD
FAIL        -> READY, NEED_CHECK, LOST, SOLD
NEED_CHECK  -> READY, FAIL, LOST, WAIT
LOST        -> NEED_CHECK, READY
SOLD        -> no normal transition
```

Notes:

- `SOLD` เป็น terminal status ใน workflow ปกติ
- Admin อาจ override status ได้ในอนาคต แต่ต้องมี audit log และ note
- `WAIT` ต้องมี note เพื่ออธิบายว่ารออะไร

Statuses that require note:

```text
BORROW
USING
SOLD
FAIL
LOST
NEED_CHECK
WAIT
```

Returning from `BORROW` to `READY` should also require note because it refers to the original signed paper document.

## Service Design

### createAsset

Responsibilities:

1. Validate user can manage domain
2. Validate serial no. uniqueness
3. Validate asset model and domain match
4. Create asset
5. Create initial asset status history

Transaction:

- Create asset and history in the same database transaction

### updateAsset

Responsibilities:

1. Load asset
2. Validate user can manage asset domain
3. Prevent changing serial no. to duplicate value
4. Update editable fields

Editable fields:

- asset model
- serial no.
- asset no.
- location
- note
- active status

### changeAssetStatus

Responsibilities:

1. Load asset with row lock
2. Validate user can manage asset domain
3. Validate target status
4. Validate transition
5. Validate note requirement
6. Update current asset status
7. Create asset status history

Transaction:

- Lock asset row
- Update asset
- Insert history
- Commit

### importSharePointData

Responsibilities:

1. Create migration batch
2. Detect and skip SharePoint `ListSchema=...` first line for CSV files
3. Parse CSV/Excel
4. Map source file name to domain
5. Map fields to internal schema
6. Validate required fields
7. Validate status mapping
8. Validate duplicate serial no.
9. Store `QTY` and `FG` as legacy/reference fields only
10. Create asset models if allowed
11. Create asset records
12. Create initial status histories
13. Create migration rows for success/failure
14. Complete migration batch

## Concurrency Control

ถึงระบบนี้ไม่มี quantity แต่ยังต้องกันการแก้สถานะซ้อนกัน:

- ทุก status update ต้องอยู่ใน database transaction
- ต้อง lock asset row ก่อนเปลี่ยน status
- ใช้ `SELECT ... FOR UPDATE` หรือ ORM transaction mechanism ที่ equivalent
- ห้าม update asset status และ insert history แยก transaction
- หาก status ถูกเปลี่ยนโดยคนอื่นก่อน submit ต้องแจ้ง conflict หรือ reload ข้อมูลล่าสุด

## API Design

Base path:

```text
/api
```

Response format:

```json
{
  "data": {},
  "error": null
}
```

Error format:

```json
{
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request",
    "details": {}
  }
}
```

## API Endpoints

### Auth

```text
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me
```

### Users and Permissions

```text
GET    /api/users
POST   /api/users
GET    /api/users/:id
PATCH  /api/users/:id
PATCH  /api/users/:id/status
PATCH  /api/users/:id/domain-permissions
```

### Domains

```text
GET /api/domains
```

### Categories

```text
GET    /api/categories
POST   /api/categories
PATCH  /api/categories/:id
PATCH  /api/categories/:id/status
```

Query params:

```text
domainId
isActive
```

### Asset Models

```text
GET    /api/asset-models
POST   /api/asset-models
GET    /api/asset-models/:id
PATCH  /api/asset-models/:id
PATCH  /api/asset-models/:id/status
```

Query params:

```text
search
domainId
categoryId
isActive
page
limit
```

### Assets

```text
GET    /api/assets
POST   /api/assets
GET    /api/assets/:id
PATCH  /api/assets/:id
PATCH  /api/assets/:id/status
GET    /api/assets/:id/history
```

Query params:

```text
search
serialNo
domainId
modelId
categoryId
locationId
status
page
limit
```

### Asset Status Actions

Optional action-specific endpoints if the UI wants clearer workflows:

```text
POST /api/assets/:id/borrow
POST /api/assets/:id/return
POST /api/assets/:id/use-internal
POST /api/assets/:id/sell
POST /api/assets/:id/mark-fail
POST /api/assets/:id/mark-lost
POST /api/assets/:id/mark-need-check
POST /api/assets/:id/mark-wait
```

### Imports

```text
POST /api/imports/sharepoint/preview
POST /api/imports/sharepoint/commit
GET  /api/imports
GET  /api/imports/:id
GET  /api/imports/:id/rows
```

### Reports

```text
GET /api/reports/assets-by-status
GET /api/reports/assets-by-domain
GET /api/reports/borrowed-assets
GET /api/reports/using-assets
GET /api/reports/sold-assets
GET /api/reports/problem-assets
GET /api/reports/status-history
```

## Request Examples

### Create Asset

```json
{
  "assetModelId": "uuid",
  "domainId": "uuid",
  "locationId": "uuid",
  "serialNo": "SN001",
  "assetNo": "ASSET-001",
  "status": "READY",
  "note": "Initial registration"
}
```

### Change Asset Status

```json
{
  "status": "BORROW",
  "note": "Borrowed by Customer A, paper document REF-001"
}
```

### Return Borrowed Asset

```json
{
  "status": "READY",
  "note": "Returned with original signed document REF-001, checked and usable"
}
```

### Mark Need Check

```json
{
  "status": "NEED_CHECK",
  "note": "Stock check 2026-06 found item missing from expected shelf"
}
```

## Validation Rules

### Asset

- assetModelId required
- domainId required
- serialNo required
- serialNo unique
- status required
- status must be allowed enum
- asset model domain must match asset domain

### Status Change

- target status required
- target status must be allowed enum
- user must have manage permission for asset domain
- note required for BORROW, USING, SOLD, FAIL, LOST, NEED_CHECK, WAIT
- note required when returning BORROW to READY
- SOLD asset cannot be changed in normal workflow

### Migration

- source file required
- CSV files may include first-line SharePoint `ListSchema=...`; parser must skip it
- serial no. column required
- model/product name column required
- domain is inferred from source file: `src/data/Network.csv` -> NETWORK, `src/data/Server.csv` -> SERVER
- unknown status must be mapped or marked NEEDS_REVIEW
- duplicate serial no. must fail or be skipped
- blank serial no. must fail
- QTY and FG must not affect asset count or status logic

## Authorization Matrix

```text
Feature                     Admin   Server Owner   Network Owner   Viewer
Dashboard all domains       yes     no             no              read
Dashboard own domain        yes     yes            yes             read
View Server assets          yes     yes            read            read
View Network assets         yes     read           yes             read
Manage Server assets        yes     yes            no              no
Manage Network assets       yes     no             yes             no
Change Server status        yes     yes            no              no
Change Network status       yes     no             yes             no
Import SharePoint data      yes     no             no              no
Manage users                yes     no             no              no
Manage domain permissions   yes     no             no              no
Reports all domains         yes     no             no              read
Reports own domain          yes     yes            yes             read
```

หมายเหตุ: Viewer เห็นข้อมูลแบบ read-only ได้ แต่ต้องแก้ไขไม่ได้ทั้ง UI และ API

## UI Pages

### Dashboard

Components:

- Status summary cards
- Domain summary
- Recent status changes
- Need Check list
- Fail/Lost list
- Borrow/Using list

### Assets

Components:

- Search by serial no. or model
- Domain filter
- Status filter
- Category filter
- Location filter
- Asset table
- Status badge
- Row action menu based on permission

### Asset Detail

Components:

- Asset information panel
- Current status badge
- Latest note
- Change status action
- Status history timeline
- Migration/source info

### Register Asset

Components:

- Asset model selector
- Create model shortcut if allowed
- Serial no. input
- Asset no. input
- Domain selector
- Location selector
- Initial status selector
- Note input

### Import SharePoint

Components:

- File upload
- Field mapping table
- Preview table
- Validation result
- Import summary
- Failed rows table

### Reports

Components:

- Assets by status
- Assets by domain
- Borrowed report
- Using report
- Sold report
- Problem assets report
- Status history report

### Settings

Components:

- User management
- Role assignment
- Domain permission assignment
- Category management
- Asset model management
- Location management

## Error Codes

```text
VALIDATION_ERROR
UNAUTHORIZED
FORBIDDEN
NOT_FOUND
DUPLICATE_SERIAL_NO
INVALID_ASSET_STATUS
INVALID_STATUS_TRANSITION
STATUS_NOTE_REQUIRED
SOLD_ASSET_LOCKED
DOMAIN_PERMISSION_DENIED
ASSET_MODEL_DOMAIN_MISMATCH
IMPORT_FILE_INVALID
IMPORT_MAPPING_INVALID
IMPORT_ROW_FAILED
INTERNAL_SERVER_ERROR
```

## Testing Strategy

### Unit Tests

ควรทดสอบ:

- permission checker
- status transition validation
- note requirement validation
- serial no. uniqueness logic
- SharePoint field mapper
- import row validator

### Integration Tests

ควรทดสอบ:

- create asset
- reject duplicate serial no.
- P' Arm cannot edit Network asset
- P' Mek cannot edit Server asset
- Admin can edit all assets
- change status creates history
- Sold asset cannot be reused in normal workflow
- SharePoint import creates assets and migration rows
- invalid import rows are marked failed or needs review

### UI Tests

ควรทดสอบ:

- login flow
- asset search by serial no.
- register asset flow
- change status flow
- view asset history
- import preview flow
- domain-specific UI action visibility

## Seed Data

Development seed should include:

- P' Oak admin user
- P' Arm server stock owner
- P' Mek network stock owner
- Viewer user
- Server domain
- Network domain
- Sample categories
- Sample locations
- Sample asset models
- Sample assets with different statuses

Example users:

```text
oak@example.com
arm@example.com
mek@example.com
viewer@example.com
```

## Environment Variables

```text
DATABASE_URL=
APP_URL=
AUTH_SECRET=
NODE_ENV=
MAX_IMPORT_FILE_SIZE=
```

ห้าม commit secret จริงลง repository ให้ใช้ `.env.example` สำหรับบอกชื่อ variables เท่านั้น

## Security Considerations

- hash password ด้วย bcrypt หรือ argon2
- ห้ามส่ง password hash กลับ client
- validate input ทุก endpoint
- ตรวจ role และ domain permission ทุก API ที่แก้ข้อมูล
- การซ่อนปุ่มใน UI ไม่พอ ต้อง block ที่ API ด้วย
- sanitize search params
- limit import file size
- validate file type ก่อน parse import
- log import errors โดยไม่เปิดเผย sensitive data เกินจำเป็น

## Audit Requirements

ทุก status history ต้องเก็บ:

- asset id
- from status
- to status
- action type
- note
- changed by
- changed at

ทุก asset ที่มาจาก migration ควรเก็บ:

- source system
- source record id หากมี
- migration batch id
- raw row ใน migration row

## Performance Considerations

- ใส่ index ที่ serial no., status, domain, model และ location
- ใช้ pagination สำหรับ asset list และ history
- dashboard ควร query เฉพาะ summary ที่จำเป็น
- import file ใหญ่ควร process เป็น batch
- search serial no. ควรเร็วและตรงที่สุด

## Implementation Order

1. Project setup
2. Database setup and migrations
3. Auth and roles
4. Domain permissions
5. Asset domains, categories, models, locations
6. Asset CRUD
7. Status change service and history
8. Asset list/search/filter
9. Asset detail page
10. SharePoint import preview
11. SharePoint import commit
12. Dashboard
13. Reports
14. Tests and polish

## Remaining Open Technical Decisions

- ต้องมี `asset_no` แยกจาก `stock_code` หรือใช้ `stock_code` เป็น asset reference พอ
- จะเก็บ `Image` จาก SharePoint เป็น reference string เท่านั้น หรือ migrate รูปจริงในอนาคต

## Final Decisions for MVP

- ใช้ PostgreSQL
- ใช้ TypeScript
- ใช้ Next.js full-stack monolith เพื่อความเร็ว
- ใช้ `assets.status` เป็น current state
- ใช้ `asset_status_histories` เป็น audit trail
- ใช้ domain permission แยก Server/Network
- ใช้ CSV/Excel import จาก SharePoint แบบ manual upload
- เก็บเอกสารกระดาษเป็น note/reference ก่อน ยังไม่ upload file ใน MVP
- Source data files are `src/data/Network.csv` and `src/data/Server.csv`
- Viewer is read-only
- All MVP assets must have serial no.
- Rent and borrow use the same `BORROW` workflow
