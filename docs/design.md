# Technical Design Document

## Project Name

Stock Management System

## Document Purpose

เอกสารนี้อธิบายว่าเราจะสร้างระบบ Stock Management System อย่างไรในเชิงเทคนิค ครอบคลุม architecture, tech stack, database schema, API design, authentication, authorization, stock transaction rules และแนวทาง implementation สำคัญ

เอกสารนี้ใช้คู่กับ `prd.md` โดย `prd.md` ตอบว่าเราจะสร้างอะไรและทำไม ส่วน `design.md` ตอบว่าเราจะสร้างอย่างไร

## Design Principles

- Stock balance ต้องมาจาก stock movements เป็นหลัก
- ห้ามแก้ยอดคงเหลือโดยตรงโดยไม่มี transaction record
- ทุก stock transaction ต้องทำใน database transaction
- ระบบต้องป้องกัน stock ติดลบ
- ข้อมูลสำคัญควรใช้ soft delete หรือ active status แทนการลบถาวร
- API ต้อง validate input ทั้งฝั่ง client และ server
- Business logic สำคัญต้องอยู่ฝั่ง server
- โครงสร้างโค้ดต้องอ่านง่าย แยก responsibility ชัดเจน และพร้อมต่อยอด

## Recommended Tech Stack

### Frontend

- Framework: React หรือ Next.js
- Language: TypeScript
- Styling: Tailwind CSS
- UI Components: shadcn/ui หรือ component library ที่เข้ากับ Tailwind
- Form Handling: React Hook Form
- Validation: Zod
- Data Fetching: TanStack Query หรือ server actions หากใช้ Next.js

### Backend

- Runtime: Node.js
- Framework: Express, NestJS หรือ Next.js API routes/server actions
- Language: TypeScript
- Validation: Zod
- Authentication: JWT session หรือ cookie-based session
- Password Hashing: bcrypt หรือ argon2

### Database

- Database: PostgreSQL
- ORM: Prisma หรือ Drizzle
- Migration: ORM migration tool

### Development Tools

- Package Manager: npm, pnpm หรือ yarn
- Formatting: Prettier
- Linting: ESLint
- Testing: Vitest หรือ Jest
- API Testing: Bruno, Postman หรือ HTTP files

## Suggested Architecture

ระบบควรเริ่มจาก monolith web application เพื่อให้พัฒนาเร็วและดูแลง่ายใน MVP

```text
Client Browser
  |
  v
Frontend UI
  |
  v
Backend API / Server Actions
  |
  v
Service Layer
  |
  v
Repository / ORM Layer
  |
  v
PostgreSQL Database
```

## Application Layers

### UI Layer

รับผิดชอบ:

- แสดงหน้าจอ
- รับ input จากผู้ใช้
- validate เบื้องต้น
- เรียก API
- แสดง loading, error และ success state

ไม่ควรรับผิดชอบ:

- คำนวณ stock balance ที่เชื่อถือได้
- ตัดสิน permission สำคัญ
- ทำ business rule หลักเพียงฝั่ง client

### API Layer

รับผิดชอบ:

- รับ request
- ตรวจ authentication
- ตรวจ authorization
- validate request body และ query params
- เรียก service layer
- ส่ง response ที่มีรูปแบบสม่ำเสมอ

### Service Layer

รับผิดชอบ:

- business rules
- stock transaction workflow
- database transaction
- ตรวจ stock เพียงพอก่อน stock out หรือ transfer
- สร้าง stock movement records

### Repository / ORM Layer

รับผิดชอบ:

- query database
- create/update records
- map database result ให้ service layer

## Folder Structure

ตัวอย่างโครงสร้างหากใช้ Next.js:

```text
src/
  app/
    dashboard/
    products/
    inventory/
    movements/
    reports/
    settings/
    api/
  components/
    ui/
    layout/
    forms/
    tables/
  lib/
    auth.ts
    db.ts
    permissions.ts
    validators/
  modules/
    products/
      product.repository.ts
      product.service.ts
      product.schema.ts
    inventory/
      inventory.repository.ts
      inventory.service.ts
      inventory.schema.ts
    stock-movements/
      stock-movement.repository.ts
      stock-movement.service.ts
      stock-movement.schema.ts
    users/
  types/
  tests/
prisma/
  schema.prisma
  migrations/
```

ตัวอย่างโครงสร้างหากแยก frontend/backend:

```text
apps/
  web/
  api/
packages/
  shared/
```

สำหรับ MVP แนะนำเริ่มจากโครงสร้างเดียวก่อน เพื่อลด overhead

## Database Design

### Core Tables

```text
users
roles
user_roles
categories
products
locations
stock_movements
stock_transfer_groups
inventory_balances
```

หมายเหตุ: `inventory_balances` เป็น table/cache สำหรับอ่านยอดเร็วได้ แต่ source of truth ยังควรเป็น `stock_movements`

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
name            varchar not null unique
description     text
created_at      timestamp not null
updated_at      timestamp not null
```

Default roles:

- admin
- manager
- staff
- viewer

### user_roles

```text
user_id         uuid not null references users(id)
role_id         uuid not null references roles(id)
created_at      timestamp not null
primary key (user_id, role_id)
```

### categories

```text
id              uuid primary key
name            varchar not null unique
description     text
is_active       boolean not null default true
created_at      timestamp not null
updated_at      timestamp not null
```

### products

```text
id              uuid primary key
sku             varchar not null unique
name            varchar not null
category_id     uuid references categories(id)
unit            varchar not null
description     text
reorder_point   integer not null default 0
is_active       boolean not null default true
created_at      timestamp not null
updated_at      timestamp not null
```

Indexes:

```text
unique index products_sku_unique on products(sku)
index products_name_idx on products(name)
index products_category_id_idx on products(category_id)
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

### stock_transfer_groups

ใช้เชื่อม movement คู่กันในกรณี transfer ระหว่าง location

```text
id              uuid primary key
reference_no    varchar unique
note            text
created_by      uuid not null references users(id)
created_at      timestamp not null
```

### stock_movements

```text
id                  uuid primary key
product_id          uuid not null references products(id)
location_id         uuid not null references locations(id)
type                varchar not null
quantity            integer not null
direction           varchar not null
reference_no        varchar
reason              text
transfer_group_id   uuid references stock_transfer_groups(id)
created_by          uuid not null references users(id)
created_at          timestamp not null
```

Allowed `type` values:

```text
IN
OUT
ADJUSTMENT
TRANSFER_IN
TRANSFER_OUT
```

Allowed `direction` values:

```text
INCREASE
DECREASE
```

Rules:

- quantity ต้องมากกว่า 0
- `IN` และ `TRANSFER_IN` ต้องเป็น `INCREASE`
- `OUT` และ `TRANSFER_OUT` ต้องเป็น `DECREASE`
- `ADJUSTMENT` เป็นได้ทั้ง `INCREASE` หรือ `DECREASE`
- `ADJUSTMENT` ต้องมี reason
- `TRANSFER_IN` และ `TRANSFER_OUT` ควรมี `transfer_group_id`

Indexes:

```text
index stock_movements_product_id_idx on stock_movements(product_id)
index stock_movements_location_id_idx on stock_movements(location_id)
index stock_movements_type_idx on stock_movements(type)
index stock_movements_created_at_idx on stock_movements(created_at)
index stock_movements_transfer_group_id_idx on stock_movements(transfer_group_id)
```

### inventory_balances

ใช้เก็บยอดคงเหลือปัจจุบันเพื่ออ่านข้อมูลเร็วขึ้น

```text
id              uuid primary key
product_id      uuid not null references products(id)
location_id     uuid not null references locations(id)
quantity        integer not null default 0
updated_at      timestamp not null
unique(product_id, location_id)
```

Rules:

- quantity ต้องไม่ติดลบ
- update table นี้ได้เฉพาะผ่าน stock transaction service
- หากข้อมูลไม่ตรงกับ movements ต้องสามารถ rebuild จาก `stock_movements` ได้

## Stock Balance Strategy

มี 2 แนวทางที่ใช้ได้:

### Option A: Calculate from Movements Every Time

ข้อดี:

- source of truth ชัดเจน
- ลดความเสี่ยงจาก balance table ผิด

ข้อเสีย:

- query ช้าลงเมื่อ movement เยอะมาก

เหมาะกับ:

- MVP ขนาดเล็ก
- ระบบที่ movement ยังไม่เยอะ

### Option B: Movement Ledger + Balance Cache

ข้อดี:

- อ่านยอดเร็ว
- รองรับ dashboard และ report ได้ดีขึ้น

ข้อเสีย:

- ต้องคุม transaction ให้ดี
- ต้องมีวิธี rebuild balance

เหมาะกับ:

- ระบบที่ต้องใช้งานจริง
- มี stock transaction หลายรายการ

Recommendation:

ใช้ Option B โดยให้ `stock_movements` เป็น source of truth และ `inventory_balances` เป็น cache ที่ update ภายใน database transaction เดียวกัน

## Stock Transaction Rules

### Stock In

ภายใน transaction:

1. Validate product และ location
2. Create stock movement type `IN`
3. Upsert inventory balance
4. Increase balance quantity
5. Commit transaction

### Stock Out

ภายใน transaction:

1. Validate product และ location
2. Lock inventory balance row
3. Check current quantity
4. Reject หาก quantity ไม่พอ
5. Create stock movement type `OUT`
6. Decrease balance quantity
7. Commit transaction

### Stock Adjustment

ภายใน transaction:

1. Validate product และ location
2. Validate reason
3. Lock inventory balance row
4. หากเป็น decrease ต้องตรวจไม่ให้ติดลบ
5. Create stock movement type `ADJUSTMENT`
6. Update balance quantity
7. Commit transaction

### Stock Transfer

ภายใน transaction:

1. Validate product
2. Validate source location และ destination location
3. Reject หาก source และ destination เหมือนกัน
4. Lock source balance row
5. Check source quantity
6. Create transfer group
7. Create `TRANSFER_OUT` movement ที่ source
8. Create `TRANSFER_IN` movement ที่ destination
9. Decrease source balance
10. Increase destination balance
11. Commit transaction

## Concurrency Control

เพื่อป้องกัน race condition:

- ทุก stock transaction ต้องใช้ database transaction
- ตอนลด stock ต้อง lock row ของ `inventory_balances`
- ใน PostgreSQL ใช้ `SELECT ... FOR UPDATE` หรือ ORM transaction mechanism ที่ equivalent
- ห้ามอ่าน balance แล้ว update แยกกันนอก transaction
- หาก balance row ยังไม่มี ต้องสร้าง row ด้วย quantity 0 ก่อนแล้ว lock ภายใน transaction

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

### Users

```text
GET    /api/users
POST   /api/users
GET    /api/users/:id
PATCH  /api/users/:id
PATCH  /api/users/:id/status
```

### Products

```text
GET    /api/products
POST   /api/products
GET    /api/products/:id
PATCH  /api/products/:id
PATCH  /api/products/:id/status
```

Query params:

```text
search
categoryId
isActive
page
limit
```

### Categories

```text
GET    /api/categories
POST   /api/categories
PATCH  /api/categories/:id
PATCH  /api/categories/:id/status
```

### Locations

```text
GET    /api/locations
POST   /api/locations
PATCH  /api/locations/:id
PATCH  /api/locations/:id/status
```

### Inventory

```text
GET /api/inventory/balances
GET /api/inventory/low-stock
GET /api/inventory/products/:productId/balances
```

Query params:

```text
search
categoryId
locationId
lowStockOnly
page
limit
```

### Stock Movements

```text
GET  /api/stock-movements
POST /api/stock-movements/in
POST /api/stock-movements/out
POST /api/stock-movements/adjustment
POST /api/stock-movements/transfer
GET  /api/stock-movements/:id
```

Query params:

```text
productId
locationId
type
dateFrom
dateTo
createdBy
page
limit
```

### Reports

```text
GET /api/reports/current-inventory
GET /api/reports/low-stock
GET /api/reports/stock-movements
```

## Request Examples

### Create Product

```json
{
  "sku": "SKU-001",
  "name": "Sample Product",
  "categoryId": "uuid",
  "unit": "pcs",
  "description": "Optional description",
  "reorderPoint": 10
}
```

### Stock In

```json
{
  "productId": "uuid",
  "locationId": "uuid",
  "quantity": 50,
  "referenceNo": "PO-0001",
  "note": "Initial stock"
}
```

### Stock Out

```json
{
  "productId": "uuid",
  "locationId": "uuid",
  "quantity": 5,
  "referenceNo": "SO-0001",
  "note": "Customer order"
}
```

### Stock Adjustment

```json
{
  "productId": "uuid",
  "locationId": "uuid",
  "quantity": 3,
  "direction": "DECREASE",
  "reason": "Physical count mismatch"
}
```

### Stock Transfer

```json
{
  "productId": "uuid",
  "sourceLocationId": "uuid",
  "destinationLocationId": "uuid",
  "quantity": 10,
  "referenceNo": "TR-0001",
  "note": "Move to front warehouse"
}
```

## Validation Rules

### Product

- sku required
- sku unique
- name required
- unit required
- reorderPoint must be integer >= 0

### Stock Transaction

- productId required
- locationId required
- quantity must be integer > 0
- stock out cannot exceed current balance
- transfer source and destination must be different
- adjustment reason required

## Authorization Matrix

```text
Feature              Admin   Manager   Staff   Viewer
Dashboard            yes     yes       yes     yes
Products view        yes     yes       yes     yes
Products manage      yes     no        no      no
Categories manage    yes     no        no      no
Locations manage     yes     no        no      no
Stock in             yes     yes       yes     no
Stock out            yes     yes       yes     no
Stock transfer       yes     yes       yes     no
Stock adjustment     yes     yes       optional no
Reports              yes     yes       no      yes
Users manage         yes     no        no      no
Settings             yes     no        no      no
```

หมายเหตุ: สิทธิ์ของ Staff สำหรับ stock adjustment อาจเปิดหรือปิดได้ภายหลังตาม policy ของระบบ

## UI Pages

### Dashboard

Components:

- Total products summary
- Low stock count
- Recent movements table
- Stock in/out summary

### Products

Components:

- Search input
- Category filter
- Product table
- Create/edit product dialog or page
- Active/inactive status control

### Inventory

Components:

- Balance table
- Product search
- Category filter
- Location filter
- Low stock indicator

### Stock In

Components:

- Product selector
- Location selector
- Quantity input
- Reference input
- Note input
- Recent stock in list

### Stock Out

Components:

- Product selector
- Location selector
- Current balance display
- Quantity input
- Reference input
- Note input

### Stock Transfer

Components:

- Product selector
- Source location selector
- Destination location selector
- Source balance display
- Quantity input
- Reference input
- Note input

### Stock Adjustment

Components:

- Product selector
- Location selector
- Current balance display
- Direction selector
- Quantity input
- Reason input

### Movements

Components:

- Movement table
- Product filter
- Location filter
- Type filter
- Date range filter

### Reports

Components:

- Current inventory report
- Low stock report
- Stock movement report
- Date filters where needed

## Error Codes

```text
VALIDATION_ERROR
UNAUTHORIZED
FORBIDDEN
NOT_FOUND
DUPLICATE_SKU
INSUFFICIENT_STOCK
INVALID_TRANSFER_LOCATION
ADJUSTMENT_REASON_REQUIRED
INACTIVE_PRODUCT
INACTIVE_LOCATION
INTERNAL_SERVER_ERROR
```

## Testing Strategy

### Unit Tests

ควรทดสอบ:

- stock in service
- stock out service
- stock adjustment service
- stock transfer service
- permission checker
- validation schemas

### Integration Tests

ควรทดสอบ:

- create product
- duplicate SKU rejection
- stock in increases balance
- stock out decreases balance
- stock out rejects insufficient stock
- transfer updates both locations
- adjustment requires reason
- movement history is created correctly

### UI Tests

ควรทดสอบ:

- login flow
- product creation flow
- stock in flow
- stock out flow
- inventory balance display
- low stock display

## Seed Data

ควรมี seed data สำหรับ development:

- Admin user
- Staff user
- Viewer user
- Default categories
- Default locations
- Sample products
- Sample stock movements

Example users:

```text
admin@example.com
staff@example.com
viewer@example.com
```

## Environment Variables

```text
DATABASE_URL=
APP_URL=
AUTH_SECRET=
JWT_SECRET=
NODE_ENV=
```

ห้าม commit secret จริงลง repository ให้ใช้ `.env.example` สำหรับบอกชื่อ variables เท่านั้น

## Security Considerations

- hash password ด้วย bcrypt หรือ argon2
- ห้ามส่ง password hash กลับไปที่ client
- ตรวจ role ทุก API ที่เกี่ยวข้อง
- validate input ทุก endpoint
- sanitize search params
- ใช้ httpOnly cookie หากใช้ session cookie
- ตั้งค่า CORS ให้เหมาะสมหาก frontend/backend แยกกัน
- log error โดยไม่เปิดเผย secret

## Audit Requirements

ทุก stock movement ต้องเก็บ:

- product
- location
- movement type
- quantity
- direction
- created by
- created at
- reference number หากมี
- reason หากเป็น adjustment
- transfer group หากเป็น transfer

## Performance Considerations

- ใส่ index ที่ product, location, movement type และ created_at
- ใช้ pagination สำหรับ product list, movement history และ report
- dashboard ควร query เฉพาะข้อมูลจำเป็น
- inventory balance ควรอ่านจาก `inventory_balances` เพื่อความเร็ว
- movement history ควร filter ได้และไม่โหลดทั้งหมดในครั้งเดียว

## Implementation Order

1. Project setup
2. Database setup and migrations
3. Auth and roles
4. Product, category, location CRUD
5. Inventory balance model
6. Stock in
7. Stock out
8. Stock adjustment
9. Stock transfer
10. Movement history
11. Dashboard
12. Reports
13. Tests and polish

## Open Technical Decisions

- จะใช้ Next.js full-stack หรือแยก frontend/backend
- จะใช้ Prisma หรือ Drizzle
- จะใช้ JWT หรือ cookie-based session
- จะให้ Staff ปรับยอดได้เองหรือไม่
- จะใช้ `inventory_balances` ตั้งแต่ MVP หรือเริ่มจาก calculate from movements ก่อน
- ต้อง export report เป็น CSV/Excel ตั้งแต่ MVP หรือไม่

## Recommended Decisions for MVP

- ใช้ PostgreSQL
- ใช้ TypeScript ทั้ง frontend และ backend
- ใช้ movement ledger + balance cache
- ใช้ soft delete หรือ active status
- ใช้ database transaction ทุก stock transaction
- เริ่มจาก role ง่าย ๆ ได้แก่ admin, manager, staff, viewer
- ยังไม่ทำ barcode และ purchase order ใน MVP
