# Workflow Implementation Verification

> Historical evidence, not a live status page. Each section applies only to its stated test date, environment and fixtures. Older pending steps and defects are not automatically current. Documentation reviewed 2026-10-16; current rules are in [Rules](rule.md), remaining work in [Tasks](task.md). Original fixture IDs and results below are intentionally preserved.

## Verification Summary: 2026-10-15

### Subsequent Security Verification: 2026-10-16

- Categories PUT validates every submitted category, type, custom-field ID and custom-field type reference against its warehouse and parent category before any writes, including deletion entries. Validation and mutations share a Serializable Prisma transaction.
- Asset edit/create/delete/status/recommendation use the actual asset or target warehouse scope within their mutation transaction. Asset PATCH now refuses warehouse changes even for ADMIN; the edit UI no longer offers a warehouse change.
- Added `src/lib/warehouse-scope.integration.test.ts`: 17 passing PostgreSQL API integration cases with authentication replaced by an explicit test actor, real Prisma queries, isolated fixtures and mandatory rollback. Cases cover cross-warehouse update/delete, wrong-category children, foreign type references, forbidden asset operations, admin warehouse reassignment and a valid scoped edit. These are route-handler integration tests, not live HTTP/session tests.
- Full suite with WORKFLOW, CONCURRENCY, AUTH and SCOPE PostgreSQL flags: 389 passed, 1 PDF sample skipped. Typecheck and focused ESLint passed. No schema migration or production data cleanup was performed.

### Earlier Summary (2026-10-15)

- Full suite with PostgreSQL workflow/concurrency/auth integration flags: 372 passed, 1 skipped. Separate PDF sample run: 19 passed including the skipped sample case; 373 unique passing cases across the two runs, not 391 independent cases.
- Production build passed with three existing unused-variable warnings in workflow code; this is not a warning-free build claim.
- Local Admin login succeeded after the owner set the password. AD and Local modes remain separate; an actual AD outage was not simulated.
- QA fixtures were cleaned after testing. The read-only stock snapshot covered 1,561 active assets and found no negative quantity, serialized quantity violation or over-return in the checks performed; this is not full historical stock reconciliation.
- Local production smoke checks and focused browser flows do not certify Cloud deployment, backup restore, load testing or all-role browser UAT.
- This summary records prior verification only. The 2026-10-16 documentation update did not rerun tests or mutate database contents.

Date: 2026-10-05

## Live Browser Return Lead Rejection: 2026-10-06

- Tested as Tanawat W. through the normal authenticated browser against QA source REQ-20261006-10, return REQ-20261006-12 (batch 2967892d-c7ee-4835-838f-82d55266779d).
- Lead rejected the two submitted RETURN allocations (Installation 1 and Sale Stock 1) with an explicit QA correction reason.
- Read-only database verification: return batch is REJECTED; source remains IN_PROGRESS / BORROWED with completedAt null. Both outcomes remain unposted (approvedAt null). Physical stock remains Installation NEW 11 and Sale Stock NEW 16.
- Browser verification: batch review shows REJECTED and Tanawat no longer has Approve/Reject controls. Original borrowing is not closed.
- Presentation defect observed: Request Items still shows Awaiting approval and Outcome Summary still shows Pending approval for the rejected allocations. This must be reconciled with the batch state; it is not evidence of an active approval.
- Requester correction and same-number resubmission have NOT yet been browser-tested for this round; next step requires Suebskul P. login.
- Screenshot: C:/Users/ASUS/Documents/Codex/qa-return-20261006-12-lead-rejected.jpg.

## Live Browser Return Same-Number Correction: 2026-10-06

- Suebskul P. selected the rejected REQ-20261006-12 round in the Return round selector, which restored its editable allocations.
- Changed Installation RETURN quantity from 1 to 2 and revised both notes; Sale Stock RETURN stayed at 1, leaving 1 Sale Stock unit in use.
- Submitted via Resubmit Outcomes and Confirm in the normal UI.
- Database confirms the same batch ID and requestNo REQ-20261006-12, now revision 2 / SUBMITTED. No new return batch was allocated; cancelled round 11 remains unchanged.
- Prior Lead rejection and other superseded approval rows remain with isCurrent false. A fresh requester approval at 2026-10-06T08:37:42.239Z and fresh pending Lead/warehouse approvals replace the current cycle, with no carried-over approval.
- Current unposted quantities are Installation 2 and Sale Stock 1; approvedAt remains null. Source remains IN_PROGRESS / BORROWED with completedAt null. Physical stock is still Installation 11 and Sale Stock 16.
- Browser redirected successfully to Transaction Log, where source return date is Continues. Next role is Tanawat W. to approve the fresh Lead step before testing warehouse rejection.
- This test does not yet prove the full post-rejection warehouse completion path.

## Live Browser Return Revision 2 Lead Approval: 2026-10-06

- Tanawat W. approved the fresh Lead step of REQ-20261006-12 revision 2 through Approve / Confirm in the authenticated UI.
- Current C1_SUPERVISOR approval is APPROVED at 2026-10-06T08:42:21.142Z. Both warehouse RETURN_CHECK and final STOREMAN approvals remain PENDING with actedAt null.
- Browser no longer exposes Lead Approve/Reject. Current Step correctly routes Installation to Suriya K. and Sale Stock to bsd.
- Both outcomes remain unposted (quantities 2 and 1, approvedAt null). Physical quantities remain Installation 11 / Sale Stock 16. Source is IN_PROGRESS / BORROWED with completedAt null; cancelled round 11 is unchanged.
- Additional presentation defect: the Sale Stock row has 1 quantity still open and displays bsd in the Outcome column instead of a status. Current Step routing is correct, but open-quantity and pending-outcome presentation needs separation.
- Screenshot: C:/Users/ASUS/Documents/Codex/qa-return-20261006-12-revision2-lead-approved.jpg.
- Next browser step: Suriya K. warehouse check, then Sale Stock rejection test. Warehouse rejection and its recovery have not yet been executed for this return round.

## Direct Warehouse Sale Live QA (2026-10-07)

- QA request `REQ-20261007-13` (`f375c856-08b1-4059-848e-abb865e6fe52`): Suebskul submitted two units of `SS-QA-20261005-NEW` as SOLD / Service.
- Tanawat approved Lead at `2026-10-07T02:22:55.282Z`; bsd approved `STOREMAN:SALE_STOCK` at `2026-10-07T02:24:34.609Z`.
- After Storeman approval the physical quantity remained 17, dispatch was null, and BSD_STAFF was pending. No early stock posting occurred.
- Live QA found pricing UI restricted to derived sales by `sourceTransactionId`. Removed that restriction: all SOLD approvals at BSD_STAFF require pricing. Added two focused regression tests; page tests passed (17 tests).
- Surarux entered 250.75 per unit. Row total and Grand Total both displayed 501.50.
- BSD confirmation at `2026-10-07T02:28:45.293Z` completed the request and dispatched both units atomically. Physical pool decreased from 17 to 15; stored unit price is 250.75. Pool status remains READY for remaining stock.
- Outstanding display issue: completed direct sale still shows `1 open / 1 total (2 qty remaining)` despite the Completed row and disabled return actions. This counter is not proof of outstanding stock.
- Screenshot: `C:/Users/ASUS/Documents/Codex/qa-direct-sale-20261007-13-completed.jpg`.

## Completed Transaction Counter Fix (2026-10-07)

- Completed and cancelled transactions no longer contribute open items or available return quantity to the Request Items counter. This covers direct and derived sales even when no return outcome records exist.
- Active partial-return quantities remain actionable; pending approvals are not treated as completed.
- Focused client/page/quantity regression suite: 32 tests passed. TypeScript check passed.
- Browser verification and the next multi-warehouse sale scenario could not proceed because the existing IAB tab timed out during connection. No new request or stock mutation was made during this counter-fix turn.

## Implemented Controls

### Remaining Return Controls After Partial Posting (2026-10-06)

- Verified as original requester Suebskul P. on source REQ-20261006-10 after return round 12 revision 3 completed.
- Both source rows remain actionable with unchecked return selectors, RETURN outcome controls, and quantity 1. Browser quantity inputs each have min=1 and max=1, matching outstanding in-use quantity.
- Selecting both rows enables Save Outcomes. Completed outcome rows have dated approvals and no Remove pending outcome buttons (count 0). No completed batch is offered for revision.
- This was a form/actionability check only: no new round was submitted and no stock was changed. The inputs were deselected after the check.
- Screenshot: C:/Users/ASUS/Documents/Codex/qa-req-20261006-10-remaining-return-actionable.jpg.
- This closes the browser check for remaining-item actionability after rejection recovery and partial posting. Direct sale, concurrency, and the outstanding presentation defects remain separate follow-ups.

### Revision 3 Return Posted After Rejection Recovery (2026-10-06)

- Suriya K. completed the final Installation approval through browser Approve / Confirm at 2026-10-06T10:38:27.449Z, after bsd's final approval.
- Both RETURN outcomes (1 per warehouse) received the identical approvedAt timestamp. Physical stock increased together: Installation 11 -> 12, Sale Stock 16 -> 17. Batch REQ-20261006-12 is COMPLETED revision 3; cancelled round 11 stays unchanged.
- Source REQ-20261006-10 remains IN_PROGRESS / BORROWED with completedAt null. Each original item requested 2 and has only 1 approved return, leaving 1 in use per item. Item returnedAt remains null.
- Browser shows 2 open / 2 total (2 qty remaining), both rows Approved / Ready for return, and dated completed outcomes with no Remove action. Suriya has no further return approval action; acknowledgement is separate.
- The source detail Return Date is blank rather than Continues, a presentation gap to address separately. Source completion semantics in the database are correct.
- Screenshot: C:/Users/ASUS/Documents/Codex/qa-return-20261006-12-revision3-posted.jpg.
- End-to-end rejection -> correction with same number -> fresh Lead/checks -> all-warehouse final posting is now verified for this QA return. Original requester controls for the remaining quantities should be checked next as Suebskul P. Concurrent submissions/duplicate requests were not exercised by these sequential browser actions.

- Revision 3 Sale Stock check/final approval (2026-10-06): bsd checked Sale Stock RETURN 1 at 2026-10-06T09:30:55.104Z; Installation was disabled for this account. Once both checks were approved, final Approve became available without generating/uploading a damage PDF (RETURN-only batch). bsd confirmed final STOREMAN:SALE_STOCK approval at 2026-10-06T09:31:19.332Z. Installation final approval remains PENDING. Both outcomes still have approvedAt null, batch stays SUBMITTED revision 3, source stays IN_PROGRESS / BORROWED with completedAt null, and stock remains 11 / 16. Sale Stock Current Step shows Awaiting approval while Installation names Suriya K. Screenshot: C:/Users/ASUS/Documents/Codex/qa-return-20261006-12-revision3-sale-stock-final-approved.jpg. Next: Suriya final approval should post +1 per warehouse together; 1 unit per source item remains in use.

- Revision 3 Installation check (2026-10-06): Suriya K. selected and checked only Installation RETURN quantity 1. Current RETURN_CHECK:INSTALLATION was newly APPROVED at 2026-10-06T09:29:20.568Z; Sale Stock check and both final approvals remain PENDING. Sale Stock checkbox was disabled for this account. No final Approve was available while another warehouse check remained outstanding. Stock remains Installation 11 / Sale Stock 16. Browser Installation Current Step shows Awaiting approval. Screenshot: C:/Users/ASUS/Documents/Codex/qa-return-20261006-12-revision3-installation-checked.jpg. Next role is bsd to check Sale Stock and proceed toward final approvals.

- Revision 3 Lead follow-up (2026-10-06): Tanawat W. approved REQ-20261006-12 at 2026-10-06T09:08:57.927Z through browser Approve / Confirm. Both fresh RETURN_CHECK rows and both final STOREMAN rows remain PENDING with actedAt null, proving prior Installation check did not carry forward. Browser Current Step routes Installation to Suriya K. and Sale Stock to bsd; the previously recorded Outcome-label defect remains. Stock is unchanged at 11 / 16. Screenshot: C:/Users/ASUS/Documents/Codex/qa-return-20261006-12-revision3-lead-approved.jpg. Next role: Suriya K. for a fresh warehouse check.

### Live Browser Recovery After Warehouse Return Rejection (2026-10-06)

- Suebskul P. selected rejected round REQ-20261006-12, reduced Installation RETURN from 2 to 1, retained Sale Stock RETURN 1, revised both notes, and used Resubmit Outcomes / Confirm.
- Same batch 2967892d-c7ee-4835-838f-82d55266779d and same requestNo now have revision 3 / SUBMITTED. No new running number or batch was allocated.
- Previous APPROVED Lead and Installation manual-check rows remain as history with isCurrent false, alongside the prior Sale Stock rejection. The current cycle has a new requester approval at 2026-10-06T09:06:52.286Z and PENDING Lead, both RETURN_CHECK, and both final STOREMAN rows with actedAt null. No approval/check carries forward.
- Current outcomes are quantity 1 per warehouse, both approvedAt null. Source remains IN_PROGRESS / BORROWED, completedAt null; physical stock is unchanged at Installation 11 and Sale Stock 16. Cancelled round 11 remains unchanged.
- Browser shows Tanawat W. as Current Step for both items, 2 open / 2 total (2 qty remaining), and both warehouse review checkboxes disabled before Lead approval.
- Screenshot: C:/Users/ASUS/Documents/Codex/qa-return-20261006-12-revision3-resubmitted.jpg.
- This verifies same-number correction and approval reset after warehouse rejection. Final posting of revision 3 remains untested; next role is Tanawat W.

### Live Browser Warehouse Return Rejection (2026-10-06)

- Found and fixed missing Reject action during RETURN_CHECK: both server serialization and client action guards excluded manual-check approvals. Current eligible warehouse check now permits Reject, while final Approve remains hidden and blocked in this phase. Existing API authorization, batch ordering, and stock-posting gates remain in force.
- Regression checks: transaction-return-client.test.ts and transaction-return-page.test.ts passed 23 tests; TypeScript check passed.
- bsd rejected REQ-20261006-12 revision 2 at 2026-10-06T08:55:49.243Z after Installation's check had already been approved.
- The complete unposted return batch is REJECTED. Lead and Installation check history remain APPROVED; Sale Stock check and outstanding final approvals are REJECTED. Source borrowing stays IN_PROGRESS / BORROWED, completedAt null.
- Both allocations remain unposted, approvedAt null (Installation 2 / Sale Stock 1). Physical stock stays Installation 11 / Sale Stock 16. Cancelled round 11 is unchanged.
- Screenshot: C:/Users/ASUS/Documents/Codex/qa-return-20261006-12-storeman-rejected.jpg.
- Next: original requester correction and same-number resubmission must prove that previously approved Lead and Installation checks are not carried forward. This recovery after warehouse rejection is not yet browser-tested.

- Live browser follow-up (2026-10-06): Suriya K. checked Installation RETURN quantity 2 in REQ-20261006-12 revision 2 at 2026-10-06T08:44:48.801Z. Sale Stock checkbox was disabled for this account and its RETURN_CHECK remains PENDING. Both final STOREMAN approvals remain PENDING; stock remains Installation 11 / Sale Stock 16. Browser shows Installation Current Step Awaiting approval while waiting for bsd, with no final Approve yet. Screenshot: C:/Users/ASUS/Documents/Codex/qa-return-20261006-12-installation-checked.jpg. Next step is bsd to test warehouse rejection; that rejection has not yet been executed.

- Model `isSerialized` determines tracking; legacy track-method fields are not the runtime source of truth.
- Only the original requester may submit, revise, remove, or cancel return outcomes under the workflow editing rules.
- Return approval is scoped to a return batch, then Lead/Supervisor, warehouse-specific manual checks, and warehouse-specific final approvals.
- FAIL, LOST, and USED require a damage PDF after all manual checks, followed by uploaded wet-signed evidence before final approval.
- RETURN/SOLD-only batches do not require the damage document.
- Non-sale outcomes post only after every participating warehouse's final approval. SOLD waits separately for BSD pricing and approval.
- Quantity returns use existing Stock Codes in the same warehouse and canonical model. No automatic legacy `(Used)` model merge is performed.
- Approval revisions and signed return document revisions are preserved rather than overwritten.
- Removing the last pending outcome of a warehouse supersedes only that batch's now-unused warehouse approval rows. Remaining warehouses and approval history are preserved.
- Removing one SOLD allocation recalculates its derived sale item quantity without deleting other allocations for the same item.
- PDF exports use scoped signature snapshots and append derived sale pages to the original document set.

## Authorized Legacy Migration

Only the following pending return was migrated:

| Field | Value |
| --- | --- |
| Source request | REQ-20261001-03 |
| Return batch | 6ac12284-81ca-4e51-a08d-04509090cef1 |
| New return request number | REQ-20261005-06 |
| Quantity | 3 |
| Classification | RETURN / NEW |
| Original Stock Code | IN-LA-PCL0019 |
| On-hand before and after migration | 17 |
| Stock posted during migration | 0 |

The migration created a pending approval cycle, preserved legacy approval records, and did not receive stock. On-hand becomes 20 only after this return completes its required approvals.

Post-migration verification confirmed that asset quantities, item records, model records, stock histories, the five posted outcomes, and the excluded old SOLD batch remained unchanged.

## Deferred By User

- The old pending SOLD batch from REQ-20260930-01 was not migrated.
- Legacy `(Used)` master models were not merged. Review `generated-used-model-mapping.md` before authorizing any live normalization.

## Verification

- Full TypeScript check: passed.
- Combined unit, PostgreSQL integration, and real PDF rendering run: 226 passed across 23 files, no skipped tests.
- ESLint: no errors; four warnings, including unused legacy workflow helpers.
- Local development server responds at http://127.0.0.1:3000 and redirects unauthenticated access to login.
- Authenticated end-to-end approval and live stock posting were not executed as tests. No real request was approved merely to verify the implementation.

The optional browser-backed PDF test was enabled in the final run. Its bilingual two-page sample was rendered to PNGs and both pages were visually inspected.

## PostgreSQL Integration Follow-Up

A real PostgreSQL rollback-only fixture now exercises the production workflow and return-check services. It creates isolated QA users, warehouses, models, assets, and requests inside one serializable transaction and always rolls the transaction back. The test verifies that no fixture users, warehouses, models, or requests remain afterward.

Covered scenarios:

- Lead approval must precede warehouse checks.
- Warehouse A cannot verify Warehouse B's outcome.
- A two-warehouse partial return does not post until both final approvals finish.
- Partial return preserves the outstanding in-use quantity and source workflow.
- Repeat approval cannot post the same return twice.
- USED reuses an existing zero-quantity bucket instead of creating another asset.
- USED/FAIL final approval requires generated and uploaded signed-document evidence.
- FAIL does not add stock and records the source-stock remark.
- Direct sale waits for BSD prices before decrementing stock.
- Derived sale keeps `transactionNo = null` and does not decrement already-issued stock again.
- Rejected return can be revised and resubmitted with the same request number; prior rejection remains historical.
- Multi-warehouse issue posts full quantities together, while a rejection in one warehouse rejects the whole unissued request.
- Serialized return preserves the serial number and changes status back to READY.

The integration test found and fixed a real Prisma/PostgreSQL incompatibility: `pg_advisory_xact_lock` returns `void`, so stock-key locking must use `$executeRaw`, not `$queryRaw`.

The signed-document gate uses fixture PDF-header bytes in this test. This does not validate a human wet signature, PDF visual layout, authenticated browser clicks, or simultaneous competing transactions.

Run explicitly in PowerShell:

```powershell
$env:RUN_POSTGRES_WORKFLOW_TESTS = '1'
$env:DAMAGE_PDF_LAYOUT_SAMPLE = 'C:\Users\ASUS\Documents\Codex\output\pdf\return-damage-follow-up.pdf'
npm.cmd test -- --no-cache
```

Without `RUN_POSTGRES_WORKFLOW_TESTS` the PostgreSQL test is skipped; without `DAMAGE_PDF_LAYOUT_SAMPLE` the real-PDF sample test is skipped. The PostgreSQL test never has a commit mode.

## Schema Reconciliation Completed (2026-10-05)

Read-only `prisma migrate diff` found differences between the current database and `schema.prisma`, including:

- `projects.project_id` is required by the live database but optional in the Prisma model.
- The live database has useful additional stock/history and JSON GIN indexes absent from the Prisma model.
- Some defaults, constraint names, and the project-approver delete action differ.
- The Prisma model specifies warehouse-prefix uniqueness not represented by the live database.

These differences have now been reconciled conservatively. Prisma declares the live required fields, defaults, legacy foreign-key names and existing indexes. Migration `20261005150000_reconcile_schema_indexes` adds only warehouse-prefix uniqueness and the project-member project-ID index; it refuses duplicate prefixes instead of rewriting data.

Post-deploy `prisma migrate diff` returns an empty migration. All existing index definitions are preserved. SHA-256 snapshots of all 30 business tables were compared: all tables except `users` were identical; the user-table change occurred during the user's authenticated login, not from migration DDL. Assets (1,550), asset models (690), stock histories (1,765), transactions, outcomes and return batches were unchanged.

Prisma Client regenerated successfully after restarting this project's dev server. Typecheck passes; lint has zero errors and four existing warnings. All 226 tests in 23 files pass with PostgreSQL rollback and real PDF rendering enabled.

The project-history restore path now rejects missing Project IDs before writes, matching the live NOT NULL requirement instead of attempting to restore null.

Audit command (read-only transaction, emits counts/hashes and index definitions, not row contents):

```powershell
npx.cmd tsx scripts/audit-schema-reconciliation.ts
```

Authenticated browser checks are in progress with the user logging in per role. No browser approval or stock-changing submission is performed on real requests.

### Browser Check: Requester

User signed in as Suebskul P. through normal LDAP login. Verified:

- Transaction Log shows `Continues` for outstanding in-use requests.
- `REQ-20261001-05` exposes a selectable return row for its requester, editable quantity and `Save Outcomes` after selection.
- In-memory partial quantity input of 1 from 6 is accepted; Split outcome adds a second quantity-5 row. The form was discarded by navigation without submitting.
- `REQ-20261001-03` shows Tanawat W. as the pending Lead for return round `REQ-20261005-06`, and the requester can remove the pending outcome. No Lead/Storeman action is exposed to this requester.
- No console warning/error was captured on the tested return page.

### Browser Check: Lead/Supervisor

User signed in as Tanawat W. through normal login. The pending round `REQ-20261005-06` correctly shows Tanawat as Current Step and exposes Approve/Reject. Opening Approve displays a confirmation dialog; it was cancelled without posting. The Lead cannot edit/remove the requester's outcomes or perform Storeman manual checks.

Browser testing found a real queue bug: the Approve tab omitted active return rounds on an IN_PROGRESS source transaction. The queue now loads SUBMITTED return rounds regardless of the source workflow, selects only current approval revisions, and compares pending steps within the same resolution batch. Acknowledgements remain independent. Return queue rows show the return request number, original request reference, round date and only the returned items/quantities. The sidebar count uses the same corrected query.

Verified after reload that Tanawat sees exactly one queued return (`REQ-20261005-06`, from `REQ-20261001-03`) and View Detail opens its approval page. Added six queue regression tests. Latest full verification: **232 tests passed, 24 files**, including PostgreSQL rollback and real PDF rendering; Typecheck passes and lint has no errors (four existing warnings).

### Browser Check: Suriya (Storeman)

User signed in as Suriya K. through normal login. On return round `REQ-20261005-06`, still awaiting Tanawat's Lead approval, Storeman manual-check controls are disabled, Approve/Reject return actions are absent, and requester outcome editing/deletion is unavailable.

The header's former `Confirm` action was verified by opening its dialog: it is an acknowledgement of the original request, not return approval. The dialog was cancelled without saving. Renamed this header action to `Acknowledge`, its dialog to `Acknowledge Request`, and queue `Step 999` labels to `Acknowledgement` to distinguish non-gating receipt from approval.

Suriya's queue contains three original-request acknowledgement tasks and does not expose the Lead-pending return as a Storeman task. Installation, Network and Sale Stock screens have no Request buttons or Request Cart links. The explicitly deferred legacy round from `REQ-20260930-01` remains blocked from final approval with a migration-required message; no deferred data was migrated.

Typecheck and 18 focused queue/return-client/log tests pass after the acknowledgement-label change. Post-Lead manual checks, warehouse-specific stock-target controls and final Storeman browser approval remain untested: the current live round still awaits Lead, and no real approval was posted to advance it. Backend rollback integration tests cover these gates separately, but do not replace an authenticated browser test.

Other warehouse Storemen, BSD Staff and Admin browser checks remain pending the user's role-by-role login. No real request was approved, rejected or acknowledged during these checks.

### Browser Check: bsd (Sale Stock Storeman)

User signed in as `bsd`. Read-only database inspection confirms role STOREMAN and canManage only SALE_STOCK; SERVER, INSTALLATION and NETWORK are view-only. This account is not the BSD_STAFF sales-pricing assignment.

Verified the Installation return awaiting Lead (`REQ-20261005-06`) exposes no Approve/Reject, no editable condition/stock target, no outcome deletion and no enabled manual-check control to bsd. Its approval queue is empty. Sale Stock has no Request buttons or Request Cart link for this Storeman. The previously completed Backpack outcome remains read-only and the explicitly deferred legacy round remains migration-blocked. No browser console warning/error was captured during these checks.

This verifies negative authorization while Lead is pending, not the positive post-Lead Sale Stock approval path: there is no active Sale Stock return at that step in the existing live requests. No approval or inventory mutation was performed. BSD_STAFF and Admin authenticated browser checks remain outstanding.

### Browser Check: Surarux (BSD Staff)

User signed in as Surarux S. Read-only inspection confirms application role USER and active organizational assignment BSD_STAFF; all listed warehouse permissions have canManage=false. The position label Sr.Administrator is not application ADMIN permission.

The Approve tab lists six acknowledgement tasks, all clearly labelled Acknowledgement. On the Installation return still awaiting Tanawat, Surarux cannot submit/remove requester outcomes, perform manual checks, choose a stock target, or approve the Lead/Storeman step; only the independent acknowledgement action appears.

The old derived SOLD transaction from `REQ-20260930-01` remains migration-blocked and has no price-entry/final-approval control available to Surarux. No active live sale is currently at the BSD pricing step. Therefore positive price-input, per-line/whole-request total calculation and final sales approval were not verified in the authenticated browser. PostgreSQL rollback tests cover direct and derived sale price/posting gates independently. No prices, acknowledgements, approvals or inventory changes were saved. No console warning/error was captured on the inspected pages.

Admin browser checks and positive post-Lead Storeman/BSD browser flows still require suitable accounts and approved test requests; completed/deferred real requests were not altered to manufacture these cases.

### Browser Check: Admin

User signed in as Admin User. On another requester's active quantity request `REQ-20261001-05`, Admin can view all six outstanding units but cannot select return items, input quantities, split outcomes or save returns. The page states that only the original requester can return the transaction.

On `REQ-20261001-03` and its Lead-pending return `REQ-20261005-06`, Admin has no outcome deletion/editing, condition/stock-target selection, enabled manual checks, or Approve/Reject action. Current Step remains Tanawat W. The Admin approval queue is empty rather than granting an administrative approval bypass. No console warning/error was captured. No stock, outcome or approval writes were made.

### Browser Coverage Boundary

Normal-login browser inspection is now complete for requester Suebskul, Lead Tanawat, Storeman Suriya, Sale Stock Storeman bsd, BSD Staff Surarux and Admin User. This covers the existing live pages and negative authorization before Lead approval, not an end-to-end approval simulation.

Still outstanding in the browser: post-Lead own-warehouse manual checks, USED stock-target selection, all-warehouse final approval/document gates, BSD unit-price/line-total/request-total entry, final direct-sale posting, and derived-sale completion. These require disposable authorized test requests (preferably an isolated test database) because advancing live requests would create real approval history and potentially change stock. Backend rollback integration coverage is available, but these browser steps must not be described as already tested.

### Authorized Live-Database Browser Test Fixtures

The user explicitly authorized continuing on the current database, including real stock impact. To keep the test identifiable, new fixture stock was created instead of modifying pre-existing equipment or advancing deferred legacy requests. No user permissions or role assignments were changed.

Marker: `QA-BROWSER-20261005`. Script: `scripts/create-browser-workflow-fixtures.ts --apply`; creates everything in one SERIALIZABLE transaction, and reruns do not reset existing fixtures.

| Stock Code | Initial Qty | Condition | Tracking | Asset ID |
| --- | ---: | --- | --- | --- |
| IN-QA-20261005-NEW | 20 | NEW | Quantity | 78931a06-f0e1-4269-86f8-2140b3a898c1 |
| IN-QA-20261005-USED | 3 | USED | Quantity | 16d1779d-a896-4078-8201-21213effd15b |
| IN-QA-20261005-SERIAL | 1 | NEW | Serial | 8827eb12-e02a-4263-8ec8-5a67d2b27dcc |
| SS-QA-20261005-NEW | 20 | NEW | Quantity | e92d3ab3-bcad-4037-8983-0c099e6d2e8a |
| SS-QA-20261005-USED | 3 | USED | Quantity | 87969454-9766-4164-9573-7d8315df1c16 |

Serialized fixture serial: `QA-BROWSER-20261005-SN001`. These assets are explicitly labelled TEST ONLY / not real equipment. Three new asset models were created for test data, not from normal USED-return processing: each quantity model owns both its NEW and USED fixture rows.

Planned authenticated browser flow: original requester submits a multi-warehouse issue; Tanawat approves Lead; Suriya and bsd approve their own warehouse; verify full atomic issue; requester submits partial mixed outcomes; Lead approves; Storemen inspect only their own items and select existing USED Stock Codes; exercise damage-document gates without misrepresenting a test document as an actual executive signature; final warehouse approvals post non-sale outcomes; Surarux enters prices and confirms the derived sale. Direct-sale, rejection/resubmission and remaining-quantity rounds follow as available. These steps are not yet completed.

Deferred `(Used)` master merges and the old pending SOLD migration remain excluded despite authorization to test on this database.

### Live Browser Issue Submission: 2026-10-06

Authenticated requester Suebskul submitted `REQ-20261006-07`, transaction `618344a2-3c09-4b9b-8de2-c01bf13e6355`, through the browser. Type BORROW, scope Service, customer `QA TEST ONLY - internal workflow verification`, purpose marked `QA-BROWSER-20261005` / TEST ONLY.

| Item | Requested Qty | Transaction Item ID |
| --- | ---: | --- |
| IN-QA-20261005-NEW | 10 | ba741fba-ec53-4df1-a050-644c74e16704 |
| SS-QA-20261005-NEW | 5 | 36d17f4d-840a-4b71-908a-b258418188b0 |
| IN-QA-20261005-SERIAL | 1 | ecc3bbe0-4da7-4f6d-8b89-400819253ef6 |

Browser confirms three lines / sixteen units, an empty cart after submission, and Tanawat W. as Current Step for all three items. Requester can edit the pending request before the next approver acts; return controls remain disabled until issue approval completes.

Read-only database verification: workflowStatus PENDING; REQUESTER step 1 APPROVED; Tanawat C1_SUPERVISOR step 2 PENDING; Suriya STOREMAN:INSTALLATION and bsd STOREMAN:SALE_STOCK step 3 PENDING. Physical quantities remain NEW 20/20, USED 3/3, serial 1. Serialized status REQUEST is a reservation, not issuance, and serial remains QA-BROWSER-20261005-SN001. Transaction status BORROWED is the existing business-type status and does not establish completed fulfillment while workflowStatus is PENDING.

Observed UI behavior: Create new request adds stock to the held draft cart; Add to existing targets a pending submitted transaction, not the draft cart. Draft detail fields are not preserved on navigation. Service requires Customer Name; client validation correctly blocked submission until supplied. No legacy requests were advanced. Lead and Storeman positive approval checks remain outstanding.

### Live Browser Lead Approval: 2026-10-06

Tanawat W. signed in normally and approved only QA request `REQ-20261006-07` using Approve -> Confirm. Database actedAt is `2026-10-06T02:25:58.727Z` (09:25:58 Asia/Bangkok). C1_SUPERVISOR step 2 is APPROVED; both warehouse-specific step 3 approvals remain PENDING and workflowStatus remains PENDING.

After refresh, the browser no longer exposes Approve/Reject to Tanawat for this request. Current Step is Suriya K. for IN-QA-20261005-NEW and IN-QA-20261005-SERIAL, and bsd for SS-QA-20261005-NEW. Return controls remain disabled. Read-only database check confirms NEW quantities still 20/20, USED quantities still 3/3, serialized quantity still 1 with status REQUEST and unchanged serial. No issuance was posted by Lead approval. Storeman positive checks and atomic final issue are the next pending test phase; no deferred legacy request was advanced.

### Live Browser Installation Approval and Serial UI Fix: 2026-10-06

Suriya's initial Approve -> Confirm was safely rejected with SERIAL_DISPATCH_REQUIRED: the backend required serialized issue confirmation, but the page had no confirmation control. No approval or stock mutation was committed by that failed attempt.

Added an own-warehouse `Confirm serial` control for the original BORROW/USING issue only. Eligibility requires the current warehouse Storeman approval, PENDING workflow, REQUEST serialized asset with an existing serial, no source transaction, no outcomes and no prior serial confirmation. The control uses the existing authenticated swap API with the same asset ID; its server-side warehouse and workflow validation remains unchanged. It is not exposed during returns, derived sales, other warehouses or Lead approval. Focused tests: 13 visibility cases plus 28 workflow-return tests passed; typecheck passed.

Browser: Suriya confirmed QA-BROWSER-20261005-SN001 without changing it, then approved. Only STOREMAN:INSTALLATION became APPROVED; STOREMAN:SALE_STOCK remains PENDING. Suriya's Approve/Reject controls disappeared. Installation rows show Awaiting approval; Sale Stock shows bsd. Database quantities remain NEW 20/20, USED 3/3, serial 1/REQUEST with unchanged serial. Quantity dispatchedAt fields remain null. The existing serial-confirmation API records its confirmation in dispatchedAt/dispatchedById before physical issue; this metadata does not mean stock has been issued (asset remains REQUEST). Final all-warehouse posting is still pending the authenticated bsd test.

### Live Browser Final Issue Approval: 2026-10-06

User signed in as bsd (STOREMAN) and approved only QA request REQ-20261006-07 through Approve -> Confirm. Before approval, Sale Stock Current Step was bsd; Installation rows were Awaiting approval. No serial-confirmation control was exposed to bsd for the Installation item.

All operational approvals are now APPROVED and workflowStatus is IN_PROGRESS. Read-only database verification confirms IN-QA-20261005-NEW 20 -> 10, SS-QA-20261005-NEW 20 -> 15, both USED rows unchanged at 3, and serialized fixture REQUEST -> BORROW with unchanged QA-BROWSER-20261005-SN001. All three item dispatchedAt values are 2026-10-06T02:36:43.468Z (09:36:43 Asia/Bangkok), including replacing the earlier serial-confirmation timestamp with actual issue time. This verifies complete, simultaneous issue after the last warehouse approval, not partial warehouse issuance.

ACK_BSD and ACK_WAREHOUSE_MANAGER were created as PENDING without blocking physical issue or IN_PROGRESS state. The browser displays Approved / Ready for return for all items; bsd has no Approve/Reject or return-input controls after fulfillment and is told only the original requester can return. Next test requires Suebskul's normal login to submit mixed partial outcomes. Return document/approval and BSD sale-price positive browser tests remain outstanding.

### Live Browser Mixed Partial Return: 2026-10-06

Suebskul submitted nine outcomes / fourteen units through Save Outcomes -> Confirm, on issued QA request REQ-20261006-07. Installation: RETURN 2, USED 3, FAIL 2, LOST 1, SOLD 1 (one of ten still in use). Sale Stock: RETURN 2, USED 1, SOLD 1 (one of five still in use). Serialized fixture: RETURN 1, unchanged serial. Remarks explicitly mark simulated damage/loss and sale as QA TEST ONLY.

Return round REQ-20261006-08, batch d3eb43b5-a678-4432-a5b7-9b0844056fa6, is SUBMITTED. All nine outcomes have approvedAt null. Derived sale b3184c6e-e7c8-4b32-a00f-68f6044f4880 displays From REQ-20261006-07, two lines / two units, without consuming another request number. Current Step is Tanawat W.; manual-check boxes are disabled before Lead. Requester sees pending outcome removal and editable round selection. Transaction log Return Date shows Continues.

Database confirms no stock posting on return submission: NEW 10/15, USED 3/3, serialized BORROW. Found a client bug hiding the remaining two units because any pending outcome locked the entire item. Fixed open-item and input-maximum calculations to subtract approved quantities and pending quantities in other rounds, not warehouse on-hand stock; selected editing round quantities are available for revision. Initial input quantities use this remaining amount. Added five quantity regression tests; together with existing client/revision and workflow-return tests, 39 tests passed and typecheck passed.

Authenticated browser after reload confirms 2 open / 3 total (2 qty remaining), quantity-one inputs and selection actions available on both quantity rows while this round remains pending. Serialized row remains Awaiting approval without serial-change control. The remaining units were not submitted; Lead approval of REQ-20261006-08 is next. Damage-PDF, upload/final-warehouse and BSD pricing tests remain outstanding.

### Live Browser Return Lead Approval: 2026-10-06

Tanawat W. approved only QA return round REQ-20261006-08 through Approve -> Confirm. Its current C1_SUPERVISOR approval is APPROVED at 2026-10-06T02:50:54.238Z (09:50:54 Asia/Bangkok). Both RETURN_CHECK:INSTALLATION and RETURN_CHECK:SALE_STOCK remain PENDING, as do their later STOREMAN final approvals. The batch remains SUBMITTED. The separate BSD_STAFF sale approval remains PENDING; no sale price or stock posting was performed.

The browser removes Tanawat's Approve/Reject controls after successful approval. Current Step maps Installation quantity and serial items to Suriya K., and Sale Stock to bsd, without assigning another warehouse's Storeman. Remaining quantity stays two units across two open items. Tanawat cannot perform manual checks or edit outcomes. Read-only database verification confirms NEW quantities 10/15, USED 3/3, serial BORROW with unchanged QA-BROWSER-20261005-SN001. No deferred legacy request was advanced. Next: authenticated own-warehouse manual checks, existing USED stock-code selection, damage document and final approvals.

### Live Browser Installation Return Manual Check: 2026-10-06

Suriya K. signed in normally and reviewed QA round REQ-20261006-08. All three Sale Stock checkboxes were disabled, with no Sale Stock target selector. Six Installation outcomes were selectable: RETURN 2, USED 3, serialized RETURN 1, FAIL 2, LOST 1, SOLD 1. Selected existing IN-QA-20261005-USED for USED and used Check Selected. After refresh, all six own-warehouse checks were checked and disabled; RETURN displays original IN-QA-20261005-NEW, USED displays existing IN-QA-20261005-USED. No replacement serial control appeared.

Read-only database verification: RETURN_CHECK:INSTALLATION became APPROVED at 2026-10-06T03:08:54.864Z (10:08:54 Asia/Bangkok), exactly six outcome checks were recorded for Suriya, and RETURN_CHECK:SALE_STOCK remains PENDING. The USED outcome targets asset 16d1779d-a896-4078-8201-21213effd15b; no new stock asset was created by this check. All outcome approvedAt values remain null. NEW stock remains 10/15, USED 3/3, serial BORROW. No final operational approval or damage-document generation control was exposed while the other warehouse check is pending. The independent Acknowledge and general Export PDF controls are not final return approval or damage-document generation. Next: bsd's Sale Stock checks, then combined damage-document generation.

### Live Browser Sale Stock Check and Damage PDF: 2026-10-06

bsd signed in normally. Only the three Sale Stock outcomes were selectable; all Installation controls were disabled. Selected existing SS-QA-20261005-USED for USED 1 and confirmed RETURN 2, USED 1, SOLD 1 using Check Selected. Both RETURN_CHECK warehouse approvals are now APPROVED; UI displays Checked and enables Download PDF. After generating the PDF, Upload Signed PDF becomes available, with final approval still gated by signed evidence.

Generated damage PDF inspected by text extraction and Poppler rendering: one A4 page, four rows (FAIL 2, LOST 1, Installation USED 3, Sale Stock USED 1), no normal RETURN or SOLD rows. Signatures are original requester, Tanawat, Suriya and bsd exactly once, with an empty Executive Authorized area. Found hardcoded Project checkbox in the damage renderer; replaced it with original transaction Internal/Service/Project flags and added three regression cases. Focused PDF/service tests: 28 passed, one optional layout sample skipped; typecheck passed. Only the unsigned QA round's cached PDF was invalidated and regenerated. Corrected PDF now marks Service. No signed or legacy document was changed.

Stock remains NEW 10/15 and USED 3/3, serialized BORROW with its original serial. No return stock posting or BSD pricing has occurred. Browser download-event capture timed out, but database generation succeeded; the exact persisted PDF was exported read-only to C:/Users/ASUS/Documents/Codex/qa-return-20261006-08-damage.pdf for inspection. Next step requires the user's signed test evidence or an explicitly approved, clearly marked non-executive test PDF; do not fabricate an executive signature.

### Live Browser Uploaded Evidence and Sale Stock Final Approval: 2026-10-06

User uploaded qa-return-20261006-08-damage.pdf themselves. The application displays Signed PDF; database signedAt is 2026-10-06T03:29:47.281Z. This verifies upload acceptance only, not authenticity or presence of an executive wet signature in the uploaded content.

In the authenticated bsd session, Approve -> Confirm approved only STOREMAN:SALE_STOCK at 2026-10-06T03:30:28.742Z. STOREMAN:INSTALLATION remains PENDING; BSD_STAFF remains PENDING. The Sale Stock row now shows Awaiting approval rather than another warehouse's Storeman name, while Installation rows show Suriya K. bsd's Approve/Reject controls disappear. Batch remains SUBMITTED, zero outcomes have approvedAt populated, and physical stock is still NEW 10/15, USED 3/3, serialized BORROW with unchanged serial. No partial warehouse stock posting occurred. Next: Suriya's final approval, then verify atomic non-SOLD posting and separate BSD pricing.

### Live Browser Atomic Non-SOLD Return Posting: 2026-10-06

Suriya signed in normally and approved the final Installation step using Approve -> Confirm. STOREMAN:INSTALLATION became APPROVED at 2026-10-06T03:34:23.493Z; the seven non-SOLD outcomes share exactly that approvedAt timestamp. Return batch is COMPLETED for its operational return stage. Two SOLD outcomes remain unapproved and the separate derived sale remains workflowStatus PENDING (its legacy business status COMPLETED alone is not sale approval).

Physical stock: Installation NEW 10 -> 12, existing Installation USED 3 -> 6, Sale Stock NEW 15 -> 17, existing Sale Stock USED 3 -> 4. Serialized fixture BORROW -> READY with original QA-BROWSER-20261005-SN001 and quantity one. Audit history records each quantity before/after/change and condition. FAIL 2 and LOST 1 generate source-stock audit remarks with quantityChanged 0; neither adds to available stock nor changes the source pool away from READY. SOLD has not been posted or priced and no second stock decrement occurred.

Browser shows serialized item Completed / Ready; the two quantity items point to Surarux for their pending SOLD portions, and counter stays 2 open / 3 total (2 qty remaining). Source workflow stays IN_PROGRESS, correctly retaining one unsubmitted unit in each quantity item. Suriya no longer has Approve/Reject controls for this round. Next: normal Surarux/BSD Staff login to test line pricing, totals and sale finalization, then original requester actionability of the remaining two units.

### Live Browser BSD Derived Sale Pricing: 2026-10-06

Surarux signed in normally as BSD Staff. Opening the derived QA sale initially displayed an incorrect legacy-migration warning and hid pricing. Fixed two UI gates: derived approval batch IDs must be checked against the linked source outcomes and registered source batches, not the derived transaction's own batch table; source operational completion must exclude BSD pricing and acknowledgement steps to avoid waiting for its own sale approval. Unrelated/missing source references still fail closed. Added regression cases; 39 page/workflow-return tests passed and typecheck passed.

After reload, Surarux alone received price inputs and Approve/Reject. Entered QA prices: Sale Stock 125.50 x 1, Installation 250.75 x 1. Live line totals were 125.50 and 250.75; Grand Total was 376.25. Approve -> Confirm completed the derived sale and populated both original SOLD outcomes at 2026-10-06T03:39:10.060Z. Prices were persisted on derived items and source outcomes. transactionNo remains null and sourceTransactionId unchanged, so no new request number was allocated.

Database confirms no duplicate stock decrement: Installation NEW/USED remain 12/6, Sale Stock NEW/USED remain 17/4, serial READY. Source workflow remains IN_PROGRESS because two units are still in use. Source summary displays both sale prices, line totals and approval timestamp. Residual presentation gaps observed on the completed derived page: it still shows a return-specific not-fully-approved notice and 2 open / 2 total despite completed sale workflow; these do not affect posted quantities but need a dedicated sale display follow-up. Original requester remaining-unit controls and full combined sale PDF inspection are still outstanding; deferred legacy transactions remain untouched.

### Live Browser Original Requester Remaining Quantity: 2026-10-06

Suebskul signed in normally after the mixed return and BSD sale completion. Source QA request displays 2 open / 3 total (2 qty remaining). Both quantity rows are Approved / Ready for return with selectable checkboxes, RETURN outcome, and quantity one. The HTML max attribute is one for each quantity input. Selecting both rows enables Save Outcomes. The returned serialized row remains Completed / Ready, has no return checkbox or outcome input, and retains its original serial. This verifies that previous completed return and sale do not lock remaining in-use quantities or reopen the completed serialized item.

No second return round was submitted and no additional database mutation was made in this check. The two remaining units intentionally remain in use. This is browser actionability/maximum verification, not a new server-side over-quantity submission test. The earlier atomic return, signed-evidence upload acceptance and separate BSD price posting checks are completed for the QA round; direct-sale browser testing, reject/resubmit/cancel browser testing, final combined PDF review and the documented sale presentation gaps remain outstanding.

### Live Browser Final Remaining RETURN Round Submission: 2026-10-06

Suebskul submitted the final one unit from each quantity item as RETURN through Save Outcomes -> Confirm Return. Created REQ-20261006-09, batch 23a86da2-329c-4c2b-a52a-06eb7b0a041b, revision 1, SUBMITTED. Both rows show Tanawat W. as Current Step and Awaiting approval; pending summary outcomes expose Remove controls. The serialized item remains Completed. Available-to-submit counter is 0 open / 3 total (0 qty remaining); these two submitted units are still pending, not posted stock. Read-only database verification confirms NEW stock remains Installation 12 and Sale Stock 17.

Attempted Remove on the new Sale Stock pending outcome, but browser control timed out before the action could be verified. Database still contains both new outcomes with quantity one and approvedAt null. Do not count pending deletion, edit/resubmit, Lead approval, all-RETURN damage-document bypass, final warehouse approvals or full source completion as passed. No direct database mutation was used to bypass the browser. Resume with browser reconnection as Suebskul, then pending edit/deletion tests before switching to Tanawat. Historical completed outcomes and deferred legacy requests were not changed.

### Live Browser Pending Outcome Removal and Same-Number Resubmit: 2026-10-06

After the user refreshed the page, the original browser tab still failed to respond to automation. A new tab in the same in-app browser successfully retained Suebskul's normal session. It showed the pending Sale Stock outcome removed, only Installation pending, and Sale Stock available again with one unit. The exact successful removal timing cannot be attributed because the previous click timed out and the user refreshed between observations.

Selected existing round REQ-20261006-09, which exposed editable outcomes and Cancel Round. Re-selected Sale Stock quantity one, added a QA remark and used Resubmit Outcomes -> Confirm. Database and refreshed browser confirm the same batch and request number, revision 2, SUBMITTED, two pending RETURN outcomes quantity one each, both Current Step Tanawat W. Historical round REQ-20261006-08 retains all nine approved outcomes. NEW stock remains Installation 12 and Sale Stock 17. No new running number or stock movement was triggered by the resubmit. This verifies observed pending-removal recovery and successful same-number edit/resubmit before Lead; cancellation itself has not been executed. Next requires normal Tanawat login to test Lead approval and subsequent edit lock, then own-warehouse checks and the no-damage-document path.

### Live Browser Final RETURN Round Lead Approval: 2026-10-06

Tanawat signed in normally and approved QA return round REQ-20261006-09 revision 2 using Approve -> Confirm. Current C1_SUPERVISOR approval is APPROVED at 2026-10-06T04:19:58.993Z. Earlier revision approvals remain historical (isCurrent false) and were not reused. Current warehouse manual checks and final approvals remain PENDING. Refreshed browser hides Tanawat's Approve/Reject and maps Sale Stock to bsd and Installation to Suriya K. NEW stock remains Installation 12 and Sale Stock 17, confirming Lead approval does not post stock. Original-requester edit/cancel lock after this approval still requires a Suebskul browser check; viewing Tanawat's non-requester page alone is not proof of that lock. Next: requester lock check, then warehouse manual checks and all-RETURN document bypass.

### Live Browser Original Requester Lock After Lead: 2026-10-06

Suebskul signed back in normally. On the source QA return page after Lead approval of REQ-20261006-09 revision 2, Return round edit selector count is zero, Remove pending outcome button count is zero, Cancel Round button count is zero, and Save Outcomes is disabled. Both pending items retain own-warehouse Storeman names (bsd and Suriya), while the serialized item remains Completed. The separate Cancel link has href /logs and only navigates away; it is not batch cancellation. This verifies the original requester's browser edit/delete/cancel controls are locked after Lead approval. No new mutation was made in this check. Direct crafted API rejection is not covered by this browser observation. Next requires Suriya Installation manual check, then bsd Sale Stock check and no-damage-document final approval path.

### Live Browser Final RETURN Round Installation Check: 2026-10-06

Suriya signed in normally, with only Installation's one pending RETURN checkbox enabled and Sale Stock disabled. Check Selected confirmed Installation at 2026-10-06T04:23:13.965Z. RETURN_CHECK:INSTALLATION is APPROVED, RETURN_CHECK:SALE_STOCK and both final STOREMAN approvals remain PENDING. The checked Installation outcome targets the original asset 78931a06-f0e1-4269-86f8-2140b3a898c1. Both outcome approvedAt values remain null; NEW stock remains Installation 12 / Sale Stock 17. After the own-warehouse check, Approve and damage Download PDF are not exposed while Sale Stock has not checked. Acknowledge is separate and was not clicked. Next requires normal bsd login for Sale Stock manual check, followed by verification that all-RETURN final approvals do not require a damage PDF or signed upload.

### Live Browser All-RETURN Document Bypass and Sale Stock Final Approval: 2026-10-06

bsd signed in normally and could check only Sale Stock's remaining RETURN unit; Installation was disabled. Check Selected approved RETURN_CHECK:SALE_STOCK at 2026-10-06T04:25:15.736Z. Once both warehouse checks were complete, Approve/Reject appeared without damage Download PDF or Upload Signed PDF controls. Approve -> Confirm approved STOREMAN:SALE_STOCK at 2026-10-06T04:25:36.126Z. Persisted batch has no damagePdf, no signedPdf and signedAt null, verifying the normal RETURN-only evidence bypass works through UI and backend.

STOREMAN:INSTALLATION remains PENDING; batch remains SUBMITTED and both stocks are unchanged (Installation NEW 12, Sale Stock NEW 17). bsd's Approve control disappears after approval. Sale Stock Current Step is Awaiting approval rather than another warehouse's Storeman; Installation Current Step remains Suriya K. This verifies stock posting still waits for all warehouses. Next requires Suriya final approval, then stock 13/18, source full completion and final Return Date checks. Those final assertions are expectations, not yet passed results.

### Live Browser Final RETURN Posting and Source Completion: 2026-10-06

Suriya signed in normally and used Approve -> Confirm for the final Installation approval. Both new RETURN outcomes were approved together at 2026-10-06T04:44:22.573Z. Batch REQ-20261006-09 revision 2 is COMPLETED with no signed evidence required. Source REQ-20261006-07 is workflowStatus COMPLETED, status RETURNED, returnedAt and completedAt equal the posting timestamp. Installation NEW increased 12 -> 13 and Sale Stock NEW 17 -> 18; existing USED pools remain 6 and 4. Serialized fixture remains READY quantity one with unchanged QA-BROWSER-20261005-SN001. Both outcomes target their original asset IDs, not new stock rows.

Browser shows all three items Completed / Ready and 0 open / 3 total (0 qty remaining); Return Date is 06 Oct 2026, 11:44. Found a misleading not-fully-approved notice on completed requests. Added a completed-state-specific returnActionBlockedReason, preserving existing workflow and requester restrictions, with two regression tests. All 13 page tests and typecheck passed. Live browser now displays "This transaction is completed. No further return actions are available." No further stock mutations occurred during this presentation fix. Log-list row date was not independently verified in this turn; detail page and stored completion dates were verified. Direct-sale, rejection/resubmit after rejection, cancellation execution, invalid/concurrent requests and final combined sale PDF remain separate outstanding cases.

### Live Browser Rejection Fixture Request Creation: 2026-10-06

Suebskul created QA request REQ-20261006-10 (294b4d4e-926f-463c-8a7b-0c1bed83fab6), Borrow / Service, customer QA TEST ONLY - rejection verification. Includes Installation NEW quantity 2 and Sale Stock NEW quantity 2. Workflow PENDING; requester confirmation APPROVED, C1_SUPERVISOR and both own-warehouse STOREMAN approvals PENDING. Both dispatchedAt values are null and physical quantities remain 13/18. Browser log confirms 2 lines / 4 qty and Pending; original completed REQ-20261006-07 now also visibly has an actual 6 Oct 2026 return date in the log.

Found a draft usability defect: entering Service/customer/note in Request Cart and navigating to another warehouse loses those unsaved fields, and Add to existing targeting that unsubmitted draft fails with Choose either Service or Project. No failed add mutated Sale Stock. Submitted the Installation-only draft with valid Service fields, then successfully added Sale Stock using Add to existing on the explicitly selected QA REQ-20261006-10 before Lead acted. No unrelated Internal draft was selected. Draft field persistence/add-to-draft defect is not yet fixed and is recorded separately. Next requires normal Tanawat login to reject this QA request; rejection/reopen/resubmit has not yet been tested for this request.

### Live Browser Lead Rejection of Issue Request: 2026-10-06

Tanawat signed in normally and rejected only QA REQ-20261006-10 via Reject -> QA reason -> Confirm. Current C1_SUPERVISOR status is REJECTED, actedAt 2026-10-06T07:36:44.382Z, with the QA reason retained. Browser shows Request Rejected, Tanawat's name and time, and the log row status Rejected. Approve/Reject no longer appear for Tanawat. Source workflowStatus is REJECTED, completedAt null, same request number unchanged. Both item dispatchedAt values remain null, physical stock Installation NEW 13 / Sale Stock NEW 18 and READY. Later warehouse approval records remain PENDING but must not be actionable while rejection is awaiting requester correction. Stock reservation release was not independently verified in this turn. Next: Suebskul original requester edit/resubmit, same-number preservation and fresh approval history; these have not yet been counted as passed.

### Live Browser Return Rejection-Recovery Fixture: 2026-10-06

Suebskul submitted a new QA return round from REQ-20261006-10: Installation RETURN 1 and Sale Stock RETURN 1, leaving one unit outstanding in each item. Created REQ-20261006-12, batch 2967892d-c7ee-4835-838f-82d55266779d, SUBMITTED. REQUESTER is APPROVED; C1_SUPERVISOR, both warehouse checks and both final Storeman approvals are PENDING. Browser shows Tanawat for both current steps, 2 open / 2 total (2 qty remaining), both remaining unit inputs and selection controls available, and only the two new pending outcomes. Cancelled round REQ-20261006-11 remains historical and is excluded from pending quantities. Physical stock stays Installation 11 / Sale Stock 16. Log Return Date is Continues. Next requires Tanawat to reject this return batch; rejected-return correction and same-number resubmission are not yet tested.

### Live Browser Partial Return Cancellation and Visibility Fix: 2026-10-06

Suebskul submitted Installation RETURN quantity 1 from QA REQ-20261006-10, creating REQ-20261006-11 (178ad97c-c41d-483e-9231-f7ae6ea7aad4). Before cancellation the new-round view correctly showed 3 remaining quantity and kept both items actionable. Browser automation could not complete the native window.confirm cancellation; the user completed it manually. Database confirms batch CANCELLED at 2026-10-06T08:19:56.463Z, no current batch approvals, retained unapproved outcome quantity 1 for audit, source IN_PROGRESS and unchanged physical stocks 11 / 16.

Found a presentation defect: cancelled outcome records were still serialized as pending, subtracting one unit and showing Awaiting approval. Added excludeCancelledReturnOutcomes at the return-page serialization boundary using persisted batch state; cancelled history is retained in the database but excluded from actionable quantities, item pending status and pending outcome summary. Added regression coverage for cancelled exclusion, audit-array preservation and completed/rejected/legacy record preservation. All 15 return-page tests and typecheck pass. Live browser reload now shows 2 open / 2 total (4 qty remaining), both quantity inputs 2, both rows Approved / Ready for return, and no pending summary from the cancelled round. This verifies cancellation before Lead restores actionable quantities without stock posting. Full-suite and concurrent cancellation testing were not performed in this turn.

### Live Browser Full Issue After Rejection Recovery: 2026-10-06

bsd signed in normally and approved the final warehouse for QA REQ-20261006-10 through Approve -> Confirm. Current STOREMAN:SALE_STOCK is APPROVED at 2026-10-06T08:14:10.668Z. Both items dispatchedAt equal that timestamp; Installation physical quantity changed 13 -> 11 and Sale Stock 18 -> 16, exactly matching the latest requested quantities 2 / 2. Source workflowStatus is IN_PROGRESS, status BORROWED and completedAt remains null because borrowed items are still outstanding. Both quantity pools remain READY for their remaining inventory. ACK_BSD and ACK_WAREHOUSE_MANAGER are PENDING and did not gate issuance. Browser hides approval buttons and shows both rows Approved / Ready for return; bsd sees Only the original requester can return this transaction, with Save Outcomes disabled. This verifies successful full issuance after Lead rejection and subsequent warehouse rejection/edit/resubmit recovery, with observed stock deltas and matching dispatch timestamps. Concurrent duplicate approval attempts and stock movement ledger counts were not independently tested. Next suggested browser cases: requester partial return cancellation/rejection recovery, then direct sale.

### Live Browser Installation Approval After Warehouse-Rejection Recovery: 2026-10-06

Suriya signed in normally and approved the latest revision of QA REQ-20261006-10 through Approve -> Confirm. Current STOREMAN:INSTALLATION is APPROVED at 2026-10-06T08:06:17.871Z, while STOREMAN:SALE_STOCK remains PENDING with actedAt null. Browser hides Suriya's approval controls, shows Installation Awaiting approval and Sale Stock bsd. Workflow remains PENDING, quantities remain 2 / 2, both dispatchedAt values are null and physical stock remains 13 / 18. This is a fresh Installation approval, not the previous revision's approval. Final Sale Stock approval and expected atomic stock change to 11 / 16 have not yet been executed.

### Live Browser Lead Approval After Warehouse-Rejection Recovery: 2026-10-06

Tanawat signed in normally and approved the latest revision of QA REQ-20261006-10 through Approve -> Confirm. Current C1_SUPERVISOR is APPROVED at 2026-10-06T08:00:12.212Z; both new current STOREMAN approvals remain PENDING with actedAt null. Refreshed browser removes Tanawat's approval controls and maps Installation to Suriya K. and Sale Stock to bsd. Quantities remain 2 / 2, both dispatchedAt values remain null, physical stock remains 13 / 18 and workflowStatus remains PENDING. Next: both warehouses must approve this revision before complete issuance; this final posting has not yet occurred.

### Live Browser Resubmit After Warehouse Rejection: 2026-10-06

Suebskul signed in normally and could edit QA REQ-20261006-10 after Sale Stock rejection despite Installation having approved the previous revision. Changed quantities from Installation 3 / Sale Stock 1 to 2 / 2 and updated the QA note, then clicked Save Pending Request. The same transaction ID and number remain, workflowStatus returns to PENDING and completedAt is null. New current REQUESTER confirmation is APPROVED at 2026-10-06T07:53:20.226Z. New current C1_SUPERVISOR, STOREMAN:INSTALLATION and STOREMAN:SALE_STOCK records are all PENDING with actedAt null. Previous Lead and Installation APPROVED records and Sale Stock REJECTED record remain preserved with isCurrent false; no prior approval carries into the new revision. Browser removes the rejection notice and shows Tanawat W. for both item rows. Both dispatchedAt values remain null and physical stock stays Installation 13 / Sale Stock 18. Reservation quantities and cancellation execution remain unverified. Next: Lead approval of this revision followed by both warehouses approving to verify complete issuance after rejection recovery.

### Live Browser Second Warehouse Rejection of Whole Issue: 2026-10-06

bsd signed in normally and rejected QA REQ-20261006-10 through Reject -> QA reason -> Confirm after Installation approval. Current STOREMAN:SALE_STOCK is REJECTED at 2026-10-06T07:51:18.824Z. Transaction workflowStatus is REJECTED, completedAt remains null, and the request number is unchanged. The earlier Lead and Installation approvals remain recorded as APPROVED for this revision. Refreshed browser displays Request Rejected with bsd's reason/name/time, both item rows Rejected, and no Approve/Reject actions for bsd. Both dispatchedAt values remain null and physical stocks remain Installation 13 / Sale Stock 18. No partial issue was posted. Next requires Suebskul to verify correction/resubmission after Storeman rejection and fresh approval steps for both warehouses; this has not yet been executed. Reservation release was not independently verified.

### Live Browser First Warehouse Issue Approval Without Posting: 2026-10-06

Suriya signed in normally and approved QA REQ-20261006-10 through Approve -> Confirm. Only current STOREMAN:INSTALLATION changed to APPROVED at 2026-10-06T07:45:10.777Z; STOREMAN:SALE_STOCK remains PENDING. Browser hides Suriya's Approve/Reject controls, shows Installation Current Step Awaiting approval and Sale Stock Current Step bsd. Transaction remains PENDING with completedAt null. Requested quantities remain Installation 3 / Sale Stock 1; both dispatchedAt values remain null and physical stocks remain 13 / 18. This verifies approval of the first warehouse does not partially issue stock or approve the other warehouse. Next requires normal bsd login to reject the second warehouse and verify whole-request rejection; rejection has not yet been executed in this revision.

### Live Browser Revised Issue Lead Approval: 2026-10-06

Tanawat signed in normally and approved the revised QA REQ-20261006-10 through Approve -> Confirm. The current C1_SUPERVISOR approval is APPROVED at 2026-10-06T07:43:35.790Z. Both current STOREMAN approvals remain PENDING. Refreshed browser hides Tanawat's approval actions and maps Installation to Suriya K. and Sale Stock to bsd. Requested quantities remain 3 and 1, both dispatchedAt values are null, and physical stock remains 13 / 18. No stock is posted by Lead approval. Next: Installation approval followed by Sale Stock rejection to verify all-warehouse issue rejection; that scenario has not yet been executed.

### Live Browser Rejected Issue Edit and Same-Number Resubmit: 2026-10-06

Suebskul signed in normally and edited rejected QA REQ-20261006-10: Installation quantity 2 -> 3, Sale Stock quantity 2 -> 1, and a revised QA note. Save Pending Request successfully resubmitted the same transaction ID and request number. Refreshed browser removed the rejection notice and shows Tanawat W. as Current Step for both rows. Database workflowStatus is PENDING and completedAt remains null. New current REQUESTER confirmation is APPROVED at 2026-10-06T07:41:09.144Z; new C1_SUPERVISOR and both own-warehouse STOREMAN approvals are PENDING. The previous Lead rejection and earlier approvals remain historical with isCurrent false. Both dispatchedAt values remain null and physical NEW stock stays Installation 13 / Sale Stock 18. Reservation quantities were not independently checked. Next requires Tanawat to approve the new revision, then testing one warehouse approval followed by the other warehouse rejection of the entire issue request.
