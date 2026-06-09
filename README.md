# Stock Management System

Serialized asset stock management system for tracking Server and Network items by serial no., status, domain permission, and status history.

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
oak@example.com
arm@example.com
mek@example.com
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
- Use `data/Network.csv` and `data/Server.csv` as the initial migration source files.
- Require serial no. for every MVP asset.
- Treat rent and borrow as the same `Borrow` workflow.
- Give Viewer users read-only access.

## Source Data

- `data/Network.csv`: 594 rows, no blank serial no., no duplicate serial no.
- `data/Server.csv`: 551 rows, no blank serial no., no duplicate serial no.
- CSV files include a first-line SharePoint `ListSchema=...` record before the real header.

## Documents

- `docs/prd.md`: product requirements, use cases, and workflows
- `docs/design.md`: technical design, schema, API, and implementation direction
- `docs/task.md`: project task plan
- `docs/decision-log.md`: accepted decisions
- `docs/rule.md`: coding and behavior rules
