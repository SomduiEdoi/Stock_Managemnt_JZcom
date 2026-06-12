# Project Rules

## Core Data Rules

- 1 physical item equals 1 asset record.
- Every MVP asset must have a serial no.
- Serial no. must be unique.
- Do not implement quantity-based stock balance in MVP.
- `QTY` and `FG` from SharePoint are legacy/reference fields only.
- CSV/SharePoint files are migration input only, not runtime data sources.
- `assets.status` is the current asset state.
- `asset_status_histories` is the asset audit trail.
- `transactions` and `transaction_items` are the business workflow records.
- Every asset status change must create one history record.

## Asset Status Rules

- Supported asset statuses are `READY`, `REQUEST`, `BORROW`, `USING`, `SOLD`, `FAIL`, `LOST`, and `NEED_CHECK`.
- `READY` means the asset is available in stock.
- `REQUEST` means a staff user has selected the asset before submit; other users can see it but cannot request it again.
- `BORROW` means temporary borrowing and should return to `READY` when returned.
- `USING` means internal long-term use and should return to `READY` when returned or reassigned.
- `SOLD` is a terminal state in normal workflow.
- `FAIL` may return to `READY` after repair.
- `NEED_CHECK` may become `READY`, `FAIL`, or `LOST` after review.
- `LOST` is used for missing assets.

## Transaction Rules

- Supported transaction types are `BORROW`, `USING`, and `SOLD`.
- `BORROW` transaction statuses are `BORROWED`, `RETURNED`, and `OVERDUE`.
- `USING` transaction statuses are `ACTIVE` and `RETURNED`.
- `SOLD` transaction status is `COMPLETED`.
- `OVERDUE` is a transaction status, not an asset status.
- A transaction can contain multiple asset items.
- A transaction can contain assets from both Server and Network domains.
- `BORROW` requires a `due_date`.
- Staff must provide a purpose/note when submitting a transaction.

## Permission Rules

- Admin can manage all domains and users.
- Server Owner can manage Server assets and view Network assets read-only.
- Network Owner can manage Network assets and view Server assets read-only.
- Staff can view assets and create/submit requests, but cannot manage master data or manually override asset status.
- UI permission checks are not enough; every mutating API must enforce role and domain permission.

## Request Lock Rules

- Staff can request only assets currently in `READY`.
- Requesting an asset changes `assets.status` to `REQUEST`.
- Assets in `REQUEST` must be visible in Server/Network tables.
- Assets in `REQUEST` cannot be requested again by another user.
- Submitting a transaction changes assets from `REQUEST` to `BORROW`, `USING`, or `SOLD` based on transaction type.

## Asset Detail Rules

- Asset Detail Page must show all available information for the selected asset.
- Asset Detail Page must show status history for that asset only.
- Asset Detail Page should show related transaction history for that asset when available.
- Asset Detail Page must support exporting the asset information as PDF.
- Asset detail and asset PDF export must read from PostgreSQL only.
- Asset PDF export is different from borrow/return transaction PDF; transaction PDF remains backlog until the document format is provided.

## Import Rules

- Source files are `src/data/Network.csv` and `src/data/Server.csv`.
- `src/data/Network.csv` maps to the Network domain.
- `src/data/Server.csv` maps to the Server domain.
- CSV importer must skip the first SharePoint schema line beginning with `ListSchema=`.
- Import must reject blank serial no. and duplicate serial no.
- Import must preserve raw source rows in `migration_rows`.
- Imported assets must create initial status history.
- Imported data must be persisted into PostgreSQL permanent tables.
- After import, all runtime features must read and write PostgreSQL only.
- Dashboard, asset pages, request flow, log page, reports, and status changes must not read CSV/SharePoint files.

## MVP Boundaries

- Do not upload signed paper documents in MVP; store note/reference only.
- Do not build PDF generation until the borrow/return document format is provided.
- Do not build approval workflow until explicitly added.
- Do not build Excel report export in MVP.
- Do not build real-time SharePoint sync in MVP.
- Do not use CSV files as mock runtime data after migration.
