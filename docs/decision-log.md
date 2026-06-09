# Decision Log

## 2026-06-09: MVP Technical and Product Decisions

Status: Accepted

Decisions:

- Use PostgreSQL as the primary database.
- Use TypeScript for frontend and backend code.
- Use Next.js full-stack monolith for MVP speed and simpler deployment.
- Use `assets.status` as the current state of each asset.
- Use `asset_status_histories` as the audit trail for every status change.
- Use domain permission to separate Server and Network responsibilities.
- Use manual CSV/Excel import from SharePoint for MVP migration.
- Store signed paper document references as note/reference only; do not upload files in MVP.

Rationale:

- The system manages serialized assets, not quantity-based inventory.
- Next.js full-stack keeps the MVP compact and easier to vibe-code iteratively.
- `assets.status` makes list/search/report queries simple.
- `asset_status_histories` preserves auditability for Borrow, Return, Using, Sold, Fail, Lost, Need Check, and Wait.
- Domain permission directly matches the real workflow: P' Arm owns Server, P' Mek owns Network, and P' Oak administers all.
- SharePoint migration is needed, but real-time SharePoint sync is not needed in MVP.
- Paper documents remain the legal/operational source for signatures, while the system tracks the reference and operational status.

## 2026-06-09: Source Data and Policy Decisions

Status: Accepted

Decisions:

- Use `D:\Internship\Stock_Management\data\Network.csv` and `D:\Internship\Stock_Management\data\Server.csv` as the source data files for migration.
- `data/Network.csv` maps to the Network domain.
- `data/Server.csv` maps to the Server domain.
- All MVP assets must have serial no.; do not support serial-less assets in MVP.
- Current source files have no blank serial no. and no duplicate serial no.
- Viewer users can view data read-only but cannot create, edit, import, or change status.
- Rent and borrow are the same workflow/status in MVP: `BORROW`.
- Keep `WAIT` as a single temporary status and require note/reference to explain what is waiting.
- Use simple location text/location records in MVP.
- Store borrower/customer/internal user/sale document details in note/reference fields in MVP.
- Do not export reports to Excel in MVP; keep it in backlog.
- Store SharePoint `QTY` and `FG` as legacy/reference fields only. They must not drive stock balance logic.

Source data profile:

- `data/Network.csv`: 594 rows, columns are Image, Category, Types, Brand, Model, Comment, Part No., Serial No., Stock Code, QTY, FG, Status, Location, Remark.
- `data/Server.csv`: 551 rows, columns are Image, Category, Types, Brand, Model, Part No., Serial No., Description, Stock Code, QTY, FG, Status, Location, Remark, Comment.
- Both CSV files include a first-line SharePoint `ListSchema=...` record before the actual CSV header.

Rationale:

- The data confirms the product should stay serialized by serial no. rather than quantity-based.
- Keeping rent inside Borrow avoids an unnecessary status split during MVP.
- Read-only Viewer access matches the current company workflow while protecting status integrity.
- Legacy `QTY`/`FG` fields are useful for traceability but should not reintroduce quantity stock logic.
