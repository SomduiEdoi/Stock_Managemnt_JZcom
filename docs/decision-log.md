# Decision Log

## 2026-06-09: MVP Technical and Product Decisions

Status: Accepted

Decisions:

- Use PostgreSQL as the primary database.
- Use TypeScript for frontend and backend code.
- Use Next.js full-stack monolith for MVP speed and simpler deployment.
- Use `assets.status` as the current state of each asset.
- Use `asset_status_histories` as the audit trail for every asset status change.
- Use domain permission to separate Server and Network responsibilities.
- Use manual CSV/Excel import from SharePoint for MVP migration.
- Treat SharePoint CSV/Excel files as migration input only; PostgreSQL is the runtime source of truth after import.
- Store signed paper document references as note/reference only; do not upload files in MVP.

Rationale:

- The system manages serialized assets, not quantity-based inventory.
- Next.js full-stack keeps the MVP compact and easier to iterate.
- `assets.status` makes asset list/search/report queries simple.
- `asset_status_histories` preserves auditability for asset state changes.
- Domain permission directly matches the real workflow: Server Stock Controller manages Server, Network Stock Controller manages Network, and Admin manages all.
- SharePoint migration is needed, but real-time SharePoint sync is not needed in MVP.
- After import, normal app workflows must not read SharePoint or CSV files again.
- Paper documents remain the legal/operational source for signatures, while the system tracks references and operational status.

## 2026-06-09: Source Data and Policy Decisions

Status: Accepted

Decisions:

- Use `D:\Internship\Stock_Management\src\data\Network.csv` and `D:\Internship\Stock_Management\src\data\Server.csv` as the source data files for migration.
- `src/data/Network.csv` maps to the Network domain.
- `src/data/Server.csv` maps to the Server domain.
- All MVP assets must have serial no.; do not support serial-less assets in MVP.
- Current source files have no blank serial no. and no duplicate serial no.
- Use simple location text/location records in MVP.
- Store SharePoint `QTY` and `FG` as legacy/reference fields only. They must not drive stock balance logic.
- Persist imported source rows and mapped records into PostgreSQL; do not use CSV as runtime mock data after migration.
- Do not export reports to Excel in MVP; keep it in backlog.

Source data profile:

- `src/data/Network.csv`: 594 rows, columns are Image, Category, Types, Brand, Model, Comment, Part No., Serial No., Stock Code, QTY, FG, Status, Location, Remark.
- `src/data/Server.csv`: 551 rows, columns are Image, Category, Types, Brand, Model, Part No., Serial No., Description, Stock Code, QTY, FG, Status, Location, Remark, Comment.
- Both CSV files include a first-line SharePoint `ListSchema=...` record before the actual CSV header.

Rationale:

- The data confirms the product should stay serialized by serial no. rather than quantity-based.
- Legacy `QTY`/`FG` fields are useful for traceability but should not reintroduce quantity stock logic.

## 2026-06-12: Asset Request and Transaction Workflow

Status: Accepted

Decisions:

- Use Microsoft 365 account login.
- Use roles `ADMIN`, `SERVER_OWNER`, `NETWORK_OWNER`, and `STAFF`.
- Replace the previous read-only `VIEWER` concept with `STAFF`, where Staff can view assets and create requests.
- Use asset statuses `READY`, `REQUEST`, `BORROW`, `USING`, `SOLD`, `FAIL`, `LOST`, and `NEED_CHECK`.
- Remove `WAIT` from the latest baseline.
- Use `REQUEST` as a temporary asset lock when a staff user selects an asset before submit.
- Prevent duplicate requests for an asset while `assets.status = REQUEST`.
- Add `transactions` and `transaction_items` for business workflow.
- Use transaction types `BORROW`, `USING`, and `SOLD`.
- Use transaction statuses by type: `BORROW` uses `BORROWED`, `RETURNED`, `OVERDUE`; `USING` uses `ACTIVE`, `RETURNED`; `SOLD` uses `COMPLETED`.
- Treat `OVERDUE` as a transaction status, not an asset status.
- Keep sold, failed, lost, borrowed, and used assets in the database; business workflow changes status rather than deleting records.
- Defer PDF borrow/return document format until the system is closer to completion.

Rationale:

- Staff needs a cart-like request flow before submit, and `REQUEST` prevents two people from taking the same physical asset.
- A transaction can include multiple assets across Server and Network, so the workflow needs transaction header and item records.
- Asset status should describe where the physical item is now; transaction status should describe the state of the business record.
- Sold assets must remain searchable for audit and must not return to normal reuse workflows.

## 2026-06-12: PostgreSQL Source of Truth After Migration

Status: Accepted

Decisions:

- CSV files are temporary mock/bootstrap data and migration inputs.
- Migration must move all valid CSV/SharePoint data into PostgreSQL permanent tables.
- After migration, the new borrow/return system must communicate directly with PostgreSQL only.
- Dashboards, asset tables, request flow, transaction logs, reports, and status updates must not read SharePoint or CSV files at runtime.
- Source CSV metadata may remain in `migration_batches` and `migration_rows` for audit and troubleshooting.

Rationale:

- Runtime behavior must be stable even if SharePoint exports or CSV files are removed, renamed, or stale.
- PostgreSQL needs to be the single source of truth for request locks, asset statuses, transaction logs, and audit history.
- Keeping CSV in the runtime path would risk conflicting data and make borrow/return state unreliable.

## 2026-06-12: Asset Detail and Asset PDF Export

Status: Accepted

Decisions:

- Asset Detail Page must show all available information for the selected asset.
- Asset Detail Page must show status history scoped to that asset.
- Asset Detail Page should show related transaction history for that asset when available.
- Asset Detail Page must support exporting that asset's information as PDF.
- Asset PDF export is part of the asset detail MVP.
- Borrow/return transaction PDF remains a later backlog item until the document format is provided.
- Asset detail and asset PDF export must read from PostgreSQL only.

Rationale:

- Users need a single page to inspect a physical asset by serial no. before changing status or making operational decisions.
- Asset PDF export is a simple asset information report and is separate from formal borrow/return paperwork.
- Keeping the PDF data source in PostgreSQL preserves the source-of-truth rule after migration.
