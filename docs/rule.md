# Project Rules

## Core Data Rules

- 1 physical item equals 1 asset record.
- Every MVP asset must have a serial no.
- Serial no. must be unique.
- Do not implement quantity-based stock balance in MVP.
- `QTY` and `FG` from SharePoint are legacy/reference fields only.
- `assets.status` is the current state.
- `asset_status_histories` is the audit trail.
- Every status change must create one history record.

## Status Rules

- Supported statuses are Ready, Borrow, Using, Sold, Fail, Lost, Need Check, and Wait.
- Rent and borrow use the same `Borrow` status/workflow.
- Borrow, Using, Sold, Fail, Lost, Need Check, and Wait require note/reference.
- Returning Borrow to Ready requires note/reference.
- Sold assets must remain in the system and must not be reused in normal workflows.
- Wait is a temporary status and must include a note explaining what is waiting.

## Permission Rules

- P' Oak can manage all domains.
- P' Arm can manage Server assets only.
- P' Mek can manage Network assets only.
- Viewer users are read-only.
- UI permission checks are not enough; every mutating API must enforce role and domain permission.

## Import Rules

- Source files are `data/Network.csv` and `data/Server.csv`.
- `data/Network.csv` maps to the Network domain.
- `data/Server.csv` maps to the Server domain.
- CSV importer must skip the first SharePoint schema line beginning with `ListSchema=`.
- Import must reject blank serial no. and duplicate serial no.
- Import must preserve raw source rows in `migration_rows`.
- Imported assets must create initial status history.

## MVP Boundaries

- Do not upload signed paper documents in MVP; store note/reference only.
- Do not split Rent into a separate workflow in MVP.
- Do not build Excel report export in MVP.
- Do not build real-time SharePoint sync in MVP.
