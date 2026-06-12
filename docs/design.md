# Technical Design Document

## Project Name

Stock Management System

## Document Purpose

เอกสารนี้สรุปแนวทางออกแบบเชิงเทคนิคของระบบตาม requirement ล่าสุด โดยเฉพาะการแยก `asset status` ออกจาก `transaction status`, การรองรับ `REQUEST` ก่อน submit, และ flow ของ `BORROW`, `USING`, `SOLD`

## Technical Direction

หลักการออกแบบของระบบ:

- 1 physical item = 1 asset record
- serial no. เป็นตัวระบุหลักของ asset
- ไม่มี quantity-based stock logic ใน MVP
- `assets.status` คือ current state ของ asset
- `asset_status_histories` คือ audit trail ของ asset status
- `transactions` และ `transaction_items` ใช้แทน workflow ทางธุรกิจ
- `REQUEST` เป็น asset status สำหรับ lock asset ก่อน submit
- `OVERDUE` เป็น transaction status ไม่ใช่ asset status
- permission ต้องตรวจทั้ง role และ domain
- CSV/SharePoint ใช้สำหรับ one-time migration เท่านั้น หลัง import แล้ว PostgreSQL เป็น source of truth เดียวของ runtime

## UI Color Tokens

System palette:

```text
Accent  = #FE7743
Surface = #EFEEEA
Navy    = #273F4F
Ink     = #000000
```

Asset status colors:

```text
READY       = #16A34A
BORROW      = #06B6D4
SOLD        = #7C3AED
LOST        = #4B5563
NEED_CHECK  = #F97316
REQUEST     = #EAB308
FAIL        = #DC2626
USING       = #2563EB
```

Rules:

- All app UI must use the system palette above as the base palette.
- All asset status badges, filters, charts, and legends must use the exact status colors above.
- Do not introduce alternate status colors without updating this section and `src/lib/status-style.ts`.

## Recommended Tech Stack

### Frontend

- Framework: Next.js
- Language: TypeScript
- Styling: Tailwind CSS
- UI Components: shadcn/ui
- Form Handling: React Hook Form
- Validation: Zod

### Backend

- Runtime: Node.js
- Framework: Next.js full-stack with route handlers / server actions
- Language: TypeScript
- Validation: Zod
- Authentication: Microsoft 365 / Azure AD login

### Database

- Database: PostgreSQL
- ORM: Prisma

## Architecture

```text
Browser
  |
  v
Next.js App Router UI
  |
  v
Route Handlers / Server Actions
  |
  v
Service Layer
  |
  v
Prisma Repository Layer
  |
  v
PostgreSQL
```

## Core Domain Model

### Asset Status Enum

```text
READY
REQUEST
BORROW
USING
SOLD
FAIL
LOST
NEED_CHECK
```

Display labels:

```text
READY       = Ready
REQUEST     = Request
BORROW      = Borrow
USING       = Using
SOLD        = Sold
FAIL        = Fail
LOST        = Lost
NEED_CHECK  = Need Check
```

### Transaction Type Enum

```text
BORROW
USING
SOLD
```

### Transaction Status Enum

```text
BORROWED
RETURNED
OVERDUE
ACTIVE
COMPLETED
```

Rule by transaction type:

- `BORROW` uses `BORROWED | RETURNED | OVERDUE`
- `USING` uses `ACTIVE | RETURNED`
- `SOLD` uses `COMPLETED`

### Role Enum

```text
ADMIN
SERVER_OWNER
NETWORK_OWNER
STAFF
```

### Domain Enum

```text
SERVER
NETWORK
```

## SharePoint Source Data

Source files:

```text
src/data/Network.csv
src/data/Server.csv
```

Import rules:

- CSV files are migration/bootstrap input only, not runtime application data.
- บรรทัดแรกของ CSV เป็น `ListSchema=...` ต้อง skip
- domain ถูก infer จากชื่อไฟล์
- `QTY` และ `FG` เป็น legacy/reference fields only
- ต้อง validate serial no., status mapping และ duplicate
- Valid imported records must be persisted to PostgreSQL permanent tables.
- Runtime pages, APIs, dashboards, reports, requests, and transactions must query PostgreSQL only.
- CSV/SharePoint references may be kept for audit through migration metadata, but app workflows must not depend on reading those files again.

## Migration Boundary

The importer is an administrative migration tool. It reads CSV/Excel input, validates rows, writes normalized records into PostgreSQL, and stores source references in migration tables. After the import commit finishes, the system treats PostgreSQL as the only source of truth.

Runtime modules must not read SharePoint exports or CSV files for asset lists, dashboard counts, request locks, transaction logs, status changes, reports, or permission checks.

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
transactions
transaction_items
migration_batches
migration_rows
```

## Database Schema

### users

```text
id                  uuid primary key
name                varchar not null
email               varchar not null unique
azure_ad_object_id  varchar unique
position            varchar
is_active           boolean not null default true
last_login_at       timestamp
created_at          timestamp not null
updated_at          timestamp not null
```

Notes:

- ใช้ `email` และ `azure_ad_object_id` สำหรับ map กับ Microsoft 365 account
- ไม่มี password hash ใน flow ใหม่

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
SERVER_OWNER
NETWORK_OWNER
STAFF
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

### user_domain_permissions

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

Default examples:

```text
P' Oak -> SERVER manage, NETWORK manage
P' Arm -> SERVER manage
P' Mek -> NETWORK manage
Staff  -> SERVER view, NETWORK view
```

### assets

```text
id                    uuid primary key
asset_model_id        uuid not null references asset_models(id)
domain_id             uuid not null references asset_domains(id)
location_id           uuid references locations(id)
serial_no             varchar not null unique
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
request_locked_by     uuid references users(id)
request_locked_at     timestamp
created_by            uuid references users(id)
updated_by            uuid references users(id)
created_at            timestamp not null
updated_at            timestamp not null
```

Notes:

- `status` ใช้ asset status enum
- `request_locked_by` และ `request_locked_at` ช่วย trace ว่าใครเป็นคนทำให้ asset อยู่ใน `REQUEST`
- business workflow ไม่ลบ asset record

### asset_status_histories

```text
id              uuid primary key
asset_id        uuid not null references assets(id)
from_status     varchar
to_status       varchar not null
action_type     varchar not null
note            text
changed_by      uuid not null references users(id)
changed_at      timestamp not null
transaction_id  uuid references transactions(id)
```

Suggested action types:

```text
CREATE
REQUEST_HOLD
REQUEST_SUBMIT
STATUS_CHANGE
RETURN
MARK_FAIL
MARK_LOST
MARK_NEED_CHECK
IMPORT
```

### transactions

```text
id                  uuid primary key
transaction_no      varchar not null unique
type                varchar not null
status              varchar not null
requester_id        uuid not null references users(id)
submitted_by_id     uuid references users(id)
purpose             text not null
borrow_date         date
due_date            date
returned_at         timestamp
completed_at        timestamp
created_at          timestamp not null
updated_at          timestamp not null
```

Rules:

- `type` ใช้ `BORROW | USING | SOLD`
- `status` ต้องสอดคล้องกับ `type`
- `due_date` จำเป็นเมื่อ `type = BORROW`

### transaction_items

```text
id                  uuid primary key
transaction_id      uuid not null references transactions(id)
asset_id            uuid not null references assets(id)
asset_status_after  varchar not null
note                text
created_at          timestamp not null
unique(transaction_id, asset_id)
```

Notes:

- transaction 1 รายการมีหลาย items ได้
- asset หนึ่งชิ้นอยู่ใน active request/open transaction ซ้อนกันไม่ได้

## Status Transition Rules

### Asset Status

Normal transitions:

```text
READY       -> REQUEST, BORROW, USING, SOLD, FAIL, LOST, NEED_CHECK
REQUEST     -> READY, BORROW, USING, SOLD
BORROW      -> READY, FAIL, LOST, NEED_CHECK
USING       -> READY, FAIL, LOST, NEED_CHECK
FAIL        -> READY, NEED_CHECK
NEED_CHECK  -> READY, FAIL, LOST
LOST        -> NEED_CHECK, READY
SOLD        -> no normal transition
```

Notes:

- `REQUEST` ใช้ช่วง pre-submit lock
- submit transaction จะเปลี่ยน `REQUEST` ไปสู่สถานะปลายทาง
- `SOLD` เป็น terminal state

### Transaction Status

```text
BORROW: BORROWED -> RETURNED | OVERDUE
USING:  ACTIVE   -> RETURNED
SOLD:   COMPLETED
```

Overdue rule:

- cron/job หรือ scheduled process ตรวจ transaction type `BORROW`
- ถ้า `due_date < today` และสถานะยังไม่ `RETURNED` ให้เปลี่ยนเป็น `OVERDUE`

## Service Design

### holdAssetsForRequest

Responsibilities:

1. Validate user is `STAFF` or allowed requester
2. Load selected assets
3. Reject assets that are not `READY`
4. Change asset status to `REQUEST`
5. Set request lock metadata
6. Create asset status history

Transaction:

- ทุก asset update และ history insert ต้องอยู่ใน DB transaction

### submitTransaction

Responsibilities:

1. Validate requester owns the current request lock
2. Validate type `BORROW | USING | SOLD`
3. Validate purpose
4. Validate `due_date` when type is `BORROW`
5. Create `transactions`
6. Create `transaction_items`
7. Change asset statuses from `REQUEST` to target status
8. Create asset status histories linked to `transaction_id`

Target asset status by type:

```text
BORROW -> BORROW
USING  -> USING
SOLD   -> SOLD
```

### returnTransactionItem / returnTransaction

Responsibilities:

1. Load transaction and items
2. Validate type supports return
3. Update transaction status to `RETURNED`
4. Update asset statuses from `BORROW` or `USING` to `READY`
5. Create asset status histories

### markBorrowOverdue

Responsibilities:

1. Find borrow transactions past `due_date`
2. Exclude returned transactions
3. Update transaction status to `OVERDUE`

Note:

- asset status อาจยังคงเป็น `BORROW` เพื่อสะท้อนว่าของยังไม่กลับคลัง

### changeAssetStatus

Responsibilities:

1. Owner/Admin override เฉพาะกรณีที่ต้องแก้ด้วยมือ
2. Validate user can manage domain
3. Validate transition
4. Lock asset row
5. Update asset
6. Insert history

## API Design

Base path:

```text
/api
```

### Auth

```text
GET /api/auth/login/microsoft
POST /api/auth/logout
GET /api/auth/me
```

### Assets

```text
GET    /api/assets
GET    /api/assets/:id
PATCH  /api/assets/:id
PATCH  /api/assets/:id/status
GET    /api/assets/:id/history
GET    /api/assets/:id/transactions
GET    /api/assets/:id/export.pdf
```

### Requests / Transactions

```text
POST   /api/requests/hold
POST   /api/transactions
GET    /api/transactions
GET    /api/transactions/:id
POST   /api/transactions/:id/return
POST   /api/transactions/:id/items/:itemId/return
```

### Users

```text
GET    /api/users
POST   /api/users
PATCH  /api/users/:id
PATCH  /api/users/:id/status
PATCH  /api/users/:id/domain-permissions
```

### Imports

```text
POST /api/imports/sharepoint/preview
POST /api/imports/sharepoint/commit
GET  /api/imports
GET  /api/imports/:id
```

Import endpoints are for controlled migration/admin operations only. Normal application pages must not call CSV parsing logic after data has been committed to PostgreSQL.

## UI Pages

### Dashboard

- status KPI cards
- problem items
- recent activity feed
- recently table by workflow group
- server vs network comparison

### Server / Network Pages

- dashboard of server/network equipment
- scoped asset table
- search + filter
- status badge including `REQUEST`
- action buttons ตามสิทธิ์
- staff ใช้ add-to-request flow ได้เมื่อ asset เป็น `READY`

### Asset Detail Page

- complete asset information view
- model, brand, category, type, serial no., stock code, location, status, note, source/migration reference, image/reference, and legacy fields
- status history timeline scoped to the current asset
- related transaction history scoped to the current asset
- PDF export action for the current asset
- PDF export must render data from PostgreSQL, not CSV/SharePoint

### Log Page

- transaction table
- filters by type/status/date/requester
- badge ของ transaction status
- รองรับ `BORROWED`, `RETURNED`, `OVERDUE`, `ACTIVE`, `COMPLETED`

### Request Page

- current request cart
- request list/history ของผู้ใช้
- submit form พร้อม purpose/type/due date

## Authorization Matrix

```text
Feature                         Admin   Server Owner   Network Owner   Staff
View dashboard all              yes     no             no              no
View own-scoped dashboard       yes     yes            yes             yes
View Server assets              yes     yes            read            read
View Network assets             yes     read           yes             read
Manage Server assets            yes     yes            no              no
Manage Network assets           yes     no             yes             no
Hold request on READY asset     no      no             no              yes
Submit transaction              no      no             no              yes
Override asset status           yes     yes            yes             no
View transactions/log           yes     yes            yes             yes
Manage users                    yes     no             no              no
Import SharePoint               yes     no             no              no
```

## Validation Rules

### Asset

- serialNo required
- serialNo unique
- asset must belong to one domain
- `REQUEST` assets cannot be requested by another user
- `SOLD` assets cannot re-enter normal workflow

### Request Hold

- selected asset must be `READY`
- selected asset must be visible to requester
- same asset cannot be held twice

### Transaction Submit

- type required
- purpose required
- at least one item required
- requester must own the current request lock
- `due_date` required when type is `BORROW`

### Return

- only `BORROW` and `USING` transactions can return
- `SOLD` cannot return

## Testing Strategy

### Unit Tests

- asset transition validation
- transaction status validation by type
- request lock rules
- overdue calculation
- permission checker

### Integration Tests

- hold asset changes status to `REQUEST`
- request cannot duplicate same asset
- submit borrow creates transaction and updates assets
- borrow return changes asset back to `READY`
- overdue job updates borrow transaction status
- asset detail returns complete asset data from PostgreSQL
- asset PDF export uses PostgreSQL data and includes status history
- staff cannot override asset status directly
- owner can manage only allowed domain
- runtime asset APIs return data from PostgreSQL after import, not from CSV fixtures

### UI Tests

- login with Microsoft 365 flow
- add asset to request cart
- submit transaction
- log page filtering
- request lock visibility in asset table

## Final MVP Decisions

- use PostgreSQL
- use TypeScript
- use Next.js full-stack monolith
- use Microsoft 365 login
- use `assets.status` as current asset state
- use `asset_status_histories` as asset audit trail
- use `transactions` and `transaction_items` for business workflow
- use `REQUEST` as temporary asset lock status
- use manual CSV/Excel import from SharePoint only as a migration path
- use PostgreSQL as the only runtime source of truth after migration
