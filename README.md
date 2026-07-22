# Asset Flow Management System

Internal asset flow system for managing Server, Network, and future warehouse items with request, approval, status history, and PDF export support.

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

## MVP Decisions

- Use PostgreSQL.
- Use TypeScript.
- Use Next.js full-stack monolith.
- Use `assets.status` as the current state.
- Use `asset_status_histories` as the audit trail.
- Use domain permission to separate Server and Network ownership.
- Use manual CSV/Excel import from SharePoint.
- Store signed paper document references as note/reference only in MVP.
- Use `D:\Internship\Stock\data\Network_reclassified.csv` and `D:\Internship\Stock\data\Server_reclassified.csv` as the initial migration source files.
- Require serial no. for every MVP asset.
- Treat rent and borrow as the same `Borrow` workflow.
- Give Viewer users read-only access.

## Source Data

- `D:\Internship\Stock\data\Network_reclassified.csv`: 594 rows, no blank serial no., no duplicate serial no.
- `D:\Internship\Stock\data\Server_reclassified.csv`: 551 rows, no blank serial no., no duplicate serial no.
- CSV files include a first-line SharePoint `ListSchema=...` record before the real header.

## Documents

- `docs/prd.md`: product requirements, use cases, and workflows
- `docs/design.md`: technical design, schema, API, and implementation direction
- `docs/task.md`: project task plan
- `docs/decision-log.md`: accepted decisions
- `docs/rule.md`: coding and behavior rules
