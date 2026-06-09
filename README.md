# Stock Management System

Serialized asset stock management system for tracking Server and Network items by serial no., status, domain permission, and status history.

## MVP Decisions

- Use PostgreSQL.
- Use TypeScript.
- Use Next.js full-stack monolith.
- Use `assets.status` as the current state.
- Use `asset_status_histories` as the audit trail.
- Use domain permission to separate Server and Network ownership.
- Use manual CSV/Excel import from SharePoint.
- Store signed paper document references as note/reference only in MVP.
- Use `src/data/Network.csv` and `src/data/Server.csv` as the initial migration source files.
- Require serial no. for every MVP asset.
- Treat rent and borrow as the same `Borrow` workflow.
- Give Viewer users read-only access.

## Source Data

- `src/data/Network.csv`: 594 rows, no blank serial no., no duplicate serial no.
- `src/data/Server.csv`: 551 rows, no blank serial no., no duplicate serial no.
- CSV files include a first-line SharePoint `ListSchema=...` record before the real header.

## Documents

- `docs/prd.md`: product requirements, use cases, and workflows
- `docs/design.md`: technical design, schema, API, and implementation direction
- `docs/task.md`: project task plan
- `docs/decision-log.md`: accepted decisions
- `docs/rule.md`: coding and behavior rules
