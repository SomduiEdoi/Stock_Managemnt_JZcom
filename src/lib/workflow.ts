// Public workflow API. Domain modules keep their original transaction boundaries.
export { WorkflowError } from "./workflow/shared";
export type {
  HoldAssetsInput,
  SubmitTransactionInput,
  ResolveTransactionItemInput,
  ResolveTransactionInput,
  ReturnTransactionInput,
  DeleteReturnOutcomeInput,
  ReleaseAssetsInput,
  ChangeAssetStatusInput,
  RequestAssetItemInput,
} from "./workflow/shared";
export {
  findStoremanSerialOptions,
  swapStoremanSerialNumber,
  changeAssetStatus,
} from "./workflow/stock-movement";
export {
  holdAssetsForRequest,
  submitTransaction,
  updatePendingTransactionRequest,
  getEditablePendingRequestsForUser,
  addItemsToPendingTransaction,
  releaseAssetsFromRequest,
} from "./workflow/request-workflow";
export type { UpdatePendingTransactionRequestInput } from "./workflow/request-workflow";
export {
  getTransactionResolutionForUser,
  resolveTransactionItems,
  deletePendingReturnOutcome,
  cancelReturnBatch,
  migrateLegacyReturnBatch,
  returnTransactionItems,
} from "./workflow/return-workflow";
export {
  saveSalePriceDraft,
  approveTransaction,
  cancelTransactionRequest,
  rejectTransaction,
} from "./workflow/approval-workflow";
export type {
  ApproveTransactionInput,
  RejectTransactionInput,
} from "./workflow/approval-workflow";
