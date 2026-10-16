# Workflow Domain Modules

Refactor baseline: `e448968`, verified 2026-10-16. This is a structural change, not a new workflow specification. Business rules remain in [Rules](rule.md).

## Backend Map

External callers keep importing from `src/lib/workflow.ts`. It is a re-export-only facade, including the original types and the same WorkflowError class identity.

| Module under src/lib/workflow | Responsibility |
| --- | --- |
| request-workflow.ts | Hold/release request cart, submit, pending/rejected edits and adding items |
| approval-workflow.ts | Approve/reject/cancel, sale pricing, acknowledgements and approval posting orchestration |
| stock-movement.ts | Locks/reservations, dispatch, quantity adjustments, return stock buckets and serial allocation |
| return-workflow.ts | Partial/split outcomes, return rounds/revisions, derived sale and legacy return migration |
| approval-routing.ts | Resolve project/supervisor/warehouse approvers and build/replace approval rows |
| approval-guards.ts | Current-step, editable-round and final-return gate checks |
| shared.ts | Selectors, payload/internal types, error, identity/text validation and shared lookups |

Domain modules import each other directly, never through the facade. `modules.test.ts` guards against runtime dependency cycles and facade implementation creep.

## Transaction Contract

All 16 public transaction-owning functions were moved with their callback bodies and options unchanged, checked by comparing normalized TypeScript ASTs to the baseline. Internal helpers still receive the caller's Prisma.TransactionClient; they do not open nested transactions. No schema or migration changes are part of this refactor.

The only intentionally consolidated backend function bodies are the duplicate reservation sums, availability calculation and quantity-status refresh query delegation. Their stock rules remain unchanged:

- asset-availability.ts owns draft reservation sums and the unissued source-request predicate.
- Pending stock includes returnedAt=null, dispatchedAt=null, sourceTransactionId=null and PENDING/IN_PROGRESS source requests for BORROW/USING/SOLD.
- Available quantity is max(0, on-hand minus draft reservations minus pending unissued quantity).
- Already dispatched stock and derived sales are not reserved twice. Serial availability keeps its separate existing rule.

## Return UI Map

| File under src/features/transaction-return | Responsibility |
| --- | --- |
| transaction-return-client.tsx | Compose the page, existing edit controls and confirmation dialogs |
| useReturnTransaction.ts | Original state, derived values, effects, request handlers and fetching |
| return-transaction-state.ts | Types and pure allocation/revision/formatting helpers |
| ReturnItemsTable.tsx | Existing request/sale-pricing table and serial controls |
| OutcomeSplitFields.tsx | Existing inline allocation rows, add/remove and quantity/remark inputs; not a modal |
| TransactionSummaryPanel.tsx | Existing request/customer/project summary |
| ReturnSummaryPanel.tsx | Existing pending/approved outcome summary |

Original public helper/type imports from transaction-return-client.tsx remain re-exported for compatibility. Panels receive typed controller slices; state stays in the hook.

## Verification

- Compared the pre-refactor component to the new component using server-rendered HTML for return, pending edit, sale pricing and outcome summary states. Exact markup matched after normalizing only React-generated IDs.
- Golden snapshots were captured from that pre-refactor render and are now exercised by transaction-return-render.test.ts.
- Added six reservation parity/calculation tests and three module-boundary tests.
- Disposable PostgreSQL with all 58 migrations: 403 tests passed with no skips, including concurrency/auth/scope and the real PDF sample.
- Typecheck and lint passed without warnings. The hosted PR CI must also pass before merge.

Snapshots check initial rendered states, not browser interaction or every possible approval state. Existing handler/rule/integration tests remain necessary; this document does not claim exhaustive behavior equivalence from snapshots alone.
