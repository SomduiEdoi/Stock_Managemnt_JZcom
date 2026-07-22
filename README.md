# Asset Flow Management System

Internal asset flow system for managing Server, Network, and future asset domains with request, approval, status history, return flow, and PDF export support.

## Stack

- Next.js full-stack monolith
- TypeScript
- PostgreSQL
- Prisma
- Tailwind CSS

## Setup

```bash
npm install
```

Create `.env` from `.env.example`, then set `DATABASE_URL` for your local PostgreSQL database.

## Development

```bash
npm run dev
```

## Database

```bash
npm run prisma:generate
npm run prisma:migrate
npm run db:seed
```

Seed users:

```text
admin@example.com
server@example.com
network@example.com
viewer@example.com
```

Default seed password:

```text
ChangeMe123!
```

## Quality Checks

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

## Current Decisions

- Use PostgreSQL as the runtime source of truth.
- Use CSV/SharePoint data only for bootstrap/migration.
- Use TypeScript and Next.js full-stack monolith.
- Use `domain` as the asset grouping unit.
- Start with Server and Network domains, while keeping room for future domains.
- Use `assets.status` as the current asset state.
- Use `asset_status_histories` as the audit trail.
- Support both `SERIAL` and `QUANTITY` asset tracking.
- Use request cart plus approval workflow before applying final asset status.
- Use requisition no. format `REQ-YYYYMMDD-XX`, with monthly sequence reset.
- Store signed paper document references/signatures for document export support.

## Source Data

- `D:\Internship\Stock\data\Network_reclassified.csv`: initial Network import source
- `D:\Internship\Stock\data\Server_reclassified.csv`: initial Server import source
- CSV files include a first-line SharePoint `ListSchema=...` record before the real header

## Documents

- `docs/prd.md`: product requirements, use cases, and workflows
- `docs/design.md`: technical design, schema, API, and implementation direction
- `docs/task.md`: project task plan
- `docs/decision-log.md`: accepted decisions and open points
- `docs/rule.md`: business and development rules
